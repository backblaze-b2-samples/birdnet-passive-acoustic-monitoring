"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecordings } from "@/lib/queries";

const chartConfig = {
  detections: { label: "Detections", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DetectionsChart() {
  const { data: recordings, isLoading, error, refetch } = useRecordings();

  const data = useMemo(
    () =>
      (recordings ?? [])
        .slice(0, 8)
        .reverse()
        .map((r) => ({
          site: r.site.length > 14 ? `${r.site.slice(0, 13)}…` : r.site,
          detections: r.detection_count,
        })),
    [recordings],
  );

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Detections by recording</CardTitle>
        <CardDescription className="text-xs">Most recent recordings</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No recordings yet"
            description="Ingest a recording and run detection to see counts here."
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="site" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={6} fontSize={11} width={28} />
              <ChartTooltip cursor={{ fill: "var(--accent-subtle)" }} content={<ChartTooltipContent />} />
              <Bar
                dataKey="detections"
                fill="var(--color-detections)"
                radius={[4, 4, 0, 0]}
                animationDuration={500}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
