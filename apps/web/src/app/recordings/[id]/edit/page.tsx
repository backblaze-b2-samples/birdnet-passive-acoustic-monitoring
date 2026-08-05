"use client";

import { useParams } from "next/navigation";

import { RecordingForm } from "@/components/recordings/recording-form";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import { useRecording } from "@/lib/queries";

export default function EditRecordingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: recording, isLoading, error, refetch } = useRecording(id);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Edit recording</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Update the survey metadata and detection parameters. The source audio is
          immutable — re-run detection to apply new parameters.
        </p>
      </div>
      <div className="max-w-3xl">
        {isLoading ? (
          <LoadingNotice subject="recording" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recording ? (
          <RecordingForm mode="edit" recording={recording} />
        ) : null}
      </div>
    </div>
  );
}
