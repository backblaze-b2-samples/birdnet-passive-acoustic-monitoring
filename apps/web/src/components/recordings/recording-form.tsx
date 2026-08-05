"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateRecording, useUpdateRecording } from "@/lib/queries";
import type { Recording } from "@birdnet-pam/shared";

const MIN_CONF = ["0.1", "0.25", "0.5", "0.75"] as const;
const SENSITIVITY = ["0.75", "1.0", "1.25", "1.5"] as const;
const OVERLAP = ["0", "1.0", "2.0"] as const;
const LOCALES: { value: string; label: string }[] = [
  { value: "en_us", label: "English (US)" },
  { value: "en_uk", label: "English (UK)" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

const schema = z.object({
  site: z.string().min(1, "Site name is required").max(200),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  recorded_at: z.string().optional(),
  min_conf: z.enum(MIN_CONF),
  sensitivity: z.enum(SENSITIVITY),
  overlap: z.enum(OVERLAP),
  locale: z.string(),
});

type FormValues = z.infer<typeof schema>;

/** Map a stored numeric param back to its selector option string. */
function numToOption(n: number, options: readonly string[], fallback: string): string {
  return options.find((o) => Number(o) === n) ?? fallback;
}

export function RecordingForm({
  mode,
  recording,
}: {
  mode: "create" | "edit";
  recording?: Recording;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const createMutation = useCreateRecording();
  const updateMutation = useUpdateRecording(recording?.id ?? "");

  const defaults: FormValues =
    mode === "edit" && recording
      ? {
          site: recording.site,
          latitude: recording.latitude?.toString() ?? "",
          longitude: recording.longitude?.toString() ?? "",
          recorded_at: recording.recorded_at ?? "",
          min_conf: numToOption(recording.params.min_conf, MIN_CONF, "0.25") as FormValues["min_conf"],
          sensitivity: numToOption(recording.params.sensitivity, SENSITIVITY, "1.0") as FormValues["sensitivity"],
          overlap: numToOption(recording.params.overlap, OVERLAP, "0") as FormValues["overlap"],
          locale: recording.params.locale,
        }
      : {
          site: "",
          latitude: "",
          longitude: "",
          recorded_at: "",
          min_conf: "0.25",
          sensitivity: "1.0",
          overlap: "0",
          locale: "en_us",
        };

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const isCreate = mode === "create";
  const hint = (text: string) => (isCreate ? <FormDescription>{text}</FormDescription> : null);

  const onSubmit = async (values: FormValues) => {
    if (isCreate && !file) {
      setFileError("Choose a WAV or FLAC field recording to ingest.");
      return;
    }
    try {
      if (isCreate && file) {
        const rec = await createMutation.mutateAsync({
          file,
          input: {
            site: values.site,
            latitude: values.latitude || undefined,
            longitude: values.longitude || undefined,
            recorded_at: values.recorded_at || undefined,
            min_conf: Number(values.min_conf),
            sensitivity: Number(values.sensitivity),
            overlap: Number(values.overlap),
            locale: values.locale,
          },
          onProgress: setProgress,
        });
        toast.success("Recording ingested", {
          description: "Open it and run BirdNET detection to build the timeline.",
        });
        router.push(`/recordings/${rec.id}`);
      } else if (recording) {
        await updateMutation.mutateAsync({
          site: values.site,
          latitude: values.latitude ? Number(values.latitude) : null,
          longitude: values.longitude ? Number(values.longitude) : null,
          recorded_at: values.recorded_at || null,
          min_conf: Number(values.min_conf),
          sensitivity: Number(values.sensitivity),
          overlap: Number(values.overlap),
          locale: values.locale,
        });
        toast.success("Recording updated", {
          description: "Re-run detection to apply the new parameters.",
        });
        router.push(`/recordings/${recording.id}`);
      }
    } catch (e) {
      toast.error(mode === "create" ? "Ingest failed" : "Update failed", {
        description: e instanceof Error ? e.message : "Unexpected error",
      });
    } finally {
      setProgress(null);
    }
  };

  const submitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Survey metadata</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {isCreate && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="audio">
                  Field recording (WAV / FLAC)
                </label>
                <Input
                  id="audio"
                  type="file"
                  accept=".wav,.flac,.mp3,.ogg,audio/*"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setFileError(null);
                  }}
                />
                <FormDescription>
                  The raw continuous recording. Source audio is immutable once ingested.
                </FormDescription>
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              </div>
            )}

            <FormField
              control={form.control}
              name="site"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Site A — North Ridge" {...field} />
                  </FormControl>
                  {hint("A human-readable name for the survey location.")}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="45.52" {...field} />
                    </FormControl>
                    {hint("Leave blank to scan globally (no range filter).")}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="-122.68" {...field} />
                    </FormControl>
                    {hint("Leave blank to scan globally (no range filter).")}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="recorded_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recorded on</FormLabel>
                  <FormControl>
                    <Input type="date" className="w-52" {...field} />
                  </FormControl>
                  {hint("Used with lat/lon to narrow species by season.")}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Detection parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="min_conf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum confidence</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MIN_CONF.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hint("0.25 recommended for a balanced first pass.")}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sensitivity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sensitivity</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SENSITIVITY.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hint("Higher values surface fainter calls (more false positives).")}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="overlap"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Segment overlap (s)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {OVERLAP.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hint("Overlap between 3s analysis windows.")}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Common-name language</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LOCALES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hint("Language for reported common names.")}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          {progress !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">
              Uploading {progress}%
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? isCreate
                ? "Ingesting..."
                : "Saving..."
              : isCreate
                ? "Ingest recording"
                : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
