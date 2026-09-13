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

function PlaidLinkOpener({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: PlaidLinkOnSuccess;
  onExit: PlaidLinkOnExit;
}) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });

  useEffect(() => {
    if (ready && token) open();
  }, [open, ready, token]);

  return null;
}

export default function PlaidConnectButton({ className = "", onConnected }: PlaidConnectButtonProps) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

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
        setLinkToken(null);
      }
    },
    [onConnected]
  );

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (publicToken, metadata) => {
      void finishSuccess(publicToken || "", metadata);
    },
    [finishSuccess]
  );

  const onExit = useCallback<PlaidLinkOnExit>((err) => {
    setLinkToken(null);
    if (err?.error_code === "INVALID_LINK_TOKEN") {
      setError("The Plaid session expired. Try connecting again.");
    }
    setStatus((current) => (current === "connected" ? current : "idle"));
  }, []);

  const start = async () => {
    if (status !== "idle") return;
    setStatus("connecting");
    setError(null);
    try {
      const token = await createPlaidLinkToken();
      setLinkToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Plaid Link.");
      setStatus("idle");
    }
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

  return (
    <div className="space-y-2">
      {linkToken ? <PlaidLinkOpener token={linkToken} onSuccess={onSuccess} onExit={onExit} /> : null}
      <button
        type="button"
        onClick={() => void start()}
        disabled={status === "connecting"}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80 ${className}`}
      >
        {status === "connecting" ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
        {status === "connecting" ? "Opening Plaid…" : "Connect Bank"}
      </button>
      {error ? <p className="text-center text-[12px] font-semibold text-rose-300">{error}</p> : null}
    </div>
  );
}
