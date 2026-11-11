"use client";

import { useRef, useState } from "react";

export type AllocationSlice = {
  id: string;
  label: string;
  percent: number;
  color: string;
};

const percentLabel = (value: number) =>
  `${value.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;

// Split each arc in two so a single 100% slice also forms a complete ring.
function ringSegment(start: number, percent: number) {
  const point = (radius: number, angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return `${80 + radius * Math.cos(radians)},${80 + radius * Math.sin(radians)}`;
  };
  const middle = start + percent * 1.8;
  const end = start + percent * 3.6;
  return `M ${point(80, start)} A 80 80 0 0 1 ${point(80, middle)} A 80 80 0 0 1 ${point(80, end)} L ${point(62, end)} A 62 62 0 0 0 ${point(62, middle)} A 62 62 0 0 0 ${point(62, start)} Z`;
}

export function AllocationDonut({
  slices,
  label,
  centerLabel,
  centerValue,
}: {
  slices: AllocationSlice[];
  label: string;
  centerLabel: string;
  centerValue: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const active = slices.find((slice) => slice.id === (hovered ?? focused ?? selected));
  const clear = () => {
    setHovered(null);
    setFocused(null);
    setSelected(null);
  };
  return (
    <div
      ref={chartRef}
      className="allocation-visual"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") clear();
      }}
    >
      <div
        className="donut interactive-donut"
        role="img"
        aria-label={active ? `${label}: ${active.label}, ${percentLabel(active.percent)}` : label}
      >
        <svg viewBox="0 0 160 160" aria-hidden="true">
          {slices.map((slice, index) => {
            const start = -90 + slices.slice(0, index).reduce((sum, item) => sum + item.percent * 3.6, 0);
            return slice.percent > 0 ? (
              <path
                key={slice.id}
                d={ringSegment(start, slice.percent)}
                fill={slice.color}
                className={active && active.id !== slice.id ? "slice-muted" : undefined}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setHovered(slice.id);
                }}
                onPointerLeave={() => setHovered(null)}
                onPointerDown={() => {
                  chartRef.current?.focus({ preventScroll: true });
                  setSelected((current) => current === slice.id ? null : slice.id);
                }}
              />
            ) : null;
          })}
        </svg>
        <div>
          <small className="donut-default">{centerLabel}</small>
          <strong className="donut-default">{centerValue}</strong>
          {active ? (
            <>
              <small className="donut-selection">{active.label}</small>
              <strong className="donut-selection">{percentLabel(active.percent)}</strong>
            </>
          ) : null}
        </div>
      </div>
      <div className="allocation-list">
        {slices.map((slice) => (
          <div key={slice.id}>
            <button
              className={active?.id === slice.id ? "allocation-slice active" : "allocation-slice"}
              aria-label={`${slice.label}: ${percentLabel(slice.percent)}`}
              aria-pressed={selected === slice.id}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") setHovered(slice.id);
              }}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setFocused(slice.id)}
              onBlur={() => setFocused(null)}
              onClick={() => setSelected(selected === slice.id ? null : slice.id)}
            >
              <span><i className="dot" style={{ background: slice.color }} />{slice.label}</span>
              <strong>{percentLabel(slice.percent)}</strong>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
