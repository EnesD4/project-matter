import { Check, Landmark, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";
import {
  createPlaidLinkToken,
  dispatchPlaidConnected,
  exchangePlaidPublicToken,
  type PlaidLinkResult,
} from "../lib/plaidLink";

type PlaidConnectButtonProps = {
  className?: string;
  onConnected?: (result: PlaidLinkResult) => void;
};

export default function PlaidConnectButton({ className = "", onConnected }: PlaidConnectButtonProps) {
  const [status, setStatus] = useState<"loading" | "idle" | "connecting" | "connected">("loading");
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const loadToken = useCallback(async () => {
    setStatus((current) => (current === "connected" ? current : "loading"));
    setError(null);
    try {
      const token = await createPlaidLinkToken();
      setLinkToken(token);
      setStatus((current) => (current === "connected" ? current : "idle"));
    } catch (err) {
      setLinkToken(null);
      setError(err instanceof Error ? err.message : "Could not start Plaid Link.");
      setStatus((current) => (current === "connected" ? current : "idle"));
    }
  }, []);

  useEffect(() => {
    void loadToken();
  }, [loadToken]);

  const finishSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } | null }) => {
      try {
        const result = await exchangePlaidPublicToken(publicToken, metadata.institution || undefined);
        dispatchPlaidConnected(result);
        onConnected?.(result);
        setStatus("connected");
        setLinkToken(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not connect this bank.");
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
    setStatus((current) => (current === "connected" ? current : "idle"));
  }, [loadToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const start = () => {
    if (status === "connected" || status === "connecting" || status === "loading") return;
    if (!linkToken || !ready) {
      void loadToken();
      return;
    }
    setError(null);
    setStatus("connecting");
    open();
  };

  if (status === "connected") {
    return (
      <p
        className={`flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-extrabold text-emerald-300 ${className}`}
      >
        <Check size={16} />
        Bank connected
      </p>
    );
  }

  const busy = status === "loading" || status === "connecting";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy || (!ready && !error)}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80 ${className}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
        {status === "connecting" ? "Opening Plaid…" : status === "loading" ? "Preparing Plaid…" : "Connect Bank"}
      </button>
      {error ? <p className="text-center text-[12px] font-semibold text-rose-300">{error}</p> : null}
    </div>
  );
}
