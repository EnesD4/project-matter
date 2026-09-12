import { useEffect, useState } from "react";
import { getStoredUser } from "../lib/auth";
import {
  loadFinancialRoadmap,
  loadRoadmapTodoProgress,
  subscribeFinancialProfile,
  subscribeRoadmapTodos,
  type FinancialRoadmap,
  type RoadmapTodoProgress,
} from "../lib/roadmapService";

export function useFinancialRoadmap(userId?: string): FinancialRoadmap | null {
  const id = userId ?? getStoredUser()?.id;
  const [roadmap, setRoadmap] = useState<FinancialRoadmap | null>(() => loadFinancialRoadmap(id));

  useEffect(() => {
    const refresh = () => setRoadmap(loadFinancialRoadmap(id));
    refresh();
    return subscribeFinancialProfile(refresh);
  }, [id]);

  return roadmap;
}

export function useRoadmapTodoProgress(userId?: string): RoadmapTodoProgress {
  const id = userId ?? getStoredUser()?.id;
  const [progress, setProgress] = useState<RoadmapTodoProgress>(() => loadRoadmapTodoProgress(id));

  useEffect(() => {
    const refresh = () => setProgress(loadRoadmapTodoProgress(id));
    refresh();
    return subscribeRoadmapTodos(refresh);
  }, [id]);

  return progress;
}
