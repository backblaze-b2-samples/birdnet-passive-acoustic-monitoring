export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Passive-acoustic monitoring (BirdNET) ---------------------------------

export type DetectionRunStatus = "pending" | "running" | "completed" | "failed";

export interface DetectionParams {
  min_conf: number;
  sensitivity: number;
  overlap: number;
  locale: string;
}

export interface Detection {
  scientific_name: string;
  common_name: string;
  confidence: number;
  start_s: number;
  end_s: number;
  clip_key: string | null;
}

export interface SpeciesSummaryItem {
  scientific_name: string;
  common_name: string;
  detections: number;
  max_confidence: number;
}

export interface ClipInfo {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
}

export interface Recording {
  id: string;
  site: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
  source_filename: string;
  source_key: string;
  size_bytes: number;
  size_human: string;
  duration_seconds: number | null;
  sample_rate: number | null;
  status: DetectionRunStatus;
  error: string | null;
  params: DetectionParams;
  detection_count: number;
  species_count: number;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
}

export interface RecordingDetail extends Recording {
  detections: Detection[];
  species_summary: SpeciesSummaryItem[];
  clips: ClipInfo[];
}

export interface RecordingUpdate {
  site: string;
  latitude: number | null;
  longitude: number | null;
  recorded_at: string | null;
  min_conf: number;
  sensitivity: number;
  overlap: number;
  locale: string;
}

export interface RecordingRunResponse {
  id: string;
  status: DetectionRunStatus;
}

export interface RecordingsStats {
  recordings_ingested: number;
  total_detections: number;
  distinct_species: number;
  audio_hours: number;
  clips_written: number;
  storage_bytes: number;
  storage_human: string;
}
