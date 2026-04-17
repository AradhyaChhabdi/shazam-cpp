interface JobItemProps {
  filename: string;
  status: "done" | "processing" | "queued";
  progress?: number; // 0–100
}

const statusLabels: Record<string, string> = {
  done: "DONE",
  processing: "PROCESSING",
  queued: "QUEUED",
};

export default function JobItem({ filename, status, progress = 0 }: JobItemProps) {
  return (
    <div className="card-surface-hover p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`job-dot ${status}`} />
          <span className="text-sm text-white truncate font-mono">{filename}</span>
        </div>
        <span className="text-xs text-resonate-dim tracking-wider uppercase ml-3 flex-shrink-0">
          {statusLabels[status]}
        </span>
      </div>
      {/* Progress bar */}
      <div className="match-bar-track ml-5">
        <div
          className="match-bar-fill"
          style={{
            width: status === "done" ? "100%" : status === "processing" ? `${progress}%` : "0%",
            background: status === "queued" ? "rgba(255,255,255,0.06)" : undefined,
          }}
        />
      </div>
    </div>
  );
}
