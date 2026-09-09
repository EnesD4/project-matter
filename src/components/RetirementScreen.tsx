import React, { useEffect } from "react";
import RetirementPlanner, { type RetirementPlannerProps } from "./RetirementPlanner";

export type RetirementScreenProps = RetirementPlannerProps & {
  /** When false the planner stays mounted (for Net Worth) but is hidden. */
  visible?: boolean;
};

export default function RetirementScreen({
  visible = true,
  ...plannerProps
}: RetirementScreenProps) {
  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div aria-hidden={!visible}>
      <RetirementPlanner {...plannerProps} />
    </div>
  );
}
