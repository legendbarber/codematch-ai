export type Provider = "openai" | "gemini";

export type ProviderCredentials = {
  openaiApiKey?: string;
  geminiApiKey?: string;
};

export type ComparisonBasis = "document_latest" | "code_latest" | "unknown";

export type FindingType = "missing_feature" | "api_mismatch" | "outdated_doc";

export type Severity = "high" | "low";

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
  chunks: DocumentChunk[];
  pages?: ParsedDocumentPage[];
  pdfTextItems?: PdfTextItem[];
};

export type DocumentChunk = {
  documentName: string;
  index: number;
  heading: string | null;
  text: string;
  pageNumber?: number;
};

export type ParsedDocumentPage = {
  pageNumber: number;
  text: string;
};

export type PdfTextItem = {
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

export type DocumentEvidenceLocation = {
  documentName: string;
  pageNumber?: number;
  matchedText?: string;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  highlightStatus?: "created" | "not_applicable" | "mapping_failed" | "storage_unavailable";
  highlightMessage?: string;
  artifactId?: string;
};

export type CodeLocation = {
  path: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
  endpoint?: {
    method: string;
    path: string;
  };
};

export type DocumentationDraft = {
  suggestedSection: string;
  suggestedTitle: string;
  body: string;
  supportingCodeLocations: CodeLocation[];
  reviewNotes?: string[];
};

export type AnalysisScope = {
  collectedCodeFileCount: number;
  codeChunkCount: number;
  documentChunkCount: number;
  warnings: string[];
  githubTreeTruncated: boolean;
  highlightMappingFailures: number;
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
  documentLocation?: DocumentEvidenceLocation;
  codeLocations?: CodeLocation[];
  recommendation: string;
  confidence: number;
};

export type AnalysisReport = {
  summary: string;
  findings: ReportFinding[];
};

export type AnalysisPlan = {
  summary: string;
  targetAreas: Array<{
    id: string;
    priority: Severity;
    documentRequirement: string;
    candidatePaths: string[];
    detectionTypes: FindingType[];
    reason: string;
    uncertainty: string;
  }>;
  requiredDetectionDocs: string[];
  analysisNotes: string[];
};
