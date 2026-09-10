import {
  BookOpen,
  Compass,
  GraduationCap,
  HelpCircle,
  type LucideIcon,
  Trophy,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { getStoredUser } from "../lib/auth";
import { saveAcademyStartPhase } from "../lib/certificates";
import LessonsPhase1, { type PhaseId } from "./LessonsPhase1";

export type LessonsKnowledgeTier = "none" | "basics" | "intermediate" | "confident";

type KnowledgeOption = {
  id: LessonsKnowledgeTier;
  label: string;
  response: string;
  icon: LucideIcon;
  recommendedPhaseId: PhaseId;
};

const KNOWLEDGE_OPTIONS: KnowledgeOption[] = [
  {
    id: "none",
    label: "I don't know anything about finance",
    response: "That's completely normal! You can start right from the basics in Phase 1.",
    icon: HelpCircle,
    recommendedPhaseId: "phase-1",
  },
  {
    id: "basics",
    label: "I know a few basic things about finance",
    response: "Great foundation! You can sharpen your knowledge here and progress quickly.",
    icon: BookOpen,
    recommendedPhaseId: "phase-1",
  },
  {
    id: "intermediate",
    label: "I know about most topics",
    response: "Impressive! You can jump directly to intermediate and advanced strategies.",
    icon: Compass,
    recommendedPhaseId: "phase-2",
  },
  {
    id: "confident",
    label: "I'm confident about finance",
    response: "Pro level! You can test your mastery in Phase 3 and aim for the highest certificate.",
    icon: Trophy,
    recommendedPhaseId: "phase-3",
  },
];

function storageKey() {
  return `matterpro_lessons_knowledge_${getStoredUser()?.id ?? "anon"}`;
}

function isKnowledgeTier(value: string | null): value is LessonsKnowledgeTier {
  return value === "none" || value === "basics" || value === "intermediate" || value === "confident";
}

function readKnowledgeTier(): LessonsKnowledgeTier | null {
  try {
    const raw = localStorage.getItem(storageKey());
    return isKnowledgeTier(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeKnowledgeTier(tier: LessonsKnowledgeTier) {
  try {
    localStorage.setItem(storageKey(), tier);
  } catch {
    // Ignore quota / private-mode failures; the in-memory state still hides the pop-up this session.
  }
}

function recommendedPhaseFor(tier: LessonsKnowledgeTier | null): PhaseId {
  return KNOWLEDGE_OPTIONS.find((option) => option.id === tier)?.recommendedPhaseId ?? "phase-1";
}

export default function LessonsScreen({ active }: { active: boolean }) {
  const [savedTier, setSavedTier] = useState<LessonsKnowledgeTier | null>(() => readKnowledgeTier());
  const [selectedId, setSelectedId] = useState<LessonsKnowledgeTier | null>(null);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const selected = KNOWLEDGE_OPTIONS.find((option) => option.id === selectedId) ?? null;
  const showOnboarding = active && savedTier === null;

  useEffect(() => {
    if (!savedTier) return;
    const user = getStoredUser();
    saveAcademyStartPhase(user?.id ?? "anon", recommendedPhaseFor(savedTier));
  }, [savedTier]);

  const confirmTier = () => {
    if (!selected) return;
    writeKnowledgeTier(selected.id);
    const user = getStoredUser();
    saveAcademyStartPhase(user?.id ?? "anon", selected.recommendedPhaseId);
    setSavedTier(selected.id);
    setJustUnlocked(true);
  };

  return (
    <>
      <div
        className={justUnlocked ? "matter-pop" : undefined}
        aria-hidden={showOnboarding}
        style={showOnboarding ? { filter: "blur(2px)", pointerEvents: "none", userSelect: "none" } : undefined}
      >
        <LessonsPhase1
          recommendedPhaseId={savedTier ? recommendedPhaseFor(savedTier) : undefined}
          userId={getStoredUser()?.id}
          userName={getStoredUser()?.name}
        />
      </div>

      {showOnboarding && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-md overflow-y-auto rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 max-h-[min(88vh,720px)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lessons-onboarding-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <GraduationCap size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Lessons</p>
                <h2 id="lessons-onboarding-title" className="mt-0.5 text-base font-extrabold leading-snug text-white">
                  This is our lessons section!
                </h2>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              You can improve your financial knowledge here. For a better experience, what is your current financial
              knowledge level?
            </p>

            <div className="mt-4 space-y-2">
              {KNOWLEDGE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedId(option.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                      isSelected
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-[#1F1F1F] bg-black/20 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${
                        isSelected ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-400"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className={`pt-1.5 text-sm font-semibold leading-snug ${isSelected ? "text-white" : "text-slate-200"}`}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="matter-pop mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <p className="text-sm leading-relaxed text-emerald-100">{selected.response}</p>
              </div>
            )}

            <button
              type="button"
              disabled={!selected}
              onClick={confirmTier}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500"
            >
              Continue to your roadmap
            </button>
          </div>
        </div>
      )}
    </>
  );
}
