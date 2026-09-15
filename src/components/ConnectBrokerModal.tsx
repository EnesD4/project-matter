import { Check, Search, Wallet, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { clearbitLogoUrl } from "../lib/assetLogos";
import { type PlaidLinkResult } from "../lib/plaidLink";
import PlaidConnectButton from "./PlaidConnectButton";

export type BrokerPlatform = {
  name: string;
  tag: string;
  color: string;
  domain: string;
  initials: string;
  /** Optional keywords used to mark a platform as linked after Plaid success. */
  match?: RegExp;
};

/** Featured US brokerages for the dedicated Connect Brokerage flow. */
export const FEATURED_US_BROKERAGES: BrokerPlatform[] = [
  {
    name: "Robinhood",
    tag: "Popular for stocks & options",
    color: "#00C805",
    domain: "robinhood.com",
    initials: "RH",
    match: /robinhood/i,
  },
  {
    name: "Fidelity",
    tag: "Full-service investing",
    color: "#4B8B3B",
    domain: "fidelity.com",
    initials: "F",
    match: /fidelity/i,
  },
  {
    name: "Charles Schwab",
    tag: "Trusted wealth platform",
    color: "#00A0DF",
    domain: "schwab.com",
    initials: "CS",
    match: /schwab/i,
  },
  {
    name: "E*TRADE",
    tag: "Morgan Stanley brokerage",
    color: "#6633CC",
    domain: "etrade.com",
    initials: "ET",
    match: /e\s*\*?\s*trade|etrade/i,
  },
  {
    name: "Webull",
    tag: "Commission-free trading",
    color: "#E11D2E",
    domain: "webull.com",
    initials: "WB",
    match: /webull/i,
  },
];

function BrokerLogo({ platform }: { platform: BrokerPlatform }) {
  const [failed, setFailed] = useState(false);
  const src = clearbitLogoUrl(platform.domain, 128);

  return (
    <span
      className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl"
      style={{ background: `${platform.color}22`, color: platform.color }}
    >
      {failed ? (
        <span className="text-[11px] font-extrabold tracking-tight">{platform.initials}</span>
      ) : (
        <img
          src={src}
          alt={`${platform.name} logo`}
          width={28}
          height={28}
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          className="pointer-events-none h-7 w-7 select-none rounded-md object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

type ConnectBrokerModalProps = {
  open: boolean;
  onClose: () => void;
  onConnected?: (result: PlaidLinkResult) => void;
  /** Institution names already linked (optional; also listens to Plaid events). */
  linkedInstitutions?: string[];
};

/**
 * Dedicated brokerage selection modal.
 * Opens Plaid Link pre-filtered to US investment institutions (Investments product)
 * so holdings, ticker positions, and uninvested cash sync via the Investments API.
 */
export default function ConnectBrokerModal({
  open,
  onClose,
  onConnected,
  linkedInstitutions = [],
}: ConnectBrokerModalProps) {
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [searchAll, setSearchAll] = useState(false);
  const [linkedNames, setLinkedNames] = useState<string[]>(linkedInstitutions);

  useEffect(() => {
    if (!open) {
      setSelectedBroker(null);
      setSearchAll(false);
    }
  }, [open]);

  useEffect(() => {
    setLinkedNames(linkedInstitutions);
  }, [linkedInstitutions]);

  const handleConnected = useCallback(
    (result: PlaidLinkResult) => {
      const name = String(result.institution || "").trim();
      if (name) {
        setLinkedNames((prev) => (prev.some((item) => item.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]));
      }
      onConnected?.(result);
      onClose();
    },
    [onClose, onConnected]
  );

  const linkedSet = useMemo(() => {
    const set = new Set<string>();
    for (const name of linkedNames) {
      const lower = name.toLowerCase();
      set.add(lower);
      for (const platform of FEATURED_US_BROKERAGES) {
        if (platform.match?.test(name) || lower.includes(platform.name.toLowerCase())) {
          set.add(platform.name.toLowerCase());
        }
      }
    }
    return set;
  }, [linkedNames]);

  const launching = Boolean(selectedBroker) || searchAll;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="matter-pop matter-touch-scroll w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 max-h-[min(88vh,720px)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-broker-modal-title"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Wallet size={17} />
            </span>
            <div className="min-w-0">
              <h3 id="connect-broker-modal-title" className="text-sm font-extrabold leading-snug text-white">
                Connect Brokerage
              </h3>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Link a US broker via Plaid to import holdings, tickers, and uninvested cash.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 text-slate-400 transition hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300">
            Plaid Investments
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
            Plaid Link is filtered to investment institutions. We sync equity positions and brokerage
            cash from the Investments API, and pull transaction cash flows when the broker supports them.
          </p>
          {!launching ? (
            <button
              type="button"
              onClick={() => {
                setSelectedBroker(null);
                setSearchAll(true);
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
            >
              <Search size={16} />
              Search all US brokerages
            </button>
          ) : searchAll && !selectedBroker ? (
            <div className="mt-3">
              <PlaidConnectButton
                mode="brokerage"
                label="Connect Brokerage via Plaid"
                preload
                autoOpen
                onConnected={handleConnected}
              />
              <button
                type="button"
                onClick={() => setSearchAll(false)}
                className="mt-2 w-full text-center text-[11px] font-semibold text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 space-y-2.5">
          <p className="px-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Popular US brokerages
          </p>
          {FEATURED_US_BROKERAGES.map((platform) => {
            const isLinked = linkedSet.has(platform.name.toLowerCase());
            const isSelected = selectedBroker === platform.name;
            return (
              <div
                key={platform.name}
                className={`rounded-2xl border bg-black/30 p-3 transition ${
                  isSelected
                    ? "border-emerald-500/50"
                    : "border-[#1F1F1F] hover:border-emerald-500/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <BrokerLogo platform={platform} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-white">{platform.name}</p>
                    <p className="truncate text-[11px] text-slate-400">{platform.tag}</p>
                  </div>
                </div>
                {isLinked ? (
                  <p className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-bold text-emerald-300">
                    <Check size={12} />
                    Linked
                  </p>
                ) : isSelected ? (
                  <div className="mt-2.5">
                    <PlaidConnectButton
                      mode="brokerage"
                      institutionHint={platform.name}
                      label={`Connect ${platform.name} Brokerage via Plaid`}
                      preload
                      autoOpen
                      onConnected={handleConnected}
                    />
                    <p className="mt-2 text-center text-[10px] leading-snug text-slate-500">
                      In Plaid, search for {platform.name} to finish linking your investment account.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedBroker(null)}
                      className="mt-1.5 w-full text-center text-[11px] font-semibold text-slate-400 transition hover:text-white"
                    >
                      Choose a different broker
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchAll(false);
                      setSelectedBroker(platform.name);
                    }}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    Connect Brokerage via Plaid
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
