"use client";

import { Bird } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SpeciesSummaryItem } from "@birdnet-pam/shared";

export function SpeciesSummary({ species }: { species: SpeciesSummaryItem[] }) {
  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Species heard</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {species.length === 0 ? (
          <EmptyState
            icon={Bird}
            title="No species yet"
            description="Detections will roll up by species here after a run."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Species
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detections
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Max confidence
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {species.map((s) => (
                <TableRow key={s.scientific_name} className="table-row-hover">
                  <TableCell>
                    <div className="font-medium">{s.common_name}</div>
                    <div className="text-xs italic text-muted-foreground">
                      {s.scientific_name}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.detections}</TableCell>
                  <TableCell className="tabular-nums">
                    {(s.max_confidence * 100).toFixed(0)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
