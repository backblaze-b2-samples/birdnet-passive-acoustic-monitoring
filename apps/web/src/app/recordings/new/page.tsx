import { RecordingForm } from "@/components/recordings/recording-form";

export default function NewRecordingPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">New recording</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Upload a continuous field recording (WAV/FLAC) and its survey metadata.
          The audio and a <code>meta.json</code> are written to{" "}
          <code>recordings/&lt;id&gt;/</code> on B2; run detection afterwards to
          build the timeline.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <RecordingForm mode="create" />
      </div>
    </div>
  );
}
