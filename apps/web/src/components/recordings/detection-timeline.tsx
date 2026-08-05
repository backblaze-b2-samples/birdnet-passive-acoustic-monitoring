"use client";

import { useMemo } from "react";
import { AudioLines } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Detection } from "@birdnet-pam/shared";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Horizontal detection timeline: one lane per species, markers positioned by
 * start time over the recording duration, width by call length, opacity by
 * confidence. This is the marquee visualization of what BirdNET heard and when.
 */
export function DetectionTimeline({
  detections,
  durationSeconds,
}: {
  detections: Detection[];
  durationSeconds: number | null;
}) {
  const { lanes, duration } = useMemo(() => {
    const maxEnd = detections.reduce((m, d) => Math.max(m, d.end_s), 0);
    const dur = durationSeconds && durationSeconds > 0 ? durationSeconds : maxEnd || 1;
    const bySpecies = new Map<string, { common: string; items: Detection[] }>();
    for (const d of detections) {
      const lane = bySpecies.get(d.scientific_name);
      if (lane) lane.items.push(d);
      else bySpecies.set(d.scientific_name, { common: d.common_name, items: [d] });
    }
    const sorted = [...bySpecies.entries()].sort(
      (a, b) => b[1].items.length - a[1].items.length,
    );
    return {
      duration: dur,
      lanes: sorted.map(([scientific, lane], i) => ({
        scientific,
        common: lane.common,
        color: PALETTE[i % PALETTE.length],
        items: lane.items,
      })),
    };
  }, [detections, durationSeconds]);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Detection timeline</CardTitle>
        <CardDescription className="text-xs">
          {detections.length} detections across {lanes.length} species over{" "}
          {formatTime(duration)}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {detections.length === 0 ? (
          <EmptyState
            icon={AudioLines}
            title="No detections yet"
            description="Run BirdNET detection to populate the timeline."
          />
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {lanes.map((lane) => (
                <div key={lane.scientific} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-xs" title={lane.scientific}>
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ backgroundColor: lane.color }}
                    />
                    <span className="align-middle font-medium">{lane.common}</span>
                  </div>
                  <div className="relative h-7 flex-1 rounded-md border border-border bg-muted/20">
                    {lane.items.map((d, i) => {
                      const left = Math.min(100, (d.start_s / duration) * 100);
                      const width = Math.max(0.8, ((d.end_s - d.start_s) / duration) * 100);
                      return (
                        <div
                          key={`${d.start_s}-${i}`}
                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: lane.color,
                            opacity: 0.35 + 0.65 * Math.min(1, d.confidence),
                          }}
                          title={`${d.common_name} — ${(d.confidence * 100).toFixed(0)}% @ ${formatTime(d.start_s)}–${formatTime(d.end_s)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Time axis */}
            <div className="flex items-center gap-3">
              <div className="w-40 shrink-0" />
              <div className="relative flex-1">
                <div className="flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
                  {ticks.map((t) => (
                    <span key={t}>{formatTime(duration * t)}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
