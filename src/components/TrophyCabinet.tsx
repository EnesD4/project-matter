import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Calendar,
  Castle,
  ChevronRight,
  Coins,
  Crown,
  Flag,
  Gem,
  Heart,
  Landmark,
  Layers,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Medal,
  Percent,
  PieChart,
  Repeat,
  Rocket,
  Shield,
  Shuffle,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import {
  formatTrophyUnlockedDate,
  trophyCompletionPct,
  TROPHY_SHELF_CAPACITY,
  TROPHY_SLOTS,
  type Trophy as TrophyItem,
  type TrophyId,
} from "../lib/achievements";

const ICON_BY_ID: Record<TrophyId, LucideIcon> = {
  firstStep: Sprout,
  tickerScout: Flag,
  cashCushion: Wallet,
  emergencyShield: Shield,
  fortressLiquidity: Castle,
  oldYou: Heart,
  thousand: Landmark,
  trio: Layers,
  inTheGreen: TrendingUp,
  compounder: Percent,
  fiveK: Coins,
  fiveTickers: LayoutGrid,
  indexBeliever: PieChart,
  habitStacker: Repeat,
  tenK: Gem,
  doubleDigit: ArrowUpRight,
  yearIn: Calendar,
  eightHoldings: Shuffle,
  twentyFiveK: Crown,
  hundredK: Rocket,
  fullRoster: Medal,
  millionPath: Sparkles,
};

const PREVIEW_COUNT = 5;

function TrophyGlyph({ id }: { id: TrophyId }) {
  const Icon = ICON_BY_ID[id];
  return <Icon strokeWidth={2.25} />;
}

function chunkShelves(trophies: TrophyItem[]): Array<Array<TrophyItem | null>> {
  const padded: Array<TrophyItem | null> = trophies.slice(0, TROPHY_SLOTS);
  while (padded.length < TROPHY_SLOTS) padded.push(null);
  const shelves: Array<Array<TrophyItem | null>> = [];
  for (let i = 0; i < padded.length; i += TROPHY_SHELF_CAPACITY) {
    shelves.push(padded.slice(i, i + TROPHY_SHELF_CAPACITY));
  }
  return shelves;
}

export function BadgeDisk({
  trophy,
  size,
  className = "",
}: {
  trophy: TrophyItem | null;
  size: "shelf" | "hero" | "preview" | "banner";
  className?: string;
}) {
  const sizeClass =
    size === "hero"
      ? "trophy-badge-disk--hero"
      : size === "preview"
        ? "trophy-badge-disk--preview"
        : size === "banner"
          ? "trophy-badge-disk--banner"
          : "trophy-badge-disk--shelf";
  if (!trophy) {
    return (
      <span className={`trophy-badge-disk ${sizeClass} trophy-badge-disk--empty ${className}`} aria-hidden="true" />
    );
  }
  return (
    <span
      className={`trophy-badge-disk ${sizeClass} ${
        trophy.unlocked ? "trophy-badge-disk--unlocked" : "trophy-badge-disk--locked"
      } ${className}`}
      aria-hidden="true"
    >
      <span className="trophy-badge-disk__icon">
        <TrophyGlyph id={trophy.id} />
      </span>
    </span>
  );
}

