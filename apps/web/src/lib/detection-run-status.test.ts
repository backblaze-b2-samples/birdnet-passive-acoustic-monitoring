import { describe, expect, it } from "vitest";

import type { DetectionRunStatus } from "@birdnet-pam/shared";

import { isDetectionRunInProgress } from "./detection-run-status";

// The "Run detection" controls (recording detail page + recordings table) set
// `disabled` from this predicate. A regression here previously disabled Run for
// freshly ingested `pending` recordings — the initial, never-run state — which
// made the entire detect -> timeline stage unreachable through the UI. These
// cases pin the Run control ENABLED for pending and DISABLED for running.
describe("isDetectionRunInProgress", () => {
  it("is false for pending (initial, never-run) — Run must be enabled", () => {
    expect(isDetectionRunInProgress("pending")).toBe(false);
  });

  it("is true for running — Run must be disabled while a run is in progress", () => {
    expect(isDetectionRunInProgress("running")).toBe(true);
  });

  it("is false for completed and failed (re-run / retry are allowed)", () => {
    expect(isDetectionRunInProgress("completed")).toBe(false);
    expect(isDetectionRunInProgress("failed")).toBe(false);
  });

  it("treats only running as in-progress across every status", () => {
    const statuses: DetectionRunStatus[] = [
      "pending",
      "running",
      "completed",
      "failed",
    ];
    const inProgress = statuses.filter(isDetectionRunInProgress);
    expect(inProgress).toEqual(["running"]);
  });
});
