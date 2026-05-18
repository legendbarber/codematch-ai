export type Provider = "openai" | "gemini";

export type ProviderCredentials = {
  apiKey?: string;
};

export type FindingType = "missing_feature" | "api_mismatch" | "outdated_doc";

export type Severity = "high" | "medium" | "low";

export type AnalysisStatus =
  | "queued"
  | "collecting"
  | "parsing"
  | "analyzing"
  | "reporting"
  | "completed"
  | "failed";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export type AnalysisOptions = {
  missingFeature: boolean;
  apiMismatch: boolean;
  outdatedDoc: boolean;
};

export type UploadedDocumentInput = {
  name: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export type ParsedDocument = {
  name: string;
  mimeType: string;
  size: number;
  text: string;
};

export type SourceFile = {
  path: string;
  language: string;
  text: string;
};

export type CodeChunk = {
  path: string;
  language: string;
  startLine: number;
  endLine: number;
  text: string;
};

export type RepositorySnapshot = {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string | null;
  htmlUrl: string;
  files: SourceFile[];
  warnings: string[];
};

export type ReportFinding = {
  type: FindingType;
  severity: Severity;
  title: string;
  documentEvidence: string;
  codeEvidence: string;
  relatedFiles: string[];
  recommendation: string;
  confidence: number;
};

export type AnalysisReport = {
  summary: string;
  findings: ReportFinding[];
};
