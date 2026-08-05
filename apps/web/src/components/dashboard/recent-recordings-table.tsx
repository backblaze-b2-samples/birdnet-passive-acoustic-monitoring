"use client";

import Link from "next/link";
import { ArrowRight, Bird } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RunStatus } from "@/components/recordings/run-status";
import { useRecordings } from "@/lib/queries";

export function RecentRecordingsTable() {
  const { data: recordings = [], isLoading, error, refetch } = useRecordings();
  const recent = recordings.slice(0, 6);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent recordings</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/recordings"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Bird}
            title="No recordings yet"
            description="Head to Recordings to ingest your first field recording."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[40%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Site
                </TableHead>
                <TableHead className="w-[24%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detections
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Species
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((rec) => (
                <TableRow key={rec.id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/recordings/${rec.id}`}
                      className="block truncate hover:underline"
                      title={rec.site}
                    >
                      {rec.site}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RunStatus status={rec.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{rec.detection_count}</TableCell>
                  <TableCell className="tabular-nums">{rec.species_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
