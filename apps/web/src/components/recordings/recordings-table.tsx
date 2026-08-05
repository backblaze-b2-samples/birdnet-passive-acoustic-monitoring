"use client";

import { useState } from "react";
import Link from "next/link";
import { Bird, Eye, MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RunStatus } from "./run-status";
import { isDetectionRunInProgress } from "@/lib/detection-run-status";
import { useDeleteRecording, useRecordings, useRunDetection } from "@/lib/queries";
import type { Recording } from "@birdnet-pam/shared";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RecordingRow({ rec, onDelete }: { rec: Recording; onDelete: (r: Recording) => void }) {
  const runMutation = useRunDetection(rec.id);
  const running = isDetectionRunInProgress(rec.status);

  const onRun = async () => {
    try {
      await runMutation.mutateAsync();
      toast.success("Detection started", { description: rec.site });
    } catch (e) {
      toast.error("Could not start detection", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  };

  return (
    <TableRow className="table-row-hover">
      <TableCell className="font-medium">
        <Link href={`/recordings/${rec.id}`} className="hover:underline">
          {rec.site}
        </Link>
        <div className="text-xs text-muted-foreground truncate">{rec.source_filename}</div>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {rec.recorded_at ?? "—"}
      </TableCell>
      <TableCell className="tabular-nums">{formatDuration(rec.duration_seconds)}</TableCell>
      <TableCell>
        <RunStatus status={rec.status} />
      </TableCell>
      <TableCell className="tabular-nums">{rec.detection_count}</TableCell>
      <TableCell className="tabular-nums">{rec.species_count}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={onRun}
            disabled={running || runMutation.isPending}
          >
            <Play className="h-3.5 w-3.5" />
            {rec.status === "completed" ? "Re-run" : "Run"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/recordings/${rec.id}`}>
                  <Eye className="h-4 w-4" /> View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/recordings/${rec.id}/edit`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(rec)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function RecordingsTable() {
  const { data: recordings = [], isLoading, error, refetch } = useRecordings();
  const deleteMutation = useDeleteRecording();
  const [pendingDelete, setPendingDelete] = useState<Recording | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMutation.mutateAsync(target.id);
      toast.success("Recording deleted", { description: target.site });
    } catch (e) {
      toast.error("Delete failed", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (recordings.length === 0) {
    return (
      <EmptyState
        icon={Bird}
        title="No recordings yet"
        description="Ingest a field recording to start detecting species."
      />
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Site
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recorded
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Duration
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detections
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Species
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((rec) => (
              <RecordingRow key={rec.id} rec={rec} onDelete={setPendingDelete} />
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the source audio, detections, and every event
              clip for <span className="font-medium">{pendingDelete?.site}</span> from
              Backblaze B2. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