function BadgeDetailModal({
  trophy,
  dialogId,
  titleId,
  onClose,
}: {
  trophy: TrophyItem;
  dialogId: string;
  titleId: string;
  onClose: () => void;
}) {
  const unlockedDate = formatTrophyUnlockedDate(trophy.unlockedAt);
  const pct = trophy.unlocked ? 100 : trophyCompletionPct(trophy);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        id={dialogId}
        className="matter-pop w-full max-w-sm overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-end px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close badge details"
            className="rounded-lg p-1 text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col items-center px-6 pb-6 pt-1 text-center">
          <BadgeDisk trophy={trophy} size="hero" />
          <h3 id={titleId} className="mt-4 text-lg font-extrabold tracking-tight text-white">
            {trophy.title}
          </h3>
          {trophy.unlocked ? (
            <span className="mt-2 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#10B981]">
              Unlocked{unlockedDate ? ` · ${unlockedDate}` : ""}
            </span>
          ) : (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#1F2937] bg-black/40 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#6B7280]">
              <Lock size={10} aria-hidden="true" />
              Locked
            </span>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-[#9CA3AF]">{trophy.requirement}</p>
          <p className="mt-2 text-[13px] font-semibold leading-snug text-white">
            {trophy.title} — {trophy.metric}
          </p>
          <div className="mt-4 w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1F2937]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  background: trophy.unlocked ? "#10B981" : "#6B7280",
                }}
              />
            </div>
            <p
              className={`mt-1.5 text-[11px] font-semibold tabular-nums ${
                trophy.unlocked ? "text-emerald-300/90" : "text-[#6B7280]"
              }`}
            >
              {trophy.unlocked ? "100% Complete" : `${Math.round(pct)}% Complete`}
            </p>
            {trophy.unlocked && unlockedDate ? (
              <p className="mt-1 text-[11px] text-[#6B7280]">Date unlocked: {unlockedDate}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function UpcomingList({
  trophies,
  onOpen,
}: {
  trophies: TrophyItem[];
  onOpen: (trophy: TrophyItem) => void;
}) {
  const ranked = useMemo(
    () =>
      [...trophies]
        .filter((trophy) => !trophy.unlocked)
        .sort((a, b) => trophyCompletionPct(b) - trophyCompletionPct(a)),
    [trophies]
  );

  if (ranked.length === 0) {
    return (
      <p className="m-0 px-1 py-8 text-center text-[12px] font-semibold text-[#9CA3AF]">
        Every badge is unlocked. Cabinet complete.
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {ranked.map((trophy) => {
        const pct = trophyCompletionPct(trophy);
        return (
          <li key={trophy.id}>
            <button
              type="button"
              onClick={() => onOpen(trophy)}
              className="flex w-full items-center gap-3 rounded-xl border border-[#1F2937] bg-black/35 px-3 py-2.5 text-left transition hover:border-[#374151] hover:bg-white/[0.03]"
            >
              <BadgeDisk trophy={trophy} size="shelf" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-extrabold leading-snug text-[#E5E7EB]">{trophy.title}</span>
                  <span className="flex-shrink-0 text-[10px] font-extrabold tabular-nums text-[#9CA3AF]">
                    {Math.round(pct)}% Complete
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-[#6B7280]">
                  {trophy.progress.label}
                </span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[#1F2937]">
                  <span
                    className="block h-full rounded-full bg-[#6B7280] transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ShelfDisplay({
  shelves,
  onOpen,
}: {
  shelves: Array<Array<TrophyItem | null>>;
  onOpen: (trophy: TrophyItem) => void;
}) {
  return (
    <div className="trophy-cabinet-case" role="list" aria-label="Trophy badge display">
      {shelves.map((shelf, shelfIndex) => (
        <div key={shelfIndex} className="trophy-shelf" role="presentation">
          <div className="trophy-shelf__row">
            {shelf.map((trophy, slotIndex) =>
              trophy ? (
                <button
                  key={trophy.id}
                  type="button"
                  role="listitem"
                  onClick={() => onOpen(trophy)}
                  className="trophy-shelf__slot"
                  aria-label={`${trophy.title}, ${trophy.unlocked ? "unlocked" : "locked"}. ${trophy.metric}`}
                >
                  <BadgeDisk trophy={trophy} size="shelf" />
                </button>
              ) : (
                <span key={`empty-${shelfIndex}-${slotIndex}`} className="trophy-shelf__slot" role="presentation">
                  <BadgeDisk trophy={null} size="shelf" />
                </span>
              )
            )}
          </div>
          <div className="trophy-shelf__rail" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

function CabinetModal({
  trophies,
  shelves,
  unlockedCount,
  dialogId,
  titleId,
  upcoming,
  onToggleUpcoming,
  onClose,
  onOpenBadge,
}: {
  trophies: TrophyItem[];
  shelves: Array<Array<TrophyItem | null>>;
  unlockedCount: number;
  dialogId: string;
  titleId: string;
  upcoming: boolean;
  onToggleUpcoming: () => void;
  onClose: () => void;
  onOpenBadge: (trophy: TrophyItem) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        id={dialogId}
        className="matter-pop flex max-h-[min(90vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1F2937] px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close trophy cabinet"
              className="mt-0.5 rounded-lg p-1 text-[#9CA3AF] transition hover:bg-white/5 hover:text-white"
            >
              <X size={16} />
            </button>
            <div className="min-w-0 pt-0.5">
              <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-extrabold text-white">
                <Trophy size={14} className="flex-shrink-0 text-[#10B981]" aria-hidden="true" />
                Trophy Cabinet
              </h3>
              <p className="mt-0.5 text-[11px] font-bold tabular-nums text-[#6B7280]">
                {unlockedCount} of {TROPHY_SLOTS} unlocked
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={upcoming}
            aria-label={upcoming ? "Show trophy shelves" : "Show upcoming badges"}
            onClick={onToggleUpcoming}
            className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold transition ${
              upcoming
                ? "border-emerald-500/40 bg-emerald-500/15 text-[#10B981]"
                : "border-[#1F2937] bg-black/40 text-[#9CA3AF] hover:border-[#374151] hover:text-white"
            }`}
          >
            <Target size={11} aria-hidden="true" />
            Upcoming Badges
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          <div key={upcoming ? "upcoming" : "shelves"} className="trophy-cabinet-view">
            {upcoming ? (
              <div className="trophy-cabinet-case trophy-cabinet-case--list">
                <UpcomingList trophies={trophies} onOpen={onOpenBadge} />
              </div>
            ) : (
              <ShelfDisplay shelves={shelves} onOpen={onOpenBadge} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TrophyCabinet({ trophies }: { trophies: TrophyItem[] }) {
  const [open, setOpen] = useState(false);
  const [upcoming, setUpcoming] = useState(false);
  const [selected, setSelected] = useState<TrophyItem | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const badgeDialogId = useId();
  const badgeTitleId = useId();
  const unlockedCount = trophies.filter((trophy) => trophy.unlocked).length;
  const lockedCount = trophies.length - unlockedCount;
  const shelves = useMemo(() => chunkShelves(trophies), [trophies]);
  const preview = trophies.slice(0, PREVIEW_COUNT);

  const closeCabinet = () => {
    setOpen(false);
    setUpcoming(false);
    setSelected(null);
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selected) {
        setSelected(null);
        return;
      }
      closeCabinet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-3.5 text-left transition hover:border-[#2A2A2A] hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] bg-emerald-500/12">
          <Trophy size={16} color="#10B981" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-white">Trophy Cabinet</span>
          <span className="mt-0.5 block text-[12px] text-[#9CA3AF]">
            {unlockedCount} of {TROPHY_SLOTS} unlocked
            {lockedCount > 0 ? ` · ${lockedCount} remaining` : " · Cabinet complete"}
          </span>
          <span className="mt-2 flex items-center" aria-hidden="true">
            {preview.map((trophy, index) => (
              <span key={trophy.id} className="relative" style={{ marginLeft: index === 0 ? 0 : -8, zIndex: PREVIEW_COUNT - index }}>
                <BadgeDisk trophy={trophy} size="preview" />
              </span>
            ))}
          </span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1">
          <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-[#6EE7B7]">
            {unlockedCount}/{TROPHY_SLOTS}
          </span>
          <ChevronRight size={16} color="#9CA3AF" aria-hidden="true" />
        </span>
      </button>

      {open
        ? createPortal(
            <CabinetModal
              trophies={trophies}
              shelves={shelves}
              unlockedCount={unlockedCount}
              dialogId={dialogId}
              titleId={titleId}
              upcoming={upcoming}
              onToggleUpcoming={() => {
                setSelected(null);
                setUpcoming((value) => !value);
              }}
              onClose={closeCabinet}
              onOpenBadge={setSelected}
            />,
            document.body
          )
        : null}

      {selected
        ? createPortal(
            <BadgeDetailModal
              trophy={selected}
              dialogId={badgeDialogId}
              titleId={badgeTitleId}
              onClose={() => setSelected(null)}
            />,
            document.body
          )
        : null}
    </>
  );
}
