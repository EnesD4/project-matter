import { Briefcase, Landmark, Sparkles, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getStoredUser } from "../lib/auth";
import { applyDemoScenario, inferProfileFromBalances } from "../lib/demoScenarios";
import {
  bottleneckFromPrimaryGoal,
  hasFinancialProfile,
  loadFinancialProfile,
  loadFinancialRoadmap,
  saveFinancialProfile,
  type FinancialProfileAnswers,
  type FinancialRoadmap,
} from "../lib/roadmapService";
import CustomDemoBuilderModal from "./CustomDemoBuilderModal";
import GoalIntakeStep, { type GoalIntakeResult } from "./GoalIntakeStep";
import PlaidConnectButton from "./PlaidConnectButton";

type FinancialOnboardingModalProps = {
  open: boolean;
  allowCancel?: boolean;
  initialAnswers?: unknown;
  onClose?: () => void;
  onComplete?: (roadmap: FinancialRoadmap) => void;
};

type Phase = "connect" | "goals";

export default function FinancialOnboardingModal({
  open,
  allowCancel = false,
  onClose,
  onComplete,
}: FinancialOnboardingModalProps) {
  const [connected, setConnected] = useState(false);
  const [customDemoOpen, setCustomDemoOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("connect");
  const [pendingRoadmap, setPendingRoadmap] = useState<FinancialRoadmap | null>(null);

  useEffect(() => {
    if (!open) return;
    setConnected(false);
    setCustomDemoOpen(false);
    setPhase("connect");
    setPendingRoadmap(null);
  }, [open]);

  if (!open) return null;

  const finish = (roadmap: FinancialRoadmap) => {
    setConnected(true);
    onComplete?.(roadmap);
  };

  const afterConnect = (roadmap: FinancialRoadmap) => {
    setPendingRoadmap(roadmap);
    setPhase("goals");
  };

  const applyGoalIntake = (result: GoalIntakeResult) => {
    const userId = getStoredUser()?.id;
    const existing = pendingRoadmap?.profile ?? loadFinancialProfile(userId);
    const liquidSavings = existing?.liquidSavings ?? null;
    const bottleneck =
      result.primaryGoal != null
        ? bottleneckFromPrimaryGoal(result.primaryGoal, liquidSavings)
        : existing?.bottleneck ?? "emergency-safety-net";
    const answers: FinancialProfileAnswers = {
      stateCode: existing?.stateCode ?? null,
      monthlyIncome: existing?.monthlyIncome ?? 0,
      monthlyEssentialExpenses: existing?.monthlyEssentialExpenses ?? 0,
      bottleneck,
      knowledgeLevel: existing?.knowledgeLevel ?? "beginner",
      liquidSavings,
      primaryGoal: result.primaryGoal,
    };
    const roadmap = saveFinancialProfile(answers, userId);
    finish(roadmap);
    onClose?.();
  };

  const handleClose = () => {
    if (!connected && !hasFinancialProfile(getStoredUser()?.id)) {
      const roadmap = saveFinancialProfile(
        {
          stateCode: null,
          monthlyIncome: 0,
          monthlyEssentialExpenses: 0,
          bottleneck: "emergency-safety-net",
          knowledgeLevel: "beginner",
          liquidSavings: null,
          primaryGoal: null,
        },
        getStoredUser()?.id
      );
      onComplete?.(roadmap);
    }
    onClose?.();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
        role="presentation"
        onClick={allowCancel || connected ? handleClose : undefined}
      >
        <div
          className="matter-pop my-auto flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-y-auto rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bank-connect-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-400">
                {phase === "goals" ? "Goals" : "Connect Bank"}
              </p>
              <h2 id="bank-connect-title" className="mt-1 text-xl font-extrabold tracking-tight text-white">
                {phase === "goals" ? "Personalize your roadmap" : "Connect a bank"}
              </h2>
              {phase === "connect" ? (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                  Open Plaid Link, connect a brokerage, or build a custom demo. Cash flow and holdings sync
                  into your profile for Sprout AI.
                </p>
              ) : null}
            </div>
            {allowCancel || connected ? (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-slate-200"
              >
                <X size={16} />
              </button>
            ) : null}
          </header>

          {phase === "goals" ? (
            <GoalIntakeStep variant="modal" onComplete={applyGoalIntake} />
          ) : (
            <>
              <div className="space-y-4 px-5 py-4">
                <div className="rounded-2xl border border-[#1F1F1F] bg-black/30 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                      <Landmark size={16} />
                    </span>
                    Plaid Link
                  </div>
                  <PlaidConnectButton
                    onConnected={(result) => {
                      const investments = result.holdings.reduce(
                        (sum, lot) => sum + lot.shares * lot.buyPrice,
                        0
                      );
                      const monthlyEssentialExpenses = result.expenses.reduce(
                        (sum, item) => sum + item.amount,
                        0
                      );
                      const roadmap = saveFinancialProfile(
                        inferProfileFromBalances({
                          cash: result.chaseChecking,
                          hysa: result.marcusHysa + (result.moneyMarket ?? 0),
                          investments,
                          monthlyIncome: result.monthlyIncome,
                          monthlyEssentialExpenses,
                        }),
                        getStoredUser()?.id
                      );
                      afterConnect(roadmap);
                    }}
                  />
                  <p className="mt-2 text-center text-[11px] font-semibold leading-relaxed text-slate-500">
                    Sandbox login: user_good / pass_good. Choose any Plaid test institution.
                  </p>
                </div>

                <div className="rounded-2xl border border-[#1F1F1F] bg-black/30 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
                    <span className="grid h-9 w-9 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
                      <Briefcase size={16} />
                    </span>
                    Brokerage
                  </div>
                  <PlaidConnectButton
                    mode="brokerage"
                    label="Connect Brokerage via Plaid"
                    onConnected={(result) => {
                      const investments = result.holdings.reduce(
                        (sum, lot) => sum + lot.shares * lot.buyPrice,
                        0
                      );
                      const monthlyEssentialExpenses = result.expenses.reduce(
                        (sum, item) => sum + item.amount,
                        0
                      );
                      const roadmap = saveFinancialProfile(
                        inferProfileFromBalances({
                          cash: result.chaseChecking,
                          hysa: result.marcusHysa + (result.moneyMarket ?? 0),
                          investments,
                          monthlyIncome: result.monthlyIncome,
                          monthlyEssentialExpenses,
                        }),
                        getStoredUser()?.id
                      );
                      afterConnect(roadmap);
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setCustomDemoOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-extrabold text-emerald-100 transition hover:bg-emerald-500/20"
                >
                  <Sparkles size={16} className="text-emerald-400" />
                  Create Custom Demo Profile
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const detail = applyDemoScenario("balanced", getStoredUser()?.id);
                    const roadmap = saveFinancialProfile(detail.profile, getStoredUser()?.id);
                    afterConnect(roadmap);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-4 py-3 text-sm font-extrabold text-slate-200 transition hover:border-emerald-500/30 hover:bg-[#161616]"
                >
                  Use balanced demo bank data
                </button>
              </div>

              <div className="border-t border-[#1F1F1F] px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasFinancialProfile(getStoredUser()?.id)) {
                      const roadmap = saveFinancialProfile(
                        {
                          stateCode: null,
                          monthlyIncome: 0,
                          monthlyEssentialExpenses: 0,
                          bottleneck: "emergency-safety-net",
                          knowledgeLevel: "beginner",
                        },
                        getStoredUser()?.id
                      );
                      afterConnect(roadmap);
                      return;
                    }
                    const existing = loadFinancialRoadmap(getStoredUser()?.id);
                    if (existing) afterConnect(existing);
                    else setPhase("goals");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-4 py-3 text-sm font-extrabold text-white transition hover:border-emerald-500/40 hover:bg-[#161616]"
                >
                  <Sparkles size={16} className="text-emerald-400" />
                  Skip for now
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <CustomDemoBuilderModal
        open={customDemoOpen}
        onClose={() => setCustomDemoOpen(false)}
        onApplied={(detail) => {
          setCustomDemoOpen(false);
          const roadmap = saveFinancialProfile(detail.profile, getStoredUser()?.id);
          afterConnect(roadmap);
        }}
      />
    </>
  );
}
