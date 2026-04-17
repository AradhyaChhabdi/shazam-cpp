interface ListenButtonProps {
  state: "idle" | "listening" | "processing";
  onClick: () => void;
}

export default function ListenButton({ state, onClick }: ListenButtonProps) {
  const isListening = state === "listening";
  const isProcessing = state === "processing";

  return (
    <button
      onClick={onClick}
      className={`listen-ring-outer ${isListening ? "" : ""}`}
      aria-label={
        state === "idle"
          ? "Start listening"
          : state === "listening"
            ? "Stop listening"
            : "Processing audio"
      }
    >
      <div
        className={`listen-ring-middle ${isListening ? "" : ""}`}
        style={
          isListening
            ? {
                borderColor: "rgba(56, 189, 248, 0.25)",
                background: "rgba(56, 189, 248, 0.03)",
              }
            : {}
        }
      >
        <div
          className="listen-ring-inner"
          style={
            isListening
              ? {
                  border: "2px solid #38bdf8",
                  background: "rgba(56, 189, 248, 0.06)",
                  boxShadow:
                    "0 0 30px rgba(56, 189, 248, 0.15), 0 0 60px rgba(56, 189, 248, 0.05)",
                }
              : {}
          }
        >
          {/* Idle: green dot */}
          {state === "idle" && (
            <div className="w-3 h-3 rounded-full bg-resonate-green" />
          )}

          {/* Listening: waveform bars */}
          {isListening && (
            <div className="flex items-center gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-white"
                  style={{
                    height: `${16 + Math.sin(i * 1.2) * 8}px`,
                    animation: `wave-bar 0.8s ease-in-out ${i * 0.1}s infinite`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing: spinner */}
          {isProcessing && (
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          )}
        </div>
      </div>
    </button>
  );
}
