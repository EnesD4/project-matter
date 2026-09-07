import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Globe2,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { getMarketStatusHeader } from "../lib/marketInsights";

type DailyReportScreenProps = {
  onBack: () => void;
  onConsultSocrates?: () => void;
};

type DailyReportResponse = {
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: "ai" | "fallback";
  warning?: string;
};

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

const BODY = "#F3F4F6";
const CARD = "#111827";

/**
 * Full-screen AI daily US market report — holistic macro summary only.
 * Navigated to from the Investments portfolio card — not a pop-up modal.
 */
export default function DailyReportScreen({
  onBack,
  onConsultSocrates,
}: DailyReportScreenProps) {
  const localStatus = useMemo(() => getMarketStatusHeader(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadReport() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/market/daily-report`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Report request failed (${res.status})`);
        }
        const data = (await res.json()) as DailyReportResponse;
        if (cancelled) return;
        if (!data?.macroDrivers || !data?.indexMovements || !data?.sentimentTakeaway) {
          throw new Error("Incomplete report payload");
        }
        setReport(data);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(
          "We couldn't reach the AI market service right now. Please try again in a moment."
        );
        setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [retryToken]);

  const title = report?.title ?? localStatus.title;
  const marketOpen = report?.marketOpen ?? localStatus.marketOpen;

  return (
    <div className="fixed inset-0 z-50 min-h-screen overflow-y-auto bg-[#000000]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#1F2937] bg-[#000000]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[#9CA3AF] transition hover:bg-white/5 hover:text-white active:scale-[0.98]"
        >
          <ArrowLeft size={16} />
          Back to Portfolio
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
          <Sparkles size={12} />
          AI Report
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Brain size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">
              {title}
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#1F2937] bg-[#0A0A0A] px-2.5 py-1 text-[10px] font-bold">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  marketOpen ? "bg-emerald-400 animate-pulse" : "bg-[#9CA3AF]"
                }`}
              />
              <span className={marketOpen ? "text-emerald-400" : "text-[#9CA3AF]"}>
                {marketOpen ? "Market open" : "Market closed"}
              </span>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Globe2 size={15} />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
              Core Market Synthesis
            </h2>
          </div>

          {loading ? (
            <div
              className="mt-3 rounded-2xl border border-[#1F2937] p-5"
              style={{ backgroundColor: CARD }}
              aria-busy="true"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                <div>
                  <p className="text-sm font-bold text-white">Synthesizing US market tape…</p>
                  <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
                    Pulling macro catalysts, index tone, and sentiment
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-full animate-pulse rounded bg-white/5" />
                    <div className="h-3 w-[92%] animate-pulse rounded bg-white/5" />
                    <div className="h-3 w-[80%] animate-pulse rounded bg-white/5" />
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            <div
              className="mt-3 rounded-2xl border border-dashed border-[#1F2937] px-4 py-8 text-center"
              style={{ backgroundColor: CARD }}
            >
              <p className="text-sm font-bold text-white">Report unavailable</p>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed" style={{ color: BODY }}>
                {error}
              </p>
              <button
                type="button"
                onClick={() => setRetryToken((n) => n + 1)}
                className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#1F2937] px-4 py-2 text-xs font-bold text-emerald-400 transition hover:bg-white/5"
              >
                Retry
              </button>
            </div>
          ) : report ? (
            <div
              className="mt-3 rounded-2xl border border-[#1F2937] p-5 sm:p-6"
              style={{ backgroundColor: CARD }}
            >
              {report.warning && (
                <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                  {report.warning}
                </p>
              )}

              <article className="space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Macro Drivers
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.macroDrivers}
                  </p>
                </div>
                <div className="h-px bg-[#1F2937]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Index Movements
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.indexMovements}
                  </p>
                </div>
                <div className="h-px bg-[#1F2937]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    General Sentiment &amp; Takeaway
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.sentimentTakeaway}
                  </p>
                </div>
              </article>

              <div className="mt-5 flex flex-wrap gap-2">
                {["S&P 500", "Nasdaq", "Dow Jones"].map((label) => (
                  <span
                    key={label}
                    className="rounded-lg border border-[#1F2937] bg-black/40 px-2.5 py-1 text-[10px] font-bold text-emerald-400"
                  >
                    {label}
                  </span>
                ))}
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  {report.source === "ai" ? "Live AI synthesis" : "Macro fallback"}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => {
            onBack();
            onConsultSocrates?.();
          }}
          className="mt-8 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
        >
          <MessageCircle size={15} />
          Discuss with Matter AI
        </button>
      </div>
    </div>
  );
}
