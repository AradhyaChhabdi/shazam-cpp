import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import dbConnect from "@/lib/mongodb";
import Song from "@/models/Song";
import { generateFingerprints, Fingerprint } from "@/lib/cpp-engine";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb", // Increased for audio data
    },
    responseLimit: false,
  },
};

interface SongData {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  genre?: string;
  audioData?: number[];
  fingerprints?: Fingerprint[];
}

/**
 * GET /api/songs - List all songs
 * POST /api/songs - Add new song (Admin only)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await dbConnect();

  if (req.method === "GET") {
    return handleGetSongs(req, res);
  } else if (req.method === "POST") {
    return handleAddSong(req, res);
  } else if (req.method === "DELETE") {
    return handleDeleteSong(req, res);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}

/**
 * DELETE - Remove a song (Admin only)
 */
async function handleDeleteSong(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?.isAdmin) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.query;
    const songId = Array.isArray(id) ? id[0] : id;

    if (!songId) {
      return res.status(400).json({ error: "Song ID required" });
    }

    if (!/^[a-f\d]{24}$/i.test(songId)) {
      return res.status(400).json({ error: "Invalid song ID" });
    }

    const result = await Song.findByIdAndDelete(songId);

    if (!result) {
      return res.status(404).json({ error: "Song not found" });
    }

    return res.json({ success: true, message: "Song deleted" });
  } catch (error) {
    console.error("Error deleting song:", error);
    return res.status(500).json({ error: "Failed to delete song" });
  }
}

/**
 * GET - List all songs in database
 */
async function handleGetSongs(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Use aggregation to get fingerprint count without loading all fingerprints
    const songs = await Song.aggregate([
      {
        $project: {
          title: 1,
          artist: 1,
          album: 1,
          releaseYear: 1,
          genre: 1,
          uploadedAt: 1,
          duration: 1,
          fingerprintCount: { $size: { $ifNull: ["$fingerprints", []] } },
        },
      },
      { $sort: { uploadedAt: -1 } },
    ]);

    return res.json({
      success: true,
      count: songs.length,
      songs: songs.map((song: any) => ({
        id: song._id.toString(),
        title: song.title,
        artist: song.artist,
        album: song.album || "",
        releaseYear: song.releaseYear || null,
        genre: song.genre || "",
        uploadedAt: song.uploadedAt,
        duration: song.duration || null,
        fingerprintCount: song.fingerprintCount || 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching songs:", error);
    return res.status(500).json({ error: "Failed to fetch songs" });
  }
}

/**
 * POST - Add new song (Admin only)
 */
async function handleAddSong(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log("[songs] Upload request received");

    // Check authentication
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?.isAdmin) {
      console.log("[songs] Unauthorized upload attempt");
      return res.status(401).json({
        error: "Unauthorized: Only administrators can upload songs.",
      });
    }

    console.log("[songs] User authenticated:", session.user.username);

    const {
      title,
      artist,
      album,
      releaseYear,
      genre,
      audioData,
      fingerprints,
    } = req.body as SongData;

    // Validate required fields
    if (!title || !artist) {
      return res.status(400).json({
        error: "Missing required fields: title and artist are required.",
      });
    }

    console.log(`[songs] Adding song: ${title} by ${artist}`);

    let songFingerprints: Fingerprint[] = [];

    // If audioData is provided, generate fingerprints
    if (audioData && Array.isArray(audioData) && audioData.length > 0) {
      console.log(`[songs] Processing ${audioData.length} audio samples`);
      const samples = new Float32Array(audioData);

      // At downsampled rate of ~11025 Hz, 1 second = ~11025 samples
      if (samples.length < 5000) {
        return res.status(400).json({
          error: "Audio too short. Minimum duration is 1 second.",
        });
      }

      try {
        // Use C++ engine for fingerprint generation
        // Sample rate is 11025 Hz after frontend downsampling
        const result = await generateFingerprints(samples, 11025);

        if (result.error) {
          console.error("[songs] C++ Engine error:", result.error);
          return res.status(400).json({
            error: `Failed to process audio: ${result.error}`,
          });
        }

        songFingerprints = result.fingerprints;
        console.log(
          `[songs] C++ Engine generated ${songFingerprints.length} fingerprints (${result.peakCount} peaks)`,
        );
      } catch (error: any) {
        console.error("[songs] C++ Engine error:", error);
        return res.status(400).json({
          error: `Failed to process audio: ${error.message}`,
        });
      }
    } else if (fingerprints && Array.isArray(fingerprints)) {
      // Use pre-computed fingerprints
      songFingerprints = fingerprints;
    }

    // Create new song
    const newSong = new Song({
      title,
      artist,
      album: album || "",
      releaseYear: releaseYear || null,
      genre: genre || "",
      fingerprints: songFingerprints,
      uploadedAt: new Date(),
      uploadedBy: session.user.id,
    });

    await newSong.save();

    return res.status(201).json({
      success: true,
      message: "Song successfully added to library.",
      song: {
        id: newSong._id.toString(),
        title: newSong.title,
        artist: newSong.artist,
        album: newSong.album,
        releaseYear: newSong.releaseYear,
        genre: newSong.genre,
      },
    });
  } catch (error: any) {
    console.error("Error adding song:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        error: "A song with this title already exists.",
      });
    }

    return res.status(500).json({
      error: "Failed to add song. Please try again.",
    });
  }
}
