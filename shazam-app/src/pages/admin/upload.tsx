import { useState, useRef, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";

type UploadState = "idle" | "uploading" | "processing" | "success" | "error";

export default function AdminUpload() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [progress, setProgress] = useState(0);

  // Form fields
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [genre, setGenre] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if not admin
  if (status === "loading") {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
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
      // Validate file type
      const validTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
      ];
      if (
        !validTypes.includes(file.type) &&
        !file.name.match(/\.(mp3|wav)$/i)
      ) {
        setError("Invalid file type. Please upload MP3 or WAV.");
        return;
      }

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError("File size exceeds 50MB limit.");
        return;
      }

      setAudioFile(file);
      setError("");

      // Auto-fill title from filename if empty
      if (!title) {
        const nameWithoutExt = file.name.replace(/\.(mp3|wav)$/i, "");
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
          )({
            sampleRate: 44100,
          });

          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const channelData = audioBuffer.getChannelData(0);

          // Only use first 30 seconds of audio (enough for fingerprinting)
          const maxSamples = 44100 * 30; // 30 seconds at 44.1kHz
          const samplesToUse = Math.min(channelData.length, maxSamples);

          // Downsample to reduce payload size (keep every 4th sample)
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
      // Process audio file
      setUploadState("processing");
      setProgress(40);

      const audioData = await processAudioFile(audioFile);
      console.log(`Processed ${audioData.length} audio samples`);
      setProgress(60);

      // Convert to array and round values to reduce JSON size
      const audioArray = [];
      for (let i = 0; i < audioData.length; i++) {
        audioArray.push(Math.round(audioData[i] * 10000) / 10000);
      }

      console.log(`Sending ${audioArray.length} samples to API`);

      // Send to API
      const response = await fetch("/api/songs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          artist,
          album,
          releaseYear: releaseYear ? parseInt(releaseYear) : null,
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
      setSuccessMessage(data.message || "Song successfully added to library.");

      // Reset form
      setTitle("");
      setArtist("");
      setAlbum("");
      setReleaseYear("");
      setGenre("");
      setAudioFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload song. Please try again.");
      setUploadState("error");
    }
  };

  const resetForm = () => {
    setUploadState("idle");
    setError("");
    setSuccessMessage("");
    setProgress(0);
  };

  return (
    <Layout>
      <div className="min-h-screen py-8 px-4 pb-20">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold gradient-text">Upload Song</h1>
              <p className="text-gray-400 text-sm mt-1">
                Add new songs to the fingerprint database
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-gray-400 hover:text-white text-sm flex items-center space-x-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Logout</span>
            </button>
          </div>

          {/* Success Message */}
          {uploadState === "success" && (
            <div className="glass-card rounded-xl p-6 mb-6 bg-green-500/10 border border-green-500/30">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-green-400 font-semibold">Success!</h3>
                  <p className="text-gray-300 text-sm">{successMessage}</p>
                </div>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
                >
                  Upload Another
                </button>
              </div>
            </div>
          )}

          {/* Upload Form */}
          <div className="glass-card rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Audio File <span className="text-red-400">*</span>
                </label>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                    audioFile
                      ? "border-primary bg-primary/10"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,audio/mpeg,audio/wav"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {audioFile ? (
                    <div>
                      <svg
                        className="w-12 h-12 text-primary mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                      </svg>
                      <p className="text-white font-medium">{audioFile.name}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <svg
                        className="w-12 h-12 text-gray-500 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p className="text-gray-400">
                        Click to upload MP3 or WAV
                      </p>
                      <p className="text-gray-500 text-sm mt-1">
                        Max file size: 10MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Title and Artist */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Song Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter song title"
                  />
                </div>

                <div>
                  <label
                    htmlFor="artist"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Artist <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="artist"
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter artist name"
                  />
                </div>
              </div>

              {/* Album and Year */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="album"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Album
                  </label>
                  <input
                    id="album"
                    type="text"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter album name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="releaseYear"
                    className="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Release Year
                  </label>
                  <input
                    id="releaseYear"
                    type="number"
                    min="1900"
                    max="2100"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., 2024"
                  />
                </div>
              </div>

              {/* Genre */}
              <div>
                <label
                  htmlFor="genre"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Genre
                </label>
                <select
                  id="genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select genre</option>
                  <option value="Pop">Pop</option>
                  <option value="Rock">Rock</option>
                  <option value="Hip-Hop">Hip-Hop</option>
                  <option value="R&B">R&B</option>
                  <option value="Electronic">Electronic</option>
                  <option value="Jazz">Jazz</option>
                  <option value="Classical">Classical</option>
                  <option value="Country">Country</option>
                  <option value="Latin">Latin</option>
                  <option value="Indie">Indie</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-500/20 border border-red-500 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Progress Bar */}
              {(uploadState === "uploading" ||
                uploadState === "processing") && (
                <div>
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>
                      {uploadState === "uploading"
                        ? "Uploading..."
                        : "Processing fingerprints..."}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  uploadState === "uploading" || uploadState === "processing"
                }
                className="w-full bg-gradient-to-r from-primary to-accent text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {uploadState === "uploading" || uploadState === "processing" ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                    {uploadState === "uploading"
                      ? "Uploading..."
                      : "Processing..."}
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Upload Song
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Info Card */}
          <div className="glass-card rounded-xl p-4 mt-6">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-primary flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-gray-400">
                <p>
                  The audio file will be processed to extract unique
                  fingerprints using FFT analysis. This allows the system to
                  identify the song even from short recordings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
