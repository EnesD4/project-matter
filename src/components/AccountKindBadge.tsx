import { BadgeCheck, PenLine } from "lucide-react";
import { holdingAccount, type AccountKind } from "../lib/accountKind";

type AccountKindBadgeProps = {
  kind?: AccountKind | null;
  compact?: boolean;
  className?: string;
};

export default function AccountKindBadge({
  kind = "paper",
  compact = false,
  className = "",
}: AccountKindBadgeProps) {
  const verified = kind === "verified";
  const label = verified
    ? compact
      ? "Verified"
      : "Verified Brokerage"
    : compact
      ? "Paper"
      : "Paper Account";

    return (
    <span
      className={`inline-flex max-w-full flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-extrabold uppercase tracking-wide ${
        verified
          ? "border-emerald-500/35 bg-emerald-500/12 text-[#6EE7B7]"
          : "border-amber-500/30 bg-amber-500/10 text-amber-200"
      } ${compact ? "text-[8px]" : "text-[9px]"} ${className}`.trim()}
      title={
        verified
          ? "Imported from an API-verified brokerage account"
          : "Manually logged paper holding — does not unlock investment badges"
      }
    >
      {verified ? <BadgeCheck size={compact ? 9 : 10} aria-hidden="true" /> : <PenLine size={compact ? 9 : 10} aria-hidden="true" />}
      {label}
    </span>
  );
}

export function PortfolioOriginBadges({
  holdings,
  className = "",
}: {
  holdings: Array<{ account?: AccountKind | null }>;
  className?: string;
}) {
  const hasVerified = holdings.some((holding) => holdingAccount(holding) === "verified");
  const hasPaper = holdings.some((holding) => holdingAccount(holding) === "paper");
  if (!hasVerified && !hasPaper) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {hasPaper ? <AccountKindBadge kind="paper" /> : null}
      {hasVerified ? <AccountKindBadge kind="verified" /> : null}
    </div>
  );
}
