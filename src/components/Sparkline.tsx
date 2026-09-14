import React, { useMemo } from "react";

const GAIN_GREEN = "#10B981";
const LOSS_RED = "#EF4444";

type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

export default function Sparkline({
  values,
  width = 64,
  height = 28,
  color,
  className = "",
}: SparklineProps) {
  const { path, stroke } = useMemo(() => {
    const clean = (values ?? []).map((value) => (Number.isFinite(value) ? value : 0));
    if (clean.length < 2) {
      return { path: "", stroke: color ?? GAIN_GREEN };
    }
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || Math.max(Math.abs(max) * 0.01, 0.01);
    const padY = 2;
    const innerH = height - padY * 2;
    const d = clean
      .map((value, index) => {
        const x = (index / (clean.length - 1)) * width;
        const y = padY + (1 - (value - min) / span) * innerH;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    const up = clean[clean.length - 1] >= clean[0];
    return { path: d, stroke: color ?? (up ? GAIN_GREEN : LOSS_RED) };
  }, [values, width, height, color]);

  if (!path) {
    return <span className={`inline-block ${className}`} style={{ width, height }} aria-hidden />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`flex-shrink-0 ${className}`}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
