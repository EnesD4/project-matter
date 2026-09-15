import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Briefcase,
  Globe2,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { getApiBaseUrl } from "../lib/apiBase";
import { getMarketStatusHeader } from "../lib/marketInsights";
import { EDUCATIONAL_DISCLAIMER } from "../lib/sproutAi";
import type { DailyReportMode } from "./SocratesPortfolioReport";

export type DailyReportHoldingInput = {
  symbol: string;
  description?: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  dayChangePct?: number;
  industry?: string;
};

type DailyReportScreenProps = {
  mode: DailyReportMode;
  holdings?: DailyReportHoldingInput[];
  limitedLiveData?: boolean;
  onBack: () => void;
  onConsultSocrates?: () => void;
};

type DailyReportResponse = {
  mode?: DailyReportMode;
  marketOpen: boolean;
  title: string;
  macroDrivers: string;
  indexMovements: string;
  sentimentTakeaway: string;
  source: "ai" | "fallback";
  warning?: string;
  disclaimer?: string;
  limitedLiveData?: boolean;
};

const BODY = "#F3F4F6";
const CARD = "#111827";
const LIMITED_LIVE_DATA_NOTE = "Note: Generated with limited live data";

/**
 * Full-screen AI daily report — general market or specialized portfolio mode.
 * Navigated to from the Investments portfolio card — not a pop-up modal.
 */
export default function DailyReportScreen({
  mode,
  holdings = [],
  limitedLiveData = false,
  onBack,
  onConsultSocrates,
}: DailyReportScreenProps) {
  const localStatus = useMemo(() => getMarketStatusHeader(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const isSpecialized = mode === "specialized";
  const holdingsKey = useMemo(
    () =>
      JSON.stringify(
        holdings.map((h) => [
          h.symbol,
          h.quantity,
          h.avgCost,
          h.currentPrice,
          h.dayChangePct ?? null,
          h.industry ?? null,
        ])
      ),
    [holdings]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const holdingsSnapshot = isSpecialized ? holdings : [];

    async function loadReport() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/market/daily-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode,
            limitedLiveData: isSpecialized ? limitedLiveData : false,
            holdings: holdingsSnapshot,
          }),
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
          isSpecialized
            ? "We couldn't reach the AI portfolio service right now. Please try again in a moment."
            : "We couldn't reach the AI market service right now. Please try again in a moment."
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
    // holdingsKey is a stable serialization of holdings for specialized mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- holdings captured via holdingsKey
  }, [retryToken, mode, isSpecialized, limitedLiveData, holdingsKey]);

  const title =
    report?.title ??
    (isSpecialized
      ? localStatus.marketOpen
        ? "Your Portfolio Daily Briefing"
        : "Your Portfolio Wrap & Outlook"
      : localStatus.title);
  const marketOpen = report?.marketOpen ?? localStatus.marketOpen;
  const showLimitedNote =
    isSpecialized && (Boolean(report?.limitedLiveData) || limitedLiveData || Boolean(report?.warning?.includes("limited live data")));

  const sectionLabels = isSpecialized
    ? {
        heading: "Portfolio Synthesis",
        loadingTitle: "Analyzing your holdings…",
        loadingSub: "Mapping macro context to your positions",
        first: "Market Context",
        second: "Holdings Breakdown",
        third: "Portfolio Takeaway",
        chips: holdings.slice(0, 4).map((h) => h.symbol).filter(Boolean),
        sourceAi: "Personalized AI synthesis",
        sourceFallback: "Portfolio fallback",
      }
    : {
        heading: "Core Market Synthesis",
        loadingTitle: "Synthesizing US market tape…",
        loadingSub: "Pulling macro catalysts, index tone, and sentiment",
        first: "Macro Drivers",
        second: "Index Movements",
        third: "General Sentiment & Takeaway",
        chips: ["S&P 500", "Nasdaq", "Dow Jones"],
        sourceAi: "Live AI synthesis",
        sourceFallback: "Macro fallback",
      };

  return (
    <div className="fixed inset-0 z-[60] min-h-screen overflow-y-auto bg-[#000000]">
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
          {isSpecialized ? "Portfolio AI" : "AI Report"}
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            {isSpecialized ? <Briefcase size={22} /> : <Brain size={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-snug text-white sm:text-2xl">
              {title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1F2937] bg-[#0A0A0A] px-2.5 py-1 text-[10px] font-bold">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    marketOpen ? "bg-emerald-400 animate-pulse" : "bg-[#9CA3AF]"
                  }`}
                />
                <span className={marketOpen ? "text-emerald-400" : "text-[#9CA3AF]"}>
                  {marketOpen ? "Market open" : "Market closed"}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#1F2937] bg-[#0A0A0A] px-2.5 py-1 text-[10px] font-bold text-[#9CA3AF]">
                {isSpecialized ? <Briefcase size={10} /> : <Globe2 size={10} />}
                {isSpecialized ? "Specialized" : "General"}
              </div>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
              {isSpecialized ? <Briefcase size={15} /> : <Globe2 size={15} />}
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
              {sectionLabels.heading}
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
                  <p className="text-sm font-bold text-white">{sectionLabels.loadingTitle}</p>
                  <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{sectionLabels.loadingSub}</p>
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
              {showLimitedNote && (
                <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                  {LIMITED_LIVE_DATA_NOTE}
                </p>
              )}
              {report.warning && !report.warning.includes("limited live data") && (
                <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                  {report.warning}
                </p>
              )}

              <article className="space-y-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    {sectionLabels.first}
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.macroDrivers}
                  </p>
                </div>
                <div className="h-px bg-[#1F2937]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    {sectionLabels.second}
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.indexMovements}
                  </p>
                </div>
                <div className="h-px bg-[#1F2937]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    {sectionLabels.third}
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: BODY }}>
                    {report.sentimentTakeaway}
                  </p>
                </div>
              </article>

              <div className="mt-5 flex flex-wrap gap-2">
                {(sectionLabels.chips.length > 0
                  ? sectionLabels.chips
                  : isSpecialized
                    ? ["Portfolio"]
                    : ["S&P 500", "Nasdaq", "Dow Jones"]
                ).map((label) => (
                  <span
                    key={label}
                    className="rounded-lg border border-[#1F2937] bg-black/40 px-2.5 py-1 text-[10px] font-bold text-emerald-400"
                  >
                    {label}
                  </span>
                ))}
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  {report.source === "ai" ? sectionLabels.sourceAi : sectionLabels.sourceFallback}
                </span>
              </div>
              <p className="mt-4 text-center text-[10px] font-semibold italic leading-relaxed text-[#6B7280]">
                {report.disclaimer || EDUCATIONAL_DISCLAIMER}
              </p>
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
          Discuss with Sprout AI
        </button>
      </div>
    </div>
  );
}
