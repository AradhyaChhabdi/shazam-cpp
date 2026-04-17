import { useState, useRef, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import StatusLabel from "@/components/StatusLabel";
import ListenButton from "@/components/ListenButton";
import AudioVisualizer from "@/components/AudioVisualizer";
import MatchCard from "@/components/MatchCard";

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

const MAX_RECORDING_TIME = 20; // seconds

export default function Home() {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

      streamRef.current = stream;

      // Set up analyser for visualization
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 44100 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setAnalyserNode(analyser);

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
      mediaRecorder.start(100);
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
    setAnalyserNode(null);

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
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });

      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 44100 });
      audioContextRef.current = audioContext;

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      // Downsample to reduce payload
      const downsampleFactor = 4;
      const downsampled = [];
      for (let i = 0; i < channelData.length; i += downsampleFactor) {
        downsampled.push(channelData[i]);
      }

      const response = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioData: downsampled }),
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
    setAnalyserNode(null);
  };

  const handleListenButtonClick = () => {
    if (state === "idle" || state === "error") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  };

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const getStatusText = () => {
    switch (state) {
      case "idle":
        return "READY";
      case "requesting":
        return "REQUESTING";
      case "recording":
        return "LISTENING · HOLD STILL";
      case "processing":
        return "PROCESSING";
      case "results":
        return "MATCH FOUND";
      case "error":
        return "ERROR";
      default:
        return "READY";
    }
  };

  // Results view
  if (state === "results" && results.length > 0) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-4 animate-fade-in">
          <StatusLabel>MATCH FOUND</StatusLabel>

          <h1 className="text-4xl md:text-5xl font-semibold text-white mt-4 mb-3 text-center">
            Here&apos;s what we heard.
          </h1>
          <p className="text-resonate-dim text-center mb-10">
            {results.length === 1
              ? "One candidate found."
              : `${results.length === 2 ? "Two" : "Three"} candidates, ranked by acoustic similarity.`}
          </p>

          {/* Match cards */}
          <div className="w-full max-w-2xl space-y-3 mb-10">
            {results.slice(0, 3).map((result, index) => (
              <MatchCard
                key={index}
                title={result.title}
                artist={result.artist}
                album={result.album}
                releaseYear={result.releaseYear}
                confidence={result.confidence}
                isBestMatch={index === 0}
              />
            ))}
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3">
            <button
              onClick={resetRecording}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-surface bg-white hover:bg-white/90 transition"
            >
              Try New
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // Error view
  if (state === "error" && error) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-4 animate-fade-in">
          <StatusLabel>ERROR</StatusLabel>

          <h1 className="text-4xl md:text-5xl font-semibold text-white mt-4 mb-3 text-center">
            Something went wrong.
          </h1>
          <p className="text-resonate-dim text-center mb-10 max-w-md">
            {error}
          </p>

          <ListenButton state="idle" onClick={startRecording} />

          <button
            onClick={resetRecording}
            className="mt-8 px-5 py-2.5 rounded-lg text-sm font-medium text-white border border-surface-border hover:bg-white/5 transition"
          >
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  // Default: idle / requesting / recording / processing
  return (
    <Layout>
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-4">
        {/* Status */}
        <StatusLabel>{getStatusText()}</StatusLabel>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-semibold text-white mt-4 mb-3 text-center">
          What&apos;s playing?
        </h1>
        <p className="text-resonate-dim text-center mb-12">
          Tap to listen. We&apos;ll fingerprint a few seconds and find the song.
        </p>

        {/* Listen button */}
        <div className="mb-12">
          <ListenButton
            state={
              state === "recording"
                ? "listening"
                : state === "processing" || state === "requesting"
                  ? "processing"
                  : "idle"
            }
            onClick={handleListenButtonClick}
          />
        </div>

        {/* Audio visualizer */}
        <div className="w-full max-w-lg mb-8">
          <AudioVisualizer
            isActive={state === "recording"}
            analyserNode={analyserNode}
          />
        </div>

        {/* Timer */}
        <p className="text-sm text-resonate-dim font-mono tracking-wide">
          {formatTime(recordingTime)} / {formatTime(MAX_RECORDING_TIME)}
        </p>
      </div>
    </Layout>
  );
}
