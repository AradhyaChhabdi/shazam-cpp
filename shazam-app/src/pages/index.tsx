import { useState, useRef, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";

interface MatchResult {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  genre?: string;
  confidence: number;
}

type RecordingState =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "results"
  | "error";

export default function Home() {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_RECORDING_TIME = 20; // Maximum 20 seconds as per SRS

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const startRecording = async () => {
    try {
      setState("requesting");
      setError("");
      setResults([]);
      chunksRef.current = [];

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4",
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Process the recorded audio
        await processAudio();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setState("recording");
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          if (newTime >= MAX_RECORDING_TIME) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Error starting recording:", err);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setError("Access Denied: Please enable microphone permissions.");
      } else {
        setError("Failed to access microphone. Please try again.");
      }
      setState("error");
    }
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const processAudio = async () => {
    setState("processing");

    try {
      // Combine chunks into a single blob
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

      // Create AudioContext for decoding
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({
        sampleRate: 44100,
      });
      audioContextRef.current = audioContext;

      // Decode audio data
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get mono channel data (Float32Array)
      const channelData = audioBuffer.getChannelData(0);

      // Downsample to reduce payload size (keep every 4th sample)
      // This reduces 44100Hz to ~11025Hz which is still good for fingerprinting
      const downsampleFactor = 4;
      const downsampled = [];
      for (let i = 0; i < channelData.length; i += downsampleFactor) {
        downsampled.push(channelData[i]);
      }

      // Convert to regular array for JSON serialization
      const audioData = downsampled;

      // Send to API for identification
      const response = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audioData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to identify song");
      }

      if (data.status === "match" && data.results.length > 0) {
        setResults(data.results);
        setState("results");
      } else {
        setError(data.message || "No match found.");
        setState("error");
      }
    } catch (err: any) {
      console.error("Error processing audio:", err);
      setError(err.message || "Failed to process audio. Please try again.");
      setState("error");
    }
  };

  const resetRecording = () => {
    setState("idle");
    setError("");
    setResults([]);
    setRecordingTime(0);
  };

  return (
    <Layout>
      <div className="min-h-screen flex flex-col items-center justify-center px-4 pb-20">
        {/* Title */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            Identify Music
          </h1>
          <p className="text-gray-400 max-w-md">
            Tap the button and let your device listen to the music playing
            around you.
          </p>
        </div>

        {/* Recording Button */}
        <div className="relative mb-8">
          {state === "idle" && (
            <button
              onClick={startRecording}
              className="w-40 h-40 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform hover:scale-105 focus:outline-none"
            >
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
          )}

          {state === "requesting" && (
            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
            </div>
          )}

          {state === "recording" && (
            <button
              onClick={stopRecording}
              className="w-40 h-40 rounded-full bg-gradient-to-br from-red-500 to-red-600 recording-btn flex flex-col items-center justify-center"
            >
              {/* Wave Animation */}
              <div className="flex items-end space-x-1 mb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-2 bg-white rounded-full wave-bar"
                    style={{ height: "20px" }}
                  />
                ))}
              </div>
              <span className="text-white text-sm">Tap to stop</span>
            </button>
          )}

          {state === "processing" && (
            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-2"></div>
              <span className="text-white text-sm">Analyzing...</span>
            </div>
          )}

          {(state === "results" || state === "error") && (
            <button
              onClick={resetRecording}
              className="w-40 h-40 rounded-full bg-gradient-to-br from-primary to-accent flex flex-col items-center justify-center transition-transform hover:scale-105"
            >
              <svg
                className="w-12 h-12 text-white mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="text-white text-sm">Try Again</span>
            </button>
          )}
        </div>

        {/* Recording Timer */}
        {state === "recording" && (
          <div className="text-center mb-8">
            <div className="text-3xl font-mono text-white mb-2">
              {String(Math.floor(recordingTime / 60)).padStart(2, "0")}:
              {String(recordingTime % 60).padStart(2, "0")}
            </div>
            <div className="w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-1000"
                style={{
                  width: `${(recordingTime / MAX_RECORDING_TIME) * 100}%`,
                }}
              />
            </div>
            <p className="text-gray-400 text-sm mt-2">
              Max {MAX_RECORDING_TIME} seconds
            </p>
          </div>
        )}

        {/* Error Display */}
        {state === "error" && error && (
          <div className="glass-card rounded-xl p-6 max-w-md text-center">
            <svg
              className="w-12 h-12 text-red-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {state === "results" && results.length > 0 && (
          <div className="w-full max-w-lg">
            <h2 className="text-xl font-semibold text-white mb-4 text-center">
              Top Matches
            </h2>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`glass-card rounded-xl p-4 ${
                    index === 0 ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {index === 0 && (
                          <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">
                            Best Match
                          </span>
                        )}
                        <span className="text-gray-400 text-sm">
                          #{index + 1}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white mt-1">
                        {result.title}
                      </h3>
                      <p className="text-gray-300">{result.artist}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-sm text-gray-400">
                        {result.album && <span>{result.album}</span>}
                        {result.releaseYear && (
                          <span>• {result.releaseYear}</span>
                        )}
                        {result.genre && <span>• {result.genre}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-lg font-bold ${
                          result.confidence >= 90
                            ? "text-green-400"
                            : result.confidence >= 80
                              ? "text-yellow-400"
                              : "text-orange-400"
                        }`}
                      >
                        {result.confidence.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">confidence</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {state === "idle" && (
          <div className="text-center text-gray-400 text-sm max-w-md">
            <p>
              Click the button above to start recording. Hold your device close
              to the music source for best results. Recording will automatically
              stop after {MAX_RECORDING_TIME} seconds.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
