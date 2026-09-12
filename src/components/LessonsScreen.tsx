import React from "react";
import { useFinancialRoadmap } from "../hooks/useFinancialRoadmap";
import { getStoredUser } from "../lib/auth";
import LessonsPhase1 from "./LessonsPhase1";

function legacyUnlockAll(): boolean {
  try {
    const userId = getStoredUser()?.id ?? "anon";
    const raw =
      localStorage.getItem(`sprout_lessons_knowledge_${userId}`) ??
      localStorage.getItem(`matterpro_lessons_knowledge_${userId}`);
    return raw === "intermediate" || raw === "confident" || raw === "advanced" || raw === "experienced";
  } catch {
    return false;
  }
}

export default function LessonsScreen({
  onOpenPaperPortfolio,
}: {
  active?: boolean;
  onOpenPaperPortfolio?: () => void;
}) {
  const roadmap = useFinancialRoadmap();
  const unlockAllPhases = roadmap?.unlockAllPhases ?? legacyUnlockAll();

  return (
    <LessonsPhase1
      recommendedPhaseId={roadmap?.recommendedPhaseId}
      phaseOrder={roadmap?.phaseOrder}
      lockedPhaseIds={roadmap?.lockedPhaseIds}
      lockReason={roadmap?.lockReason}
      unlockAllPhases={unlockAllPhases}
      userId={getStoredUser()?.id}
      userName={getStoredUser()?.name}
      onOpenPaperPortfolio={onOpenPaperPortfolio}
    />
  );
}
