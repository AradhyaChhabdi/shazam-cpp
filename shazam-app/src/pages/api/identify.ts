import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";
import {
  generateFingerprints,
  matchFingerprints,
  Fingerprint,
} from "@/lib/cpp-engine";

interface SongDoc {
  _id: string;
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  genre?: string;
  fingerprints: Fingerprint[];
}

interface MatchResult {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  genre?: string;
  confidence: number;
}

interface CachedSong extends SongDoc {
  sampledHashSet: Set<number>;
}

function getEnvNumber(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

const SONG_CACHE_TTL_MS = 15 * 60_000;
const CANDIDATE_LIMIT = getEnvNumber("SHAZAM_CANDIDATE_LIMIT", 12, 4, 50);
const FULL_SCAN_MAX_SONGS = getEnvNumber(
  "SHAZAM_FULL_SCAN_MAX_SONGS",
  100,
  0,
  2000,
);
const MATCH_BATCH_SIZE = getEnvNumber("SHAZAM_MATCH_BATCH_SIZE", 4, 1, 20);
const TOP_RESULTS_LIMIT = 5;
const MATCH_CONFIDENCE_THRESHOLD = getEnvNumber(
  "SHAZAM_MATCH_CONFIDENCE_THRESHOLD",
  55,
  0,
  100,
);
const MAX_QUERY_FINGERPRINTS = getEnvNumber(
  "SHAZAM_MAX_QUERY_FINGERPRINTS",
  3000,
  500,
  10000,
);
const MAX_SAMPLED_HASHES_PER_SONG = 700;

let cachedSongs: CachedSong[] | null = null;
let cachedAt = 0;
let songsLoadingPromise: Promise<CachedSong[]> | null = null;

function buildSampledHashSet(fingerprints: Fingerprint[] = []): Set<number> {
  if (fingerprints.length === 0) {
    return new Set<number>();
  }

  const stride = Math.max(
    1,
    Math.ceil(fingerprints.length / MAX_SAMPLED_HASHES_PER_SONG),
  );
  const hashes: number[] = [];

  for (let i = 0; i < fingerprints.length; i += stride) {
    hashes.push(fingerprints[i].hash);
  }

  return new Set(hashes);
}

async function loadSongsWithCache(forceRefresh = false): Promise<CachedSong[]> {
  const now = Date.now();
  const hasCache = !!cachedSongs;
  const cacheExpired = hasCache && now - cachedAt >= SONG_CACHE_TTL_MS;

  // Fast path: valid cache.
  if (!forceRefresh && hasCache && !cacheExpired) {
    return cachedSongs;
  }

  // Stale-while-revalidate path: return stale cache immediately and refresh in background.
  if (!forceRefresh && hasCache && cacheExpired) {
    if (!songsLoadingPromise) {
      songsLoadingPromise = (async () => {
        try {
          const songs = (await Song.find({}).lean()) as unknown as SongDoc[];
          const indexedSongs: CachedSong[] = songs.map((song) => ({
            ...song,
            sampledHashSet: buildSampledHashSet(song.fingerprints),
          }));

          cachedSongs = indexedSongs;
          cachedAt = Date.now();
          return indexedSongs;
        } finally {
          songsLoadingPromise = null;
        }
      })();
    }

    return cachedSongs;
  }

  if (songsLoadingPromise) {
    return songsLoadingPromise;
  }

  songsLoadingPromise = (async () => {
    const songs = (await Song.find({}).lean()) as unknown as SongDoc[];
    const indexedSongs: CachedSong[] = songs.map((song) => ({
      ...song,
      sampledHashSet: buildSampledHashSet(song.fingerprints),
    }));

    cachedSongs = indexedSongs;
    cachedAt = Date.now();
    return indexedSongs;
  })();

  try {
    return await songsLoadingPromise;
  } catch (error) {
    throw error;
  } finally {
    songsLoadingPromise = null;
  }
}

function selectCandidateSongs(
  queryFingerprints: Fingerprint[],
  songs: CachedSong[],
): CachedSong[] {
  // For small catalogs, full scan gives better recall than aggressive pruning.
  if (songs.length <= FULL_SCAN_MAX_SONGS) {
    return songs;
  }

  if (songs.length <= CANDIDATE_LIMIT) {
    return songs;
  }

  // Sample hashes for fast candidate scoring when query is very long.
  const stride = Math.max(1, Math.floor(queryFingerprints.length / 400));
  const sampledHashes: number[] = [];
  for (let i = 0; i < queryFingerprints.length; i += stride) {
    sampledHashes.push(queryFingerprints[i].hash);
  }

  const queryHashSet = new Set(sampledHashes);
  const scored = songs
    .map((song) => {
      if (!song.fingerprints || song.fingerprints.length === 0) {
        return { song, overlap: 0 };
      }

      let overlap = 0;
      for (const hash of queryHashSet) {
        if (song.sampledHashSet.has(hash)) {
          overlap++;
        }
      }

      return { song, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, CANDIDATE_LIMIT)
    .map((item) => item.song);

  // If prefilter cannot find overlap (very noisy query), fallback to all songs.
  return scored.length > 0 ? scored : songs;
}

function reduceQueryFingerprints(
  queryFingerprints: Fingerprint[],
): Fingerprint[] {
  if (queryFingerprints.length <= MAX_QUERY_FINGERPRINTS) {
    return queryFingerprints;
  }

  const stride = Math.ceil(queryFingerprints.length / MAX_QUERY_FINGERPRINTS);
  const reduced: Fingerprint[] = [];

  for (let i = 0; i < queryFingerprints.length; i += stride) {
    reduced.push(queryFingerprints[i]);
  }

  return reduced;
}

interface ApiResponse {
  status: "match" | "no_match" | "error";
  results?: MatchResult[];
  message?: string;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
    responseLimit: false,
  },
};

/**
 * POST /api/identify
 * Submit audio for identification
 *
 * Request body: { audioData: number[] } - Float32Array data as JSON array
 * Response: { status, results: [{ title, artist, album, releaseYear, genre, confidence }] }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Method not allowed" });
  }

  const totalStart = Date.now();
  let parseAudioMs = 0;
  let generateFingerprintsMs = 0;
  let candidateFilterMs = 0;
  let finalMatchingMs = 0;

  const logTimings = (responseStatus: ApiResponse["status"]) => {
    console.log(
      `[identify][timing] ${JSON.stringify({
        parse_audio_ms: parseAudioMs,
        generate_fingerprints_ms: generateFingerprintsMs,
        candidate_filter_ms: candidateFilterMs,
        final_matching_ms: finalMatchingMs,
        total_ms: Date.now() - totalStart,
        response_status: responseStatus,
      })}`,
    );
  };

  try {
    await dbConnect();

    const parseStart = Date.now();

    // Parse audio data from request
    const { audioData } = req.body;

    if (!audioData || !Array.isArray(audioData)) {
      parseAudioMs = Date.now() - parseStart;
      logTimings("error");
      return res.status(400).json({
        status: "error",
        message: "Invalid audio data. Please provide audio samples.",
      });
    }

    // Convert to Float32Array
    const samples = new Float32Array(audioData);

    console.log(`[identify] Received ${samples.length} audio samples`);

    // Validate minimum duration (at ~11025Hz downsampled, ~5000 samples = ~0.5 second)
    if (samples.length < 5000) {
      parseAudioMs = Date.now() - parseStart;
      logTimings("error");
      return res.status(400).json({
        status: "error",
        message: "Insufficient Data: Audio must be at least 1 second long.",
      });
    }

    parseAudioMs = Date.now() - parseStart;

    // Generate fingerprints from query audio using C++ engine
    let queryFingerprints: Fingerprint[];
    const generateStart = Date.now();
    try {
      // Get sample rate from request or default to 11025 (downsampled)
      const sampleRate = req.body.sampleRate || 11025;
      const result = await generateFingerprints(samples, sampleRate);
      generateFingerprintsMs = Date.now() - generateStart;

      if (result.error) {
        console.error("[identify] C++ Engine error:", result.error);
        logTimings("error");
        return res.status(400).json({
          status: "error",
          message: result.error.includes("too short")
            ? "Insufficient Data: Audio must be at least 1 second long."
            : "Failed to process audio. Please try again.",
        });
      }

      queryFingerprints = result.fingerprints;
      console.log(
        `[identify] C++ Engine generated ${queryFingerprints.length} fingerprints (${result.peakCount} peaks)`,
      );
    } catch (error: any) {
      generateFingerprintsMs = Date.now() - generateStart;
      console.error("[identify] C++ Engine error:", error);
      throw error;
    }

    if (queryFingerprints.length === 0) {
      logTimings("error");
      return res.status(400).json({
        status: "error",
        message: "Audio unclear, please record again.",
      });
    }

    const candidateStart = Date.now();
    const allSongs = await loadSongsWithCache();

    if (allSongs.length === 0) {
      candidateFilterMs = Date.now() - candidateStart;
      logTimings("no_match");
      return res.json({
        status: "no_match",
        message: "No songs in database. Please add songs first.",
        results: [],
      });
    }

    const reducedQueryFingerprints = reduceQueryFingerprints(queryFingerprints);
    if (reducedQueryFingerprints.length !== queryFingerprints.length) {
      console.log(
        `[identify] Reduced query fingerprints: ${queryFingerprints.length} -> ${reducedQueryFingerprints.length}`,
      );
    }

    const candidateSongs = selectCandidateSongs(
      reducedQueryFingerprints,
      allSongs,
    );
    candidateFilterMs = Date.now() - candidateStart;
    console.log(
      `[identify] Candidate filtering: ${allSongs.length} -> ${candidateSongs.length}`,
    );

    const candidateSongsWithFingerprints = candidateSongs.filter(
      (song) => song.fingerprints && song.fingerprints.length > 0,
    );

    if (candidateSongsWithFingerprints.length === 0) {
      logTimings("no_match");
      return res.json({
        status: "no_match",
        message: "No songs with fingerprints available for matching.",
        results: [],
      });
    }

    // Match candidate songs in parallel batches.
    const matchingStart = Date.now();
    const matches: MatchResult[] = [];

    for (
      let i = 0;
      i < candidateSongsWithFingerprints.length;
      i += MATCH_BATCH_SIZE
    ) {
      const batch = candidateSongsWithFingerprints.slice(
        i,
        i + MATCH_BATCH_SIZE,
      );

      // Match all songs in batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (song) => {
          try {
            const matchResult = await matchFingerprints(
              reducedQueryFingerprints,
              song.fingerprints,
            );
            const confidence = matchResult.confidence;

            return {
              title: song.title,
              artist: song.artist,
              album: song.album,
              releaseYear: song.releaseYear,
              genre: song.genre,
              confidence: Math.round(confidence * 10) / 10,
            };
          } catch (error) {
            console.error(`Failed to match against ${song.title}:`, error);
            return {
              title: song.title,
              artist: song.artist,
              album: song.album,
              releaseYear: song.releaseYear,
              genre: song.genre,
              confidence: 0,
            };
          }
        }),
      );

      matches.push(...batchResults);
    }
    finalMatchingMs = Date.now() - matchingStart;

    // Sort by confidence descending and take top N
    matches.sort((a, b) => b.confidence - a.confidence);
    const topMatches = matches.slice(0, TOP_RESULTS_LIMIT);

    if (topMatches.length === 0) {
      logTimings("no_match");
      return res.json({
        status: "no_match",
        message: "No match found.",
        results: [],
      });
    }

    const hasStrongMatch =
      topMatches[0].confidence >= MATCH_CONFIDENCE_THRESHOLD;

    logTimings(hasStrongMatch ? "match" : "no_match");

    return res.json({
      status: hasStrongMatch ? "match" : "no_match",
      message: hasStrongMatch ? undefined : "No confident match found.",
      results: hasStrongMatch ? topMatches : [],
    });
  } catch (error: any) {
    console.error("Error in /api/identify:", error);
    logTimings("error");
    return res.status(500).json({
      status: "error",
      message: "Service Unavailable: Please try again later.",
    });
  }
}
