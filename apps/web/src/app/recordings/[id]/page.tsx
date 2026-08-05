"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Download, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DetectionTimeline } from "@/components/recordings/detection-timeline";
import { SpeciesSummary } from "@/components/recordings/species-summary";
import { ClipList } from "@/components/recordings/clip-list";
import { DetectionRunningState } from "@/components/recordings/detection-running-state";
import { RunStatus } from "@/components/recordings/run-status";
import { getDetectionsCsvUrl } from "@/lib/api-client";
import { isDetectionRunInProgress } from "@/lib/detection-run-status";
import { useDeleteRecording, useRecording, useRunDetection } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export default function RecordingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: rec, isLoading, error, refetch } = useRecording(id);
  const runMutation = useRunDetection(id);
  const deleteMutation = useDeleteRecording();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) return <LoadingNotice subject="recording" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!rec) return null;

  const running = isDetectionRunInProgress(rec.status);

  const onRun = async () => {
    try {
      await runMutation.mutateAsync();
      toast.success("Detection started", {
        description:
          "BirdNET is analyzing the recording — the timeline appears when detection completes.",
      });
    } catch (e) {
      toast.error("Could not start detection", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  };

  const onDownloadCsv = async () => {
    try {
      const { url } = await getDetectionsCsvUrl(id);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error("CSV unavailable", {
        description: e instanceof Error ? e.message : "Run detection first",
      });
    }
  };

  const onDelete = async () => {
    setConfirmOpen(false);
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Recording deleted", { description: rec.site });
      router.push("/recordings");
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  };

  const location =
    rec.latitude !== null && rec.longitude !== null
      ? `${rec.latitude}, ${rec.longitude}`
      : "Global (no range filter)";

  return (
    <div className="space-y-6">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="page-title truncate">{rec.site}</h1>
            <RunStatus status={rec.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground truncate">
            {rec.source_filename} · {rec.size_human}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8" onClick={onRun} disabled={running || runMutation.isPending}>
            <Play className="h-3.5 w-3.5" />
            {rec.status === "completed" ? "Re-run detection" : "Run detection"}
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link href={`/recordings/${id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={onDownloadCsv}
            disabled={rec.detection_count === 0}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {rec.status === "failed" && rec.error && (
        <Alert variant="destructive">
          <AlertTitle>Detection failed</AlertTitle>
          <AlertDescription>{rec.error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Meta label="Recorded on" value={rec.recorded_at ?? "—"} />
            <Meta label="Location" value={location} />
            <Meta label="Duration" value={formatDuration(rec.duration_seconds)} />
            <Meta label="Sample rate" value={rec.sample_rate ? `${rec.sample_rate} Hz` : "—"} />
            <Meta label="Detections" value={rec.detection_count} />
            <Meta label="Species" value={rec.species_count} />
            <Meta
              label="Min confidence"
              value={`${rec.params.min_conf} · sens ${rec.params.sensitivity}`}
            />
            <Meta
              label="Last run"
              value={rec.last_run_at ? formatDate(rec.last_run_at) : "Never"}
            />
          </dl>
        </CardContent>
      </Card>

      {running ? (
        <DetectionRunningState />
      ) : (
        <>
          <DetectionTimeline
            detections={rec.detections}
            durationSeconds={rec.duration_seconds}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <SpeciesSummary species={rec.species_summary} />
            <ClipList detections={rec.detections} />
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the source audio, detections, and every event
              clip for <span className="font-medium">{rec.site}</span> from Backblaze
              B2. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
