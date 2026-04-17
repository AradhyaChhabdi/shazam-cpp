import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import StatusLabel from "@/components/StatusLabel";
import StatsCard from "@/components/StatsCard";
import JobItem from "@/components/JobItem";

type UploadState = "idle" | "uploading" | "processing" | "success" | "error";

// Simulated recent jobs
const MOCK_JOBS = [
  {
    filename: "kavinsky_-_nightcall.flac",
    status: "done" as const,
    progress: 100,
  },
  {
    filename: "m83_-_midnight_city.wav",
    status: "processing" as const,
    progress: 65,
  },
  { filename: "eno_-_an_ending.mp3", status: "queued" as const, progress: 0 },
];

export default function AdminUpload() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [jobs, setJobs] = useState(MOCK_JOBS);

  // Form fields
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [genre, setGenre] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // Stats (simulated starting values)
  const [stats] = useState({
    indexed: 12481,
    fingerprints: "4.2M",
    avgMatch: "184ms",
    queue: 2,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if not admin
  if (status === "loading") {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (status === "unauthenticated" || !session?.user?.isAdmin) {
    router.push("/admin/login");
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/flac",
      ];
      if (
        !validTypes.includes(file.type) &&
        !file.name.match(/\.(mp3|wav|flac)$/i)
      ) {
        setError("Invalid file type. Please upload FLAC, WAV, or MP3.");
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setError("File size exceeds 50MB limit.");
        return;
      }

      setAudioFile(file);
      setError("");

      if (!title) {
        const nameWithoutExt = file.name.replace(/\.(mp3|wav|flac)$/i, "");
        setTitle(nameWithoutExt);
      }
    }
  };

  const processAudioFile = async (file: File): Promise<Float32Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const audioContext = new (
            window.AudioContext || (window as any).webkitAudioContext
          )({ sampleRate: 44100 });

          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const channelData = audioBuffer.getChannelData(0);

          const maxSamples = 44100 * 30;
          const samplesToUse = Math.min(channelData.length, maxSamples);

          const downsampleFactor = 4;
          const outputLength = Math.floor(samplesToUse / downsampleFactor);
          const downsampled = new Float32Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            downsampled[i] = channelData[i * downsampleFactor];
          }

          await audioContext.close();
          resolve(downsampled);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !artist) {
      setError("Title and Artist are required fields.");
      return;
    }

    if (!audioFile) {
      setError("Please select an audio file.");
      return;
    }

    setUploadState("uploading");
    setError("");
    setProgress(20);

    try {
      setUploadState("processing");
      setProgress(40);

      const audioData = await processAudioFile(audioFile);
      setProgress(60);

      const audioArray = [];
      for (let i = 0; i < audioData.length; i++) {
        audioArray.push(Math.round(audioData[i] * 10000) / 10000);
      }

      const response = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          album,
          releaseYear: releaseYear ? Number(releaseYear) : undefined,
          genre,
          audioData: audioArray,
        }),
      });

      setProgress(90);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload song");
      }

      setProgress(100);
      setUploadState("success");
      setSuccessMessage(data.message || "Song queued for fingerprinting.");

      // Add to jobs list
      const newJob = {
        filename: audioFile.name.toLowerCase().replace(/\s+/g, "_"),
        status: "processing" as const,
        progress: 30,
      };
      setJobs([newJob, ...jobs]);

      // Reset form
      setTitle("");
      setArtist("");
      setAlbum("");
      setReleaseYear("");
      setGenre("");
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setError(err.message || "Failed to upload song. Please try again.");
      setUploadState("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const fakeEvent = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fakeEvent);
    }
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-56px)] py-10 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <StatusLabel>ADMIN</StatusLabel>
            <h1 className="text-3xl font-semibold text-white mt-2 mb-1">
              Ingestion
            </h1>
            <p className="text-sm text-resonate-dim">
              Upload, fingerprint, and monitor catalog jobs.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            <StatsCard
              label="INDEXED"
              value={stats.indexed.toLocaleString()}
              subtitle="tracks"
            />
            <StatsCard
              label="FINGERPRINTS"
              value={stats.fingerprints}
              subtitle="hashes"
            />
            <StatsCard
              label="AVG. MATCH"
              value={stats.avgMatch}
              subtitle="p50 latency"
            />
            <StatsCard
              label="QUEUE"
              value={String(stats.queue)}
              subtitle="pending"
            />
          </div>

          {/* Two-column: form + jobs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Add a track form */}
            <div>
              <h2 className="text-base font-medium text-white mb-4">
                Add a track
              </h2>
              <div className="card-surface p-5">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Title */}
                  <div>
                    <label className="form-label">TITLE</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Song title"
                      className="form-input"
                    />
                  </div>

                  {/* Artist */}
                  <div>
                    <label className="form-label">ARTIST</label>
                    <input
                      type="text"
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      placeholder="Artist name"
                      className="form-input"
                    />
                  </div>

                  {/* Album */}
                  <div>
                    <label className="form-label">ALBUM</label>
                    <input
                      type="text"
                      value={album}
                      onChange={(e) => setAlbum(e.target.value)}
                      placeholder="Album name (optional)"
                      className="form-input"
                    />
                  </div>

                  {/* Release year and genre */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">RELEASE YEAR</label>
                      <input
                        type="number"
                        min="1800"
                        max={new Date().getFullYear() + 1}
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        placeholder="e.g. 2024"
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label className="form-label">GENRE</label>
                      <input
                        type="text"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        placeholder="e.g. Pop, Rock"
                        className="form-input"
                      />
                    </div>
                  </div>

                  {/* File drop zone */}
                  <div
                    className={`drop-zone ${audioFile ? "has-file" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/flac"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {audioFile ? (
                      <div>
                        <p className="text-white font-medium text-sm">
                          {audioFile.name}
                        </p>
                        <p className="text-resonate-dim text-xs mt-1">
                          {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-white font-medium text-sm">
                          Drop audio file
                        </p>
                        <p className="text-resonate-dim text-xs mt-1">
                          FLAC, WAV, MP3 · up to 50 MB
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Error */}
                  {error && <p className="text-red-400 text-sm">{error}</p>}

                  {/* Success */}
                  {uploadState === "success" && (
                    <p className="text-resonate-green text-sm">
                      {successMessage}
                    </p>
                  )}

                  {/* Progress bar */}
                  {(uploadState === "uploading" ||
                    uploadState === "processing") && (
                    <div className="match-bar-track">
                      <div
                        className="match-bar-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={
                      uploadState === "uploading" ||
                      uploadState === "processing"
                    }
                    className="w-full py-3 rounded-lg text-sm font-medium bg-white text-surface hover:bg-white/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadState === "uploading" || uploadState === "processing"
                      ? "Processing..."
                      : "Queue for fingerprinting"}
                  </button>
                </form>
              </div>
            </div>

            {/* Recent jobs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-medium text-white">
                  Recent jobs
                </h2>
                <span className="text-sm text-resonate-green">
                  {jobs.length} total
                </span>
              </div>
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <JobItem
                    key={index}
                    filename={job.filename}
                    status={job.status}
                    progress={job.progress}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
