"use client";

import { Card, CardContent } from "@/components/ui/card";
import { GeneratingLoader } from "@/components/ui/generating-loader";

/**
 * Distinct, visibly-animated in-progress panel shown while a detection run is
 * executing (`status === "running"`). It replaces the idle "No … yet" empty
 * states in the detections content area so a >10s wait never reads as an idle
 * or frozen view. BirdNET exposes no true progress percentage, so the indicator
 * is intentionally indeterminate (animated, not a fabricated determinate bar).
 */
export function DetectionRunningState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <GeneratingLoader size="lg" label="Detection in progress…" />
        <p className="max-w-sm text-sm text-muted-foreground">
          BirdNET is analyzing the recording. The timeline, species, and clips
          appear here when it completes.
        </p>
      </CardContent>
    </Card>
  );
}
