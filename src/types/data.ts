// Datasets and artifacts as gnome-pipelines' data API reads them from the Iceberg tables.

export interface DatasetPublish {
  at: string;
  rows: number;
  codeVersion: string | null;
  // <pipeline>/<run id>; a laptop run's id starts with local-.
  runId: string | null;
}

export interface Dataset {
  name: string;
  key: string[];
  partitionedBy: string[];
  storedRows: number;
  publishes: number;
  lastPublish: DatasetPublish | null;
}

export interface DatasetColumn {
  name: string;
  type: string;
  required: boolean;
  managed: boolean;
}

export interface DatasetDetail extends Dataset {
  columns: DatasetColumn[];
  history: DatasetPublish[];
  sample: Record<string, unknown>[];
}

export interface ArtifactSummary {
  artifactType: string;
  name: string;
  versions: number;
  latestVersion: string;
  latestCreatedAt: string;
  description: string | null;
  aliases: Record<string, string>;
}

export interface ArtifactInput {
  dataset: string;
  asOf: string;
  snapshotId: number | null;
  rowCount: number;
  rowsHash: string;
}

export interface ArtifactVersion {
  version: string;
  uri: string;
  fileFormat: string | null;
  sizeBytes: number | null;
  description: string | null;
  params: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  runId: string | null;
  createdAt: string;
  inputs: ArtifactInput[];
}

export interface ArtifactDetail {
  artifactType: string;
  name: string;
  versions: ArtifactVersion[];
  aliases: Record<string, string>;
}
