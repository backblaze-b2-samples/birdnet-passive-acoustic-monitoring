"use client";

import { Music } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreviewUrl } from "@/lib/queries";
import type { Detection } from "@birdnet-pam/shared";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ClipPlayer({ clipKey }: { clipKey: string }) {
  const { data, isLoading, error } = usePreviewUrl(clipKey, true);
  if (isLoading) return <Skeleton className="h-8 w-full sm:w-64" />;
  if (error || !data) {
    return <span className="text-xs text-muted-foreground">Clip unavailable</span>;
  }
  return (
    // Fed by a short-lived B2 presigned URL (Content-Disposition: inline).
    <audio controls preload="none" src={data.url} className="h-8 w-full sm:w-64" />
  );
}

export function ClipList({ detections }: { detections: Detection[] }) {
  const clips = detections.filter((d) => d.clip_key);
  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Event clips</CardTitle>
        <CardDescription className="text-xs">
          Each detection is sliced from the source audio and stored on B2.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {clips.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No clips yet"
            description="Event clips appear here after a detection run completes."
          />
        ) : (
          <ul className="divide-y divide-border">
            {clips.map((d, i) => (
              <li
                key={`${d.clip_key}-${i}`}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.common_name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="italic">{d.scientific_name}</span>
                    {" · "}
                    {formatTime(d.start_s)}–{formatTime(d.end_s)}
                    {" · "}
                    {(d.confidence * 100).toFixed(0)}%
                  </div>
                </div>
                <ClipPlayer clipKey={d.clip_key as string} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
