import { Check, Landmark, Loader2, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";
import {
  createPlaidLinkToken,
  dispatchPlaidConnected,
  exchangePlaidPublicToken,
  type PlaidLinkResult,
} from "../lib/plaidLink";

export type PlaidConnectMode = "bank" | "brokerage";

type PlaidConnectButtonProps = {
  className?: string;
  /** bank = checking/savings cash flow; brokerage = Investments API (holdings + cash). */
  mode?: PlaidConnectMode;
  label?: string;
  connectedLabel?: string;
  /** Optional broker name shown while opening Link (e.g. "Robinhood"). */
  institutionHint?: string | null;
  onConnected?: (result: PlaidLinkResult) => void;
  /** When false, token is fetched on first click instead of mount. */
  preload?: boolean;
  /** Auto-open Plaid Link once the token is ready (used by ConnectBrokerModal). */
  autoOpen?: boolean;
};

export default function PlaidConnectButton({
  className = "",
  mode = "bank",
  label,
  connectedLabel,
  institutionHint = null,
  onConnected,
  preload = true,
  autoOpen = false,
}: PlaidConnectButtonProps) {
  const [status, setStatus] = useState<"loading" | "idle" | "connecting" | "connected">(
    preload ? "loading" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [shouldAutoOpen, setShouldAutoOpen] = useState(autoOpen);

  const loadToken = useCallback(async () => {
    setStatus((current) => (current === "connected" ? current : "loading"));
    setError(null);
    try {
      const token = await createPlaidLinkToken(mode);
      setLinkToken(token);
      setStatus((current) => (current === "connected" ? current : "idle"));
    } catch (err) {
      setLinkToken(null);
      setError(err instanceof Error ? err.message : "Could not start Plaid Link.");
      setStatus((current) => (current === "connected" ? current : "idle"));
    }
  }, [mode]);

  useEffect(() => {
    if (preload) void loadToken();
  }, [loadToken, preload]);

  useEffect(() => {
    if (autoOpen) setShouldAutoOpen(true);
  }, [autoOpen]);

  const finishSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } | null }) => {
      try {
        const result = await exchangePlaidPublicToken(publicToken, metadata.institution || undefined);
        dispatchPlaidConnected(result);
        onConnected?.(result);
        setStatus("connected");
        setLinkToken(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect this account.");
        setStatus("idle");
        void loadToken();
      }
    },
    [loadToken, onConnected]
  );

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      void finishSuccess(publicToken || "", metadata);
    },
    [finishSuccess]
  );

  const onExit = useCallback<PlaidLinkOnExit>((err) => {
    if (err?.error_code === "INVALID_LINK_TOKEN") {
      setError("The Plaid session expired. Try connecting again.");
      void loadToken();
    }
    setShouldAutoOpen(false);
    setStatus((current) => (current === "connected" ? current : "idle"));
  }, [loadToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const start = useCallback(() => {
    if (status === "connected" || status === "connecting") return;
    if (!linkToken || !ready) {
      setShouldAutoOpen(true);
      void loadToken();
      return;
    }
    setError(null);
    setStatus("connecting");
    setShouldAutoOpen(false);
    open();
  }, [linkToken, loadToken, open, ready, status]);

  useEffect(() => {
    if (!shouldAutoOpen || status === "connected" || status === "connecting") return;
    if (!linkToken || !ready) return;
    setError(null);
    setStatus("connecting");
    setShouldAutoOpen(false);
    open();
  }, [linkToken, open, ready, shouldAutoOpen, status]);

  if (status === "connected") {
    return (
      <p
        className={`flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-extrabold text-emerald-300 ${className}`}
      >
        <Check size={16} />
        {connectedLabel || (mode === "brokerage" ? "Brokerage connected" : "Bank connected")}
      </p>
    );
  }

  const busy = status === "loading" || status === "connecting";
  const Icon = mode === "brokerage" ? Wallet : Landmark;
  const defaultLabel =
    mode === "brokerage"
      ? institutionHint
        ? `Connect ${institutionHint}`
        : "Connect Brokerage"
      : "Connect Bank";
  const buttonLabel =
    status === "connecting"
      ? institutionHint
        ? `Opening ${institutionHint}…`
        : "Opening Plaid…"
      : status === "loading"
        ? "Preparing Plaid…"
        : label || defaultLabel;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy || (!ready && !error && Boolean(linkToken))}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80 ${className}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        {buttonLabel}
      </button>
      {error ? <p className="text-center text-[12px] font-semibold text-rose-300">{error}</p> : null}
    </div>
  );
}
