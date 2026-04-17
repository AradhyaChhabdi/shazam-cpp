interface MatchCardProps {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  confidence: number;
  isBestMatch?: boolean;
}

function getInitials(title: string): string {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function MatchCard({
  title,
  artist,
  album,
  releaseYear,
  confidence,
  isBestMatch = false,
}: MatchCardProps) {
  return (
    <div className="card-surface-hover p-5 animate-slide-up">
      <div className="flex items-center gap-4">
        {/* Album initials avatar */}
        <div className="w-12 h-12 rounded-lg bg-surface-raised flex items-center justify-center flex-shrink-0">
          <span className="text-sm text-resonate-dim font-medium">
            {getInitials(title)}
          </span>
        </div>

        {/* Song info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-white truncate">{title}</h3>
            {isBestMatch && (
              <span className="text-[10px] tracking-wider uppercase text-resonate-green font-medium flex-shrink-0">
                BEST MATCH
              </span>
            )}
          </div>
          <p className="text-sm text-resonate-dim mt-0.5 truncate">
            {artist}
            {album && <span> · {album}</span>}
            {releaseYear && <span> · {releaseYear}</span>}
          </p>
        </div>

        {/* Match percentage */}
        <div className="flex-shrink-0 text-right">
          <span className="text-sm text-resonate-muted">
            {Math.round(confidence)}% match
          </span>
        </div>
      </div>

      {/* Match bar */}
      <div className="match-bar-track mt-3 ml-16">
        <div
          className="match-bar-fill"
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}
