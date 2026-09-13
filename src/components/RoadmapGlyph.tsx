import { AlertTriangle, Shield, TrendingUp, type LucideIcon } from "lucide-react";
import type { FinancialArchetype } from "../lib/roadmapService";

const ICONS: Record<FinancialArchetype, LucideIcon> = {
  survival: AlertTriangle,
  "micro-match": Shield,
  wealth: TrendingUp,
};

export default function RoadmapGlyph({
  archetype,
  size = 16,
  className,
  color,
}: {
  archetype: FinancialArchetype;
  size?: number;
  className?: string;
  color?: string;
}) {
  const Icon = ICONS[archetype];
  return <Icon size={size} className={className} color={color} aria-hidden />;
}
