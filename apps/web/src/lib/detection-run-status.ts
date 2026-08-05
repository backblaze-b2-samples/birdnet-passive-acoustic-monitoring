import type { DetectionRunStatus } from "@birdnet-pam/shared";

/**
 * True only while a detection run is genuinely executing.
 *
 * The "Run detection" controls disable themselves on this predicate. It must
 * stay narrow: `"pending"` is the INITIAL, never-run state (every freshly
 * ingested recording is created `pending`), so treating it as in-progress
 * disables Run exactly when a first-time user needs it and leaves the whole
 * detect -> timeline stage unreachable. Only `"running"` is in progress;
 * `"pending"` (never run), `"completed"` (re-run) and `"failed"` (retry) are
 * all runnable states.
 */
export function isDetectionRunInProgress(status: DetectionRunStatus): boolean {
  return status === "running";
}
