import { useEffect, useRef, useState } from "react";

interface AudioVisualizerProps {
  isActive: boolean;
  analyserNode?: AnalyserNode | null;
}

export default function AudioVisualizer({ isActive, analyserNode }: AudioVisualizerProps) {
  const barCount = 64;
  const [heights, setHeights] = useState<number[]>(new Array(barCount).fill(0));
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive || !analyserNode) {
      // Reset to zero when not active
      setHeights(new Array(barCount).fill(0));
      return;
    }

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    const tick = () => {
      analyserNode.getByteFrequencyData(dataArray);

      // Sample barCount values spread across the frequency data
      const step = Math.floor(dataArray.length / barCount);
      const newHeights: number[] = [];
      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] || 0;
        // Normalize to 0–1
        newHeights.push(value / 255);
      }
      setHeights(newHeights);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, analyserNode]);

  // Idle state: dotted line
  if (!isActive) {
    return (
      <div className="flex items-center justify-center gap-[6px] h-10 w-full max-w-lg mx-auto">
        {Array.from({ length: 48 }).map((_, i) => (
          <div key={i} className="visualizer-dot" />
        ))}
      </div>
    );
  }

  // Active state: frequency bars
  return (
    <div className="flex items-end justify-center gap-[2px] h-16 w-full max-w-lg mx-auto">
      {heights.map((h, i) => (
        <div
          key={i}
          className="visualizer-bar active"
          style={{
            height: `${Math.max(3, h * 56)}px`,
            opacity: 0.4 + h * 0.6,
          }}
        />
      ))}
    </div>
  );
}
