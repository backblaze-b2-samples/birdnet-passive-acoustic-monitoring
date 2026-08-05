import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DetectionRunStatus } from "@birdnet-pam/shared";

const CONFIG: Record<
  DetectionRunStatus,
  { label: string; className: string; spin?: boolean; Icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
    Icon: Clock,
  },
  running: {
    label: "Detecting…",
    className: "bg-[var(--brand-b2)]/15 text-[var(--brand-b2)]",
    spin: true,
    Icon: Loader2,
  },
  completed: {
    label: "Completed",
    className: "bg-[var(--success)]/15 text-[var(--success)]",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/15 text-destructive",
    Icon: AlertCircle,
  },
};

export function RunStatus({ status }: { status: DetectionRunStatus }) {
  const { label, className, spin, Icon } = CONFIG[status];
  return (
    <Badge variant="outline" className={`gap-1.5 border-transparent ${className}`}>
      <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} aria-hidden />
      {label}
    </Badge>
  );
}
