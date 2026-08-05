import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RecordingsTable } from "@/components/recordings/recordings-table";

export default function RecordingsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Recordings</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
            Passive-acoustic field recordings stored under the{" "}
            <code>recordings/</code> prefix on Backblaze B2. Ingest audio, run
            BirdNET detection, and browse the detection timeline for each site.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/recordings/new">
            <Plus className="h-3.5 w-3.5" />
            New recording
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <RecordingsTable />
      </div>
    </div>
  );
}
