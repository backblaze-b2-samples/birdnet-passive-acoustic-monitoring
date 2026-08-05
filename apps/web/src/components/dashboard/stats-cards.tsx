"use client";

import { AudioLines, Bird, Clock, HardDrive, Music, Waypoints } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import { useRecordingsStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = useRecordingsStats();

  // Surface fetch failures inline rather than rendering zeros — that would lie
  // about the bucket state when the API is simply unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Recordings", value: stats?.recordings_ingested ?? 0, icon: Bird },
    { title: "Detections", value: stats?.total_detections ?? 0, icon: AudioLines },
    { title: "Species", value: stats?.distinct_species ?? 0, icon: Waypoints },
    { title: "Audio hours", value: stats?.audio_hours ?? 0, icon: Clock },
    { title: "Event clips", value: stats?.clips_written ?? 0, icon: Music },
    { title: "Storage used", value: stats?.storage_human ?? "0 B", icon: HardDrive },
  ];

  return (
    <>
      {isLoading && <LoadingNotice className="mb-3" subject="recording stats" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card, i) => (
          <Card
            key={card.title}
            className={`card-hover animate-fade-in-up stagger-${i + 1}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className="stat-icon-wrap">
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="stat-value">{card.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
