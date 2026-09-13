import React, { useEffect, useMemo, useState } from "react";
import { List, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  collapseToTopN,
  OTHER_BUCKET,
  TOP_ALLOCATION_SLICES,
  type AllocationSlice,
} from "../lib/allocation";
import { privacyMoney } from "../lib/privacy";

type AllocationRingProps = {
  slices: AllocationSlice[];
  privacyMode: boolean;
};

export default function AllocationRing({ slices, privacyMode }: AllocationRingProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const displaySlices = useMemo(() => collapseToTopN(slices, TOP_ALLOCATION_SLICES), [slices]);
  const total = useMemo(() => slices.reduce((sum, s) => sum + s.value, 0), [slices]);
  const hiddenCount = Math.max(0, slices.length - TOP_ALLOCATION_SLICES);
  const collapsed = hiddenCount > 0;

  const active = activeIndex != null ? displaySlices[activeIndex] : null;
  const centerLabel = active?.label ?? "Portfolio";
  const centerPct = active ? active.pct : 100;
  const centerValue = active ? active.value : total;
  const centerColor = active?.color ?? "#FFFFFF";

  useEffect(() => {
    if (!breakdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBreakdownOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [breakdownOpen]);

  if (slices.length === 0 || total <= 0) return null;

  return (
    <section
      className="mt-4 rounded-2xl border border-[#1F2937] bg-[#000000] p-4"
      aria-label="Asset and sector allocation"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
          Asset & Sector Allocation
        </h2>
        <span className="text-[10px] font-semibold text-[#6B7280]">
          {collapsed
            ? `Top ${Math.min(TOP_ALLOCATION_SLICES, displaySlices.length)} + Other · invested assets`
            : `${slices.length} groups · invested assets`}
        </span>
      </div>

      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div
          className="relative h-44 w-44 flex-shrink-0 cursor-pointer"
          onClick={() => setBreakdownOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="View full allocation breakdown"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setBreakdownOpen(true);
            }
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displaySlices}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={80}
                paddingAngle={displaySlices.length > 1 ? 3 : 0}
                cornerRadius={4}
                stroke="#000000"
                strokeWidth={2}
                isAnimationActive
                animationDuration={500}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                style={{ outline: "none" }}
              >
                {displaySlices.map((slice, index) => (
                  <Cell
                    key={slice.key}
                    fill={slice.color}
                    opacity={activeIndex == null || activeIndex === index ? 1 : 0.32}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active: tipActive, payload }) => {
                  if (!tipActive || !payload?.length) return null;
                  const slice = payload[0]?.payload as AllocationSlice | undefined;
                  if (!slice) return null;
                  return (
                    <div className="rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2">
                      <p className="text-[11px] font-bold text-white">{slice.label}</p>
                      <p className="mt-0.5 text-xs font-extrabold tabular-nums" style={{ color: slice.color }}>
                        {slice.pct.toFixed(0)}%
                        <span className="ml-1.5 font-semibold text-[#9CA3AF]">
                          {privacyMoney(privacyMode, slice.value)}
                        </span>
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="max-w-[5.5rem] truncate text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
              {centerLabel}
            </p>
            <p className="text-lg font-extrabold tabular-nums" style={{ color: centerColor }}>
              {centerPct.toFixed(0)}%
            </p>
            <p className="text-[10px] font-semibold tabular-nums text-[#6B7280]">
              {privacyMoney(privacyMode, centerValue)}
            </p>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-1.5">
          {displaySlices.map((slice, index) => {
            const selected = activeIndex === index;
            const isOther = slice.label === OTHER_BUCKET;
            return (
              <li key={slice.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (isOther && collapsed) {
                      setBreakdownOpen(true);
                      return;
                    }
                    setActiveIndex((prev) => (prev === index ? null : index));
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.04]"
                  style={selected ? { background: `${slice.color}22` } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: slice.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
                    {slice.label}
                    {isOther && hiddenCount > 0 ? (
                      <span className="ml-1 text-[10px] font-medium text-[#6B7280]">
                        ({hiddenCount} more)
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="flex-shrink-0 text-[12px] font-extrabold tabular-nums"
                    style={{ color: slice.color }}
                  >
                    {slice.pct.toFixed(0)}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setBreakdownOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2 text-[11px] font-bold text-white transition hover:border-[#374151] hover:bg-[#111111] active:scale-[0.99]"
      >
        <List size={13} className="text-[#9CA3AF]" />
        View Full Breakdown
      </button>

      {breakdownOpen && (
        <AllocationBreakdownModal
          slices={slices}
          total={total}
          privacyMode={privacyMode}
          onClose={() => setBreakdownOpen(false)}
        />
      )}
    </section>
  );
}

function AllocationBreakdownModal({
  slices,
  total,
  privacyMode,
  onClose,
}: {
  slices: AllocationSlice[];
  total: number;
  privacyMode: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="matter-pop flex max-h-[min(88vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="allocation-breakdown-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1F2937] px-5 py-4">
          <div className="min-w-0">
            <h3 id="allocation-breakdown-title" className="text-sm font-extrabold text-white">
              Full allocation breakdown
            </h3>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              {slices.length} {slices.length === 1 ? "sector" : "sectors"} · {privacyMoney(privacyMode, total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close breakdown"
            className="flex-shrink-0 text-[#9CA3AF] transition hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <ul className="space-y-3">
            {slices.map((slice) => (
              <li key={slice.key} className="rounded-xl border border-[#1F2937] bg-black/30 p-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: slice.color }}
                    aria-hidden
                  />
                  <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-white">{slice.label}</p>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[12px] font-extrabold tabular-nums" style={{ color: slice.color }}>
                      {slice.pct.toFixed(1)}%
                    </p>
                    <p className="text-[10px] font-semibold tabular-nums text-[#6B7280]">
                      {privacyMoney(privacyMode, slice.value)}
                    </p>
                  </div>
                </div>

                {slice.holdings.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[#1F2937] pt-2">
                    {slice.holdings.map((holding) => (
                      <li key={holding.id} className="flex items-baseline gap-2 px-1 py-0.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-white">{holding.label}</p>
                          {holding.detail && holding.detail !== holding.label && (
                            <p className="truncate text-[10px] text-[#6B7280]">{holding.detail}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className="text-[12px] font-bold tabular-nums text-white">
                            {privacyMoney(privacyMode, holding.value)}
                          </p>
                          <p className="text-[10px] font-semibold tabular-nums text-[#9CA3AF]">
                            {holding.pct.toFixed(1)}%
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
