"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Flag,
  FolderGit2,
  History,
  KeyRound,
  Loader2,
  Play,
  Printer,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Provider = "openai" | "gemini";
type ComparisonBasis = "document_latest" | "code_latest" | "unknown";

type Totals = {
  total: number;
  missingFeature: number;
  apiMismatch: number;
  outdatedDoc: number;
  high: number;
  low: number;
  scope?: {
    collectedCodeFileCount: number;
    codeChunkCount: number;
    documentChunkCount: number;
    warnings: string[];
    githubTreeTruncated: boolean;
    highlightMappingFailures: number;
  };
};

type AnalysisSummary = {
  id: string;
  repoUrl: string;
  repoOwner: string | null;
  repoName: string | null;
  provider: Provider;
  comparisonBasis: ComparisonBasis;
  status: string;
  summary: string | null;
  error: string | null;
  totals: Totals;
  createdAt: string;
  completedAt: string | null;
  isExample?: boolean;
};

type CodeLocation = {
  path: string;
  symbolName?: string;
  startLine?: number;
  endLine?: number;
  endpoint?: {
    method: string;
    path: string;
  };
};

type DocumentationDraft = {
  suggestedSection: string;
  suggestedTitle: string;
  body: string;
  supportingCodeLocations: CodeLocation[];
  reviewNotes?: string[];
};

type AnalysisDetail = AnalysisSummary & {
  documents: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    extractedChars: number;
  }>;
  steps: Array<{
    id: string;
    key: string;
    label: string;
    status: string;
    message: string | null;
    durationMs: number | null;
  }>;
  findings: Array<{
    id: string;
    type: "missing_feature" | "api_mismatch" | "outdated_doc";
    severity: "high" | "low";
    title: string;
    documentEvidence: string;
    codeEvidence: string;
    relatedFiles: string[];
    documentLocation: {
      documentName?: string;
      pageNumber?: number;
      matchedText?: string;
      highlightStatus?: "created" | "not_applicable" | "mapping_failed" | "storage_unavailable";
      highlightMessage?: string;
      artifactId?: string;
    };
    codeLocations: CodeLocation[];
    recommendation: string;
    confidence: number;
  }>;
  artifacts: Array<{
    id: string;
    type: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresAt: string | null;
    createdAt: string;
  }>;
  documentationDrafts: Array<{
    id: string;
    findingId: string;
    draft: DocumentationDraft;
    createdAt: string;
  }>;
  reportRecommendationSummary: {
    headline: string;
    priorityActions: string[];
    reviewFocus: string[];
  };
};

const DEFAULT_STEPS = [
  "Repository URL 확인",
  "GitHub 코드 수집",
  "문서 Parsing",
  "분석 계획 수립",
  "분석 중",
  "분석 리포트 생성",
  "결과 저장 및 아티팩트 생성",
];

const ACCEPTED_DOCUMENT_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf", ".json", ".yaml", ".yml"];
const MAX_DOCUMENTS = 5;
const EXAMPLE_ANALYSIS_ID = "example-northstar-retailops-wide";

const OPTION_PRESETS: Record<ComparisonBasis, { missingFeature: boolean; apiMismatch: boolean; outdatedDoc: boolean }> = {
  document_latest: {
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: false,
  },
  code_latest: {
    missingFeature: false,
    apiMismatch: false,
    outdatedDoc: true,
  },
  unknown: {
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: true,
  },
};

const DEMO_ANALYSIS: AnalysisDetail = {
  id: "demo-codematchaa-multi-agent-report",
  repoUrl: "https://github.com/legendbarber/codematch-ai",
  repoOwner: "legendbarber",
  repoName: "codematch-ai",
  provider: "openai",
  comparisonBasis: "unknown",
  status: "completed",
  summary:
    "Demo report for judges: CodeMatchAA compared the uploaded architecture/spec documents with the deployed repository and found 5 consistency risks across multi-agent orchestration, report evidence, and deployment configuration.",
  error: null,
  totals: {
    total: 5,
    missingFeature: 2,
    apiMismatch: 1,
    outdatedDoc: 2,
    high: 4,
    low: 1,
    scope: {
      collectedCodeFileCount: 38,
      codeChunkCount: 126,
      documentChunkCount: 34,
      warnings: [
        "Demo data is preloaded so first-time visitors can evaluate the finished report without running analysis.",
      ],
      githubTreeTruncated: false,
      highlightMappingFailures: 0,
    },
  },
  createdAt: "2026-05-30T05:40:00.000Z",
  completedAt: "2026-05-30T05:43:18.000Z",
  documents: [
    {
      id: "demo-doc-architecture",
      name: "architecture.png",
      mimeType: "image/png",
      size: 1190421,
      extractedChars: 1840,
    },
    {
      id: "demo-doc-system-design",
      name: "docs/system-design.md",
      mimeType: "text/markdown",
      size: 18240,
      extractedChars: 12860,
    },
    {
      id: "demo-doc-output-contracts",
      name: "multi-agent-docs/output-contracts.md",
      mimeType: "text/markdown",
      size: 9130,
      extractedChars: 7210,
    },
  ],
  steps: [
    {
      id: "demo-step-plan",
      key: "plan",
      label: "Planning agent scoped repository and documents",
      status: "completed",
      message: "Selected multi-agent workflow, detection rules, and evidence collection range.",
      durationMs: 21000,
    },
    {
      id: "demo-step-collect",
      key: "collect",
      label: "GitHub code and document chunks collected",
      status: "completed",
      message: "Collected Next.js routes, analyzer modules, deployment scripts, and reference docs.",
      durationMs: 34000,
    },
    {
      id: "demo-step-parallel",
      key: "parallel-analysis",
      label: "Two analysis agents ran in parallel",
      status: "completed",
      message: "Both agents checked missing features, API mismatches, outdated docs, and confidence.",
      durationMs: 78000,
    },
    {
      id: "demo-step-report",
      key: "report-agent",
      label: "Report agent merged and de-duplicated findings",
      status: "completed",
      message: "Cross-validated duplicate findings and produced priority recommendations.",
      durationMs: 41000,
    },
    {
      id: "demo-step-store",
      key: "store",
      label: "Report metadata stored for Supabase-backed review",
      status: "completed",
      message: "Stored summary, findings, evidence locations, and generated report actions.",
      durationMs: 18000,
    },
  ],
  findings: [
    {
      id: "demo-finding-planner",
      type: "missing_feature",
      severity: "high",
      title: "Architecture requires a planning agent, but runtime path still behaves like a single analyzer entry point",
      documentEvidence:
        "The architecture diagram defines step 1 as a Planning Agent that selects target areas, priorities, detection strategy, and evidence scope before analysis starts.",
      codeEvidence:
        "src/server/analysis-runner.ts invokes the analyzer directly after collection. Planning prompts exist, but the persisted step model does not expose a separate planning result object for the report agent to verify.",
      relatedFiles: [
        "src/server/analysis-runner.ts",
        "src/server/analyzer/index.ts",
        "multi-agent-docs/agents/analysis-planner-agent.md",
      ],
      documentLocation: {
        documentName: "architecture.png",
        pageNumber: 1,
        matchedText: "Planning Agent: analysis target area, priority, detection strategy, evidence collection scope",
        highlightStatus: "created",
      },
      codeLocations: [
        {
          path: "src/server/analysis-runner.ts",
          symbolName: "runAnalysis",
          startLine: 78,
          endLine: 156,
        },
        {
          path: "src/server/analyzer/index.ts",
          symbolName: "analyzeRepositoryAgainstDocuments",
          startLine: 30,
          endLine: 138,
        },
      ],
      recommendation:
        "Persist a planning_result payload with selected detection types, target directories, and evidence scope, then pass that object to each analysis agent and display it in the final report.",
      confidence: 0.91,
    },
    {
      id: "demo-finding-parallel",
      type: "missing_feature",
      severity: "high",
      title: "Parallel analysis agents are documented, but the report should show agent A/B agreement",
      documentEvidence:
        "Step 2 in the architecture shows Analysis Agent #1 and Analysis Agent #2 running the same role concurrently and producing Analysis Result A and B.",
      codeEvidence:
        "The current report model stores a unified findings array. It does not preserve which agent produced each finding or whether another agent confirmed, contradicted, or merged it.",
      relatedFiles: [
        "src/server/analyzer/schema.ts",
        "src/server/types.ts",
        "multi-agent-docs/multi-agent-workflow.md",
      ],
      documentLocation: {
        documentName: "architecture.png",
        pageNumber: 1,
        matchedText: "Analysis Agent x 2, same role, concurrent analysis, Analysis Result A / B",
        highlightStatus: "created",
      },
      codeLocations: [
        {
          path: "src/server/analyzer/schema.ts",
          symbolName: "analysisFindingSchema",
          startLine: 1,
          endLine: 96,
        },
        {
          path: "src/server/types.ts",
          symbolName: "AnalysisFinding",
          startLine: 16,
          endLine: 54,
        },
      ],
      recommendation:
        "Add agentSource, corroborationStatus, and mergeRationale fields so judges can see which issues were independently confirmed by both analysis agents.",
      confidence: 0.88,
    },
    {
      id: "demo-finding-api",
      type: "api_mismatch",
      severity: "high",
      title: "Report API is session-scoped, so seeded Supabase rows do not automatically appear for new judges",
      documentEvidence:
        "The final output is expected to show a completed consistency analysis report containing summary, detected issues, evidence, severity, confidence, and recommendations.",
      codeEvidence:
        "GET /api/analyses filters rows by the anonymous session cookie. A judge with a fresh browser receives an empty history unless the UI preloads a public demo report.",
      relatedFiles: ["src/app/api/analyses/route.ts", "src/app/api/analyses/[id]/route.ts", "src/app/page.tsx"],
      documentLocation: {
        documentName: "architecture.png",
        pageNumber: 1,
        matchedText: "Final output: consistency analysis report",
        highlightStatus: "created",
      },
      codeLocations: [
        {
          path: "src/app/api/analyses/route.ts",
          symbolName: "GET",
          startLine: 11,
          endLine: 27,
          endpoint: {
            method: "GET",
            path: "/api/analyses",
          },
        },
        {
          path: "src/app/api/analyses/[id]/route.ts",
          symbolName: "GET",
          startLine: 15,
          endLine: 51,
          endpoint: {
            method: "GET",
            path: "/api/analyses/:id",
          },
        },
      ],
      recommendation:
        "Keep user analyses session-scoped, but ship a public demo analysis object in the client so the deployed site always opens with a complete report.",
      confidence: 0.95,
    },
    {
      id: "demo-finding-docs",
      type: "outdated_doc",
      severity: "high",
      title: "Deployment docs mention GCP and Supabase, but do not describe the default judge demo state",
      documentEvidence:
        "The architecture and deployment flow imply that evaluators should inspect a final report, not necessarily execute a live analysis with API keys and uploaded documents.",
      codeEvidence:
        "README and deployment docs focus on running analysis and configuring environment variables. They do not document that the production page can show a preloaded demo report.",
      relatedFiles: ["README.md", "docs/deployment-gcp.md", "docs/supabase-stored-data.md"],
      documentLocation: {
        documentName: "docs/deployment-gcp.md",
        matchedText: "Deploy to Google Cloud Run and configure DATABASE_URL / DIRECT_URL.",
        highlightStatus: "not_applicable",
      },
      codeLocations: [
        {
          path: "docs/deployment-gcp.md",
          startLine: 1,
          endLine: 80,
        },
        {
          path: "README.md",
          startLine: 1,
          endLine: 110,
        },
      ],
      recommendation:
        "Add a short evaluator note explaining that production starts with a static demo report while real user analyses remain private per session.",
      confidence: 0.82,
    },
    {
      id: "demo-finding-evidence",
      type: "outdated_doc",
      severity: "low",
      title: "Output contract should explicitly name architecture-image evidence handling",
      documentEvidence:
        "The uploaded architecture image is a visual spec, and its labels define core workflow requirements for the upgraded CodeMatchAA system.",
      codeEvidence:
        "The document upload path supports PDF, markdown, text, JSON, and YAML, while this demo treats the architecture PNG as review evidence for presentation.",
      relatedFiles: ["src/app/page.tsx", "src/app/api/analyses/route.ts", "multi-agent-docs/output-contracts.md"],
      documentLocation: {
        documentName: "architecture.png",
        pageNumber: 1,
        matchedText: "CodeMatch AI multi-agent analysis architecture",
        highlightStatus: "created",
      },
      codeLocations: [
        {
          path: "src/app/page.tsx",
          symbolName: "ACCEPTED_DOCUMENT_EXTENSIONS",
          startLine: 169,
          endLine: 169,
        },
        {
          path: "multi-agent-docs/output-contracts.md",
          startLine: 1,
          endLine: 96,
        },
      ],
      recommendation:
        "Clarify whether image-based architecture artifacts are supported input, demo-only evidence, or should be converted to markdown before analysis.",
      confidence: 0.74,
    },
  ],
  artifacts: [],
  documentationDrafts: [
    {
      id: "demo-draft-planner",
      findingId: "demo-finding-planner",
      createdAt: "2026-05-30T05:43:18.000Z",
      draft: {
        suggestedSection: "Architecture / Planning Agent",
        suggestedTitle: "Persisted Planning Result Contract",
        body:
          "Before analysis agents run, CodeMatchAA should persist a planning_result object containing selected target directories, enabled detection types, priority rules, and evidence collection scope. Each analysis agent receives this object, and the report agent includes it in the final review trail.",
        supportingCodeLocations: [
          {
            path: "src/server/analysis-runner.ts",
            symbolName: "runAnalysis",
            startLine: 78,
            endLine: 156,
          },
        ],
        reviewNotes: ["Use this as the acceptance contract for the upgraded multi-agent implementation."],
      },
    },
  ],
  reportRecommendationSummary: {
    headline:
      "Prioritize the two high-severity multi-agent gaps first: persisted planning output and visible A/B agent corroboration.",
    priorityActions: [
      "Persist and display planning_result before running analysis agents.",
      "Track agent A/B source, agreement, and merge rationale on each finding.",
      "Document the public demo report behavior for evaluators while keeping real analyses session-private.",
    ],
    reviewFocus: ["Planning Agent", "Parallel Analysis", "Session-scoped Supabase history", "Report Agent merge logic"],
  },
};

function isDemoAnalysisId(id: string) {
  return id === DEMO_ANALYSIS.id;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [provider, setProvider] = useState<Provider>("openai");
  const [comparisonBasis, setComparisonBasis] = useState<ComparisonBasis>("unknown");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DocumentationDraft>>({});
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [options, setOptions] = useState({
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: true,
  });
  const [history, setHistory] = useState<AnalysisSummary[]>([DEMO_ANALYSIS]);
  const [active, setActive] = useState<AnalysisDetail | null>(DEMO_ANALYSIS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeIsRunning = active
    ? ["queued", "collecting", "parsing", "analyzing", "reporting"].includes(active.status)
    : false;

  useEffect(() => {
    void loadInitialHistory();
  }, []);

  useEffect(() => {
    if (!active?.id || !activeIsRunning) return;
    const timer = window.setInterval(() => {
      void loadAnalysis(active.id);
      void loadHistory();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [active?.id, activeIsRunning]);

  const statusSteps = useMemo(() => {
    if (active?.steps?.length) return active.steps;
    return DEFAULT_STEPS.map((label, index) => ({
      id: String(index),
      key: String(index),
      label,
      status: index === 0 && submitting ? "running" : "pending",
      message: null,
      durationMs: null,
    }));
  }, [active?.steps, submitting]);

  function handleComparisonBasisChange(nextBasis: ComparisonBasis) {
    setComparisonBasis(nextBasis);
    setOptions(OPTION_PRESETS[nextBasis]);
  }

  async function loadInitialHistory() {
    const response = await fetch("/api/analyses", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const analyses = payload.analyses as AnalysisSummary[];
      setHistory(analyses);
      if (analyses.some((analysis) => analysis.id === EXAMPLE_ANALYSIS_ID)) {
        await loadAnalysis(EXAMPLE_ANALYSIS_ID);
      }
    }
  }

  async function loadHistory() {
    const response = await fetch("/api/analyses", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const analyses = payload.analyses as AnalysisSummary[];
      setHistory([DEMO_ANALYSIS, ...analyses.filter((analysis) => !isDemoAnalysisId(analysis.id))]);
    }
  }

  async function loadAnalysis(id: string) {
    if (isDemoAnalysisId(id)) {
      setActive(DEMO_ANALYSIS);
      scrollToReport();
      return;
    }

    const response = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      const nextAnalysis = payload.analysis as AnalysisDetail;
      setActive(nextAnalysis);
      if (nextAnalysis.documentationDrafts?.length) {
        setDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            nextAnalysis.documentationDrafts
              .filter((draft) => Boolean(draft.draft))
              .map((draft) => [draft.findingId, draft.draft]),
          ),
        }));
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (files.length === 0) {
      setError("분석할 개발 문서를 업로드하세요.");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("repoUrl", repoUrl);
    formData.set("provider", provider);
    formData.set("comparisonBasis", comparisonBasis);
    formData.set("openaiApiKey", openaiApiKey);
    formData.set("geminiApiKey", geminiApiKey);
    formData.set("missingFeature", String(options.missingFeature));
    formData.set("apiMismatch", String(options.apiMismatch));
    formData.set("outdatedDoc", String(options.outdatedDoc));
    files.forEach((file) => formData.append("documents", file));

    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "분석을 시작하지 못했습니다.");
      }
      await loadAnalysis(payload.analysis.id);
      await loadHistory();
      scrollToReport();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleHistorySelect(id: string) {
    await loadAnalysis(id);
    scrollToReport();
  }

  function addFiles(nextFiles: File[]) {
    const acceptedFiles = nextFiles.filter(isAcceptedDocument);

    if (acceptedFiles.length !== nextFiles.length) {
      setError("지원 형식은 md, txt, json, yaml, pdf입니다.");
    } else {
      setError(null);
    }

    setFiles((current) => {
      const merged = [...current];
      const seen = new Set(current.map(fileKey));

      for (const file of acceptedFiles) {
        if (merged.length >= MAX_DOCUMENTS) break;
        const key = fileKey(file);
        if (!seen.has(key)) {
          merged.push(file);
          seen.add(key);
        }
      }

      if (acceptedFiles.length && current.length + acceptedFiles.length > MAX_DOCUMENTS) {
        setError(`개발 문서는 최대 ${MAX_DOCUMENTS}개까지 업로드할 수 있습니다.`);
      }

      return merged;
    });
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(key: string) {
    setFiles((current) => current.filter((file) => fileKey(file) !== key));
  }

  function handleDownloadMarkdownReport() {
    if (!active) return;
    downloadMarkdownReport(active);
  }

  function handlePrintPdfReport() {
    if (!active) return;
    printPdfReport(active);
  }

  async function handleGenerateDraft(findingId: string) {
    if (!active) return;
    setDraftLoading((current) => ({ ...current, [findingId]: true }));
    setDraftErrors((current) => ({ ...current, [findingId]: "" }));
    try {
      const response = await fetch(`/api/analyses/${active.id}/findings/${findingId}/documentation-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: draftApiKey }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "문서 초안을 생성하지 못했습니다.");
      }
      setDrafts((current) => ({ ...current, [findingId]: payload.draft }));
    } catch (draftError) {
      setDraftErrors((current) => ({
        ...current,
        [findingId]: draftError instanceof Error ? draftError.message : String(draftError),
      }));
    } finally {
      setDraftLoading((current) => ({ ...current, [findingId]: false }));
    }
  }

  function scrollToReport() {
    window.setTimeout(() => {
      document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">
            <Code2 size={24} />
          </span>
          <span>CodeMatchAA</span>
        </div>
        <nav>
          <a href="#features">기능</a>
          <a href="#report">분석 결과</a>
          <a href="#history">히스토리</a>
        </nav>
      </header>

      <section className="hero">
        <div className="heroText">
          <h1>CodeMatchAA</h1>
        </div>
      </section>

      <section id="analyze" className="workspace">
        <form className="panel inputPanel" onSubmit={handleSubmit}>
          <div className="panelTitle">
            <FolderGit2 size={22} />
            <h2>분석 대상 입력</h2>
          </div>

          <label className="field">
            <span>GitHub Repository URL</span>
            <input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
            />
          </label>

          <div className="field">
            <span>개발 문서 업로드</span>
            <div
              className={`uploadDropZone ${isDraggingFile ? "dragActive" : ""}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="fileGrid">
                {files.map((file) => (
                  <div className="fileChip" key={fileKey(file)}>
                    <FileText size={22} />
                    <div>
                      <strong>{file.name}</strong>
                      <small>{formatBytes(file.size)}</small>
                    </div>
                    <button type="button" aria-label={`${file.name} 제거`} onClick={() => removeFile(fileKey(file))}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="uploadBox"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={22} />
                  <span>
                    <strong>파일 추가</strong>
                    <small>클릭하거나 문서를 끌어다 놓기</small>
                  </span>
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              className="hiddenInput"
              type="file"
              multiple
              accept=".md,.markdown,.txt,.pdf,.json,.yaml,.yml"
              onChange={handleFileInputChange}
            />
          </div>

          <fieldset className="basisGroup">
            <legend>분석 기준 선택</legend>
            <label>
              <span className="basisHelp" tabIndex={0} aria-label="문서 기준 분석 설명">
                <CircleAlert size={18} />
                <span className="basisTooltip" role="tooltip">
                  요구사항 문서, 기획서, API 명세가 최신이고 개발 코드가 그 내용을 따라왔는지 확인할 때 사용합니다. 문서에 있는 요구사항을 수집된 코드 범위에서 확인하지 못하면 코드 반영 누락 후보로 표시하고, PDF 근거 위치를 하이라이트합니다.
                </span>
              </span>
              <input
                type="radio"
                name="comparisonBasis"
                value="document_latest"
                checked={comparisonBasis === "document_latest"}
                onChange={() => handleComparisonBasisChange("document_latest")}
              />
              <span>
                <strong>문서 기준으로 코드 누락 찾기</strong>
                <small>최신 문서 요구사항이 코드에 반영됐는지 확인합니다.</small>
              </span>
            </label>
            <label>
              <span className="basisHelp" tabIndex={0} aria-label="코드 기준 분석 설명">
                <CircleAlert size={18} />
                <span className="basisTooltip" role="tooltip">
                  실제 GitHub 코드가 최신이고 문서가 뒤처졌을 가능성이 있을 때 사용합니다. 코드에 구현된 기능, 함수, API endpoint를 기준으로 업로드 문서에 빠진 설명을 찾고, 각 항목에서 Gemini 문서 추가 초안을 만들 수 있습니다.
                </span>
              </span>
              <input
                type="radio"
                name="comparisonBasis"
                value="code_latest"
                checked={comparisonBasis === "code_latest"}
                onChange={() => handleComparisonBasisChange("code_latest")}
              />
              <span>
                <strong>코드 기준으로 문서 누락 찾기</strong>
                <small>최신 코드 기능이 문서에 설명됐는지 확인합니다.</small>
              </span>
            </label>
            <label>
              <span className="basisHelp" tabIndex={0} aria-label="기준 모름 분석 설명">
                <CircleAlert size={18} />
                <span className="basisTooltip" role="tooltip">
                  문서와 코드 중 어느 쪽이 최신인지 아직 모를 때 사용합니다. 수정 방향을 단정하지 않고 기능 누락, API 불일치, 오래된 문서 가능성을 후보로 넓게 탐지한 뒤 사람이 기준본을 결정하도록 돕습니다.
                </span>
              </span>
              <input
                type="radio"
                name="comparisonBasis"
                value="unknown"
                checked={comparisonBasis === "unknown"}
                onChange={() => handleComparisonBasisChange("unknown")}
              />
              <span>
                <strong>먼저 차이 후보만 넓게 보기</strong>
                <small>최신 기준을 정하지 않고 불일치 후보를 탐지합니다.</small>
              </span>
            </label>
          </fieldset>

          <div className="secretNotice">
            <FileText size={18} />
            <span>
              문서 기준 모드에서 텍스트 레이어가 있는 PDF를 업로드하면, 매핑 가능한 문장 위치에 한해 원본 PDF 복사본에 노란색 하이라이트 artifact를 생성합니다.
            </span>
          </div>

          <div className="controlsRow">
            <label className="field compact">
              <span>기본 AI Provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="field compact apiKeyField">
              <span>OpenAI API Key</span>
              <div className="secretInput">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(event) => setOpenaiApiKey(event.target.value)}
                  placeholder="sk-... 또는 환경변수 사용"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
            <label className="field compact apiKeyField">
              <span>Gemini API Key</span>
              <div className="secretInput">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  placeholder="AIza... 또는 환경변수 사용"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
          </div>

          <div className="secretNotice">
            <ShieldCheck size={18} />
            <span>입력한 API key는 분석 요청 1회에만 사용되며 DB에 저장하지 않습니다. 한 provider key만 있으면 같은 모델 분석 에이전트 2개를 실행하고, 두 key가 모두 있으면 OpenAI와 Gemini 분석 에이전트를 각각 실행합니다.</span>
          </div>

          <div className="advancedOptions">
            <button
              type="button"
              className="advancedToggle"
              onClick={() => setShowAdvancedOptions((value) => !value)}
            >
              <span>
                <strong>탐지 유형</strong>
                <small>{selectedOptionSummary(options)} · 분석 기준에 맞춰 자동 선택됨</small>
              </span>
              <ChevronDown size={18} className={showAdvancedOptions ? "open" : ""} />
            </button>
            {showAdvancedOptions ? (
              <div className="checksRow">
                <p>일반적으로는 바꾸지 않아도 됩니다. 특정 finding 유형만 제외하고 싶을 때 사용하세요.</p>
                <div className="checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={options.missingFeature}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, missingFeature: event.target.checked }))
                      }
                    />
                    기능 누락
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={options.apiMismatch}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, apiMismatch: event.target.checked }))
                      }
                    />
                    API 불일치
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={options.outdatedDoc}
                      onChange={(event) =>
                        setOptions((current) => ({ ...current, outdatedDoc: event.target.checked }))
                      }
                    />
                    Outdated 문서
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {error ? <div className="errorBox">{error}</div> : null}

          <button className="submitButton" type="submit" disabled={submitting || activeIsRunning}>
            {submitting || activeIsRunning ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            분석 시작
          </button>
        </form>

        <section className="panel statusPanel">
          <div className="panelTitle">
            <Sparkles size={22} />
            <h2>분석 진행 상태</h2>
          </div>
          <div className="timeline">
            {statusSteps.map((step, index) => (
              <div className={`timelineItem ${step.status}`} key={step.key}>
                <span className="stepIcon">{stepIcon(step.status, index + 1)}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.message ?? statusLabel(step.status)}</small>
                </div>
                <time>{step.durationMs ? formatDuration(step.durationMs) : ""}</time>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section id="report" className="reportSection">
        <div className="sectionHeader">
          <div>
            <h2>분석 결과 미리보기</h2>
            <p>{active?.summary ?? "분석을 실행하면 리포트 요약과 상세 항목이 표시됩니다."}</p>
          </div>
          {active ? (
            <div className="reportActions">
              <button className="ghostButton" onClick={() => void loadAnalysis(active.id)}>
                <RefreshCw size={16} />
                새로고침
              </button>
              <button className="ghostButton" onClick={handlePrintPdfReport}>
                <Printer size={16} />
                PDF 저장
              </button>
              {combinedHighlightArtifacts(active).map((artifact, index) => (
                <a
                  className="ghostButton"
                  href={`/api/analyses/${active.id}/artifacts/${artifact.id}/download`}
                  key={artifact.id}
                >
                  <Download size={16} />
                  {index === 0 ? "하이라이트 문서 다운" : artifact.fileName}
                </a>
              ))}
              <button className="ghostButton" onClick={handleDownloadMarkdownReport}>
                <Download size={16} />
                Markdown
              </button>
            </div>
          ) : null}
        </div>

        <div className="metricGrid">
          <Metric icon={<AlertTriangle />} label="총 불일치" value={active?.totals.total ?? 0} tone="red" />
          <Metric icon={<Sparkles />} label="기능 누락" value={active?.totals.missingFeature ?? 0} tone="orange" />
          <Metric icon={<Code2 />} label="API 불일치" value={active?.totals.apiMismatch ?? 0} tone="purple" />
          <Metric icon={<FileText />} label="Outdated 문서" value={active?.totals.outdatedDoc ?? 0} tone="blue" />
          <Metric icon={<Flag />} label="High" value={active?.totals.high ?? 0} tone="red" />
          <Metric icon={<Flag />} label="Low" value={active?.totals.low ?? 0} tone="green" />
        </div>

        {active ? <ReportStorageSummary analysis={active} /> : null}

        <div className="resultLayout">
          <div className="findings">
            {active?.status === "failed" ? (
              <div className="emptyState danger">
                <AlertTriangle size={26} />
                <strong>분석 실패</strong>
                <span>{active.error}</span>
              </div>
            ) : active ? (
              <AnalysisReport
                analysis={active}
                drafts={drafts}
                draftApiKey={draftApiKey}
                draftErrors={draftErrors}
                draftLoading={draftLoading}
                onDraftApiKeyChange={setDraftApiKey}
                onGenerateDraft={handleGenerateDraft}
              />
            ) : (
              <div className="emptyState">
                <SearchCheck size={28} />
                <strong>분석 리포트 대기 중</strong>
                <span>분석을 실행하면 요약, 검토 범위, finding, 권장 조치가 이 영역에 표시됩니다.</span>
              </div>
            )}
          </div>

          <aside className="recommendations">
            <div className="recommendationCard">
              <FileText size={30} />
              <strong>문서 수정 필요</strong>
              <span>finding의 문서 근거와 코드 분석 결과를 비교해 README/API 문서를 최신화하세요.</span>
            </div>
            <div className="recommendationCard">
              <Code2 size={30} />
              <strong>API 명세 업데이트</strong>
              <span>응답 필드, 경로, 메서드가 구현과 일치하는지 확인하세요.</span>
            </div>
            <div className="recommendationCard">
              <SearchCheck size={30} />
              <strong>구현 여부 재확인</strong>
              <span>AI 결과는 의심 항목입니다. 관련 파일과 테스트를 함께 검토하세요.</span>
            </div>
            <div className="historyHint">
              <ShieldCheck size={22} />
              <span>업로드 원본은 저장하지 않고 evidence snippet과 분석 메타데이터만 남깁니다.</span>
            </div>
          </aside>
        </div>
      </section>

      <section id="history" className="historySection">
        <div className="sectionHeader">
          <div>
            <h2>분석 히스토리</h2>
            <p>영구 예시 리포트와 익명 세션 기준 최근 20개 분석이 표시됩니다.</p>
          </div>
          <History size={24} />
        </div>
        <div className="historyList">
          {history.map((item) => (
            <button
              className={`historyItem ${active?.id === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => void handleHistorySelect(item.id)}
            >
              <span>
                <strong>{item.repoOwner && item.repoName ? `${item.repoOwner}/${item.repoName}` : item.repoUrl}</strong>
                <small>
                  {item.isExample ? "예시 리포트 · " : ""}
                  {item.provider.toUpperCase()} · {basisLabel(item.comparisonBasis)} · {new Date(item.createdAt).toLocaleString("ko-KR")}
                </small>
              </span>
              <StatusPill status={item.status} />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function AnalysisReport({
  analysis,
  drafts,
  draftApiKey,
  draftErrors,
  draftLoading,
  onDraftApiKeyChange,
  onGenerateDraft,
}: {
  analysis: AnalysisDetail;
  drafts: Record<string, DocumentationDraft>;
  draftApiKey: string;
  draftErrors: Record<string, string>;
  draftLoading: Record<string, boolean>;
  onDraftApiKeyChange: (value: string) => void;
  onGenerateDraft: (findingId: string) => void;
}) {
  const repository =
    analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}/${analysis.repoName}` : analysis.repoUrl;
  const completedAt = analysis.completedAt
    ? new Date(analysis.completedAt).toLocaleString("ko-KR")
    : "분석 진행 중";
  const completedSteps = analysis.steps.filter((step) => step.status === "completed").length;

  return (
    <article className="reportDocument">
      <header className="reportHeader">
        <div>
          <span className="reportEyebrow">{analysis.isExample ? "CodeMatchAA Example Report" : "CodeMatchAA Report"}</span>
          <h3>{repository} 정합성 분석 리포트</h3>
          <p>{analysis.summary ?? "분석 결과 요약을 생성하는 중입니다."}</p>
        </div>
        <StatusPill status={analysis.status} />
      </header>

      <div className="reportMetaGrid">
        <ReportMeta label="Repository" value={repository} />
        <ReportMeta label="Provider" value={analysis.provider.toUpperCase()} />
        <ReportMeta label="분석 기준" value={basisLabel(analysis.comparisonBasis)} />
        <ReportMeta label="완료 시각" value={completedAt} />
        <ReportMeta label="분석 문서" value={`${analysis.documents.length}개`} />
        <ReportMeta label="단계 로그" value={`${completedSteps}/${analysis.steps.length}`} />
        <ReportMeta label="Finding" value={`${analysis.findings.length}개`} />
      </div>

      <section className="reportBlock">
        <h4>분석 범위</h4>
        <AnalysisScopeBox analysis={analysis} />
      </section>

      <BasisSpecificSection
        analysis={analysis}
        drafts={drafts}
        draftApiKey={draftApiKey}
        draftErrors={draftErrors}
        draftLoading={draftLoading}
        onDraftApiKeyChange={onDraftApiKeyChange}
        onGenerateDraft={onGenerateDraft}
      />

      <section className="reportBlock">
        <h4>업로드 문서</h4>
        {analysis.documents.length ? (
          <div className="reportDocuments">
            {analysis.documents.map((document) => (
              <div key={document.id}>
                <strong>{document.name}</strong>
                <span>
                  {formatBytes(document.size)} · {document.extractedChars.toLocaleString("ko-KR")} chars extracted
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>저장된 문서 메타데이터가 없습니다.</p>
        )}
      </section>

      <section className="reportBlock">
        <h4>탐지 결과</h4>
        {analysis.findings.length ? (
          <div className="findingList">
            {analysis.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                analysis={analysis}
                finding={finding}
                draft={drafts[finding.id]}
                draftError={draftErrors[finding.id]}
                draftLoading={Boolean(draftLoading[finding.id])}
                onGenerateDraft={onGenerateDraft}
              />
            ))}
          </div>
        ) : (
          <div className="noFindingReport">
            <SearchCheck size={24} />
            <div>
              <strong>중요 불일치가 발견되지 않았습니다</strong>
              <p>
                저장된 분석 결과 기준으로 기능 누락, API 불일치, outdated 문서 항목이 0건입니다.
                이는 AI 기반 의심 항목이 없다는 뜻이며, 최종 검수 전 주요 파일과 테스트를 함께 확인하는 것을 권장합니다.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="reportBlock">
        <ReportActionSummary analysis={analysis} />
      </section>

      <section className="reportBlock">
        <h4>권장 다음 조치</h4>
        <div className="actionList">
          <span>분석 요약과 finding 근거를 기준으로 문서 최신성을 검토하세요.</span>
          <span>finding이 0건이어도 핵심 API 응답 필드와 인증/권한 흐름은 수동으로 한 번 더 확인하세요.</span>
          <span>히스토리에서 이전 분석을 열어 변경 전후 리포트 차이를 비교하세요.</span>
        </div>
      </section>
    </article>
  );
}

function ReportActionSummary({ analysis }: { analysis: AnalysisDetail }) {
  const summary = analysis.reportRecommendationSummary;
  return (
    <div className="actionSummary">
      <div className="actionSummaryTitle">
        <ClipboardList size={20} />
        <div>
          <h4>AI 기반 수정 권장 요약</h4>
          <p>{summary.headline}</p>
        </div>
      </div>
      <div className="actionSummaryGrid">
        <div>
          <strong>우선 조치</strong>
          <ol>
            {summary.priorityActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
        <div>
          <strong>검토 포커스</strong>
          <div className="focusTags">
            {summary.reviewFocus.map((focus) => (
              <span key={focus}>{focus}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalysisScopeBox({ analysis }: { analysis: AnalysisDetail }) {
  const scope = analysis.totals.scope;
  const warnings = scope?.warnings ?? [];
  return (
    <div className="scopeList">
      <span>수집된 코드 파일 수: {scope?.collectedCodeFileCount ?? 0}개</span>
      <span>분석에 사용된 코드 청크 수: {scope?.codeChunkCount ?? 0}개</span>
      <span>분석에 사용된 문서 청크 수: {scope?.documentChunkCount ?? 0}개</span>
      <span>제외되거나 잘린 항목: {warnings.length ? "있음" : "확인된 항목 없음"}</span>
      {scope?.githubTreeTruncated ? <span>GitHub tree 응답이 잘려 핵심 파일 위주로 분석했습니다.</span> : null}
      {scope?.highlightMappingFailures ? (
        <span>PDF 하이라이트 매핑 실패: {scope.highlightMappingFailures}건</span>
      ) : null}
      {warnings.map((warning) => (
        <span key={warning}>{warning}</span>
      ))}
    </div>
  );
}

function BasisSpecificSection({
  analysis,
  drafts,
  draftApiKey,
  draftErrors,
  draftLoading,
  onDraftApiKeyChange,
  onGenerateDraft,
}: {
  analysis: AnalysisDetail;
  drafts: Record<string, DocumentationDraft>;
  draftApiKey: string;
  draftErrors: Record<string, string>;
  draftLoading: Record<string, boolean>;
  onDraftApiKeyChange: (value: string) => void;
  onGenerateDraft: (findingId: string) => void;
}) {
  if (analysis.comparisonBasis === "document_latest") {
    const findings = analysis.findings.filter(
      (finding) => finding.type === "missing_feature" || finding.type === "api_mismatch",
    );
    return (
      <section className="reportBlock">
        <h4>코드 반영 누락 가능 요구사항</h4>
        <p>최신 문서에 정의된 요구사항이 현재 코드에 반영되지 않았을 가능성이 있습니다.</p>
        <div className="findingList">
          {findings.map((finding) => (
            <FindingCard key={finding.id} analysis={analysis} finding={finding} />
          ))}
        </div>
      </section>
    );
  }

  if (analysis.comparisonBasis === "code_latest") {
    const findings = analysis.findings.filter((finding) => finding.type === "outdated_doc");
    return (
      <section className="reportBlock">
        <h4>문서에 반영되지 않은 구현 기능</h4>
        <p>현재 코드에 구현된 기능이 업로드 문서에 반영되지 않았을 가능성이 있습니다.</p>
        <label className="field compact draftKeyField">
          <span>Gemini API Key</span>
          <input
            type="password"
            value={draftApiKey}
            onChange={(event) => onDraftApiKeyChange(event.target.value)}
            placeholder="서버 GEMINI_API_KEY가 없을 때만 입력"
            autoComplete="off"
          />
        </label>
        <div className="findingList">
          {findings.map((finding) => (
            <FindingCard
              key={finding.id}
              analysis={analysis}
              finding={finding}
              draft={drafts[finding.id]}
              draftError={draftErrors[finding.id]}
              draftLoading={Boolean(draftLoading[finding.id])}
              onGenerateDraft={onGenerateDraft}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="reportBlock">
      <h4>불일치 후보</h4>
      <p>문서와 코드 간 불일치 후보가 발견되었습니다. 어느 쪽이 최신 기준인지 확인한 뒤 수정 방향을 결정하세요.</p>
    </section>
  );
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="reportMeta">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ReportStorageSummary({ analysis }: { analysis: AnalysisDetail }) {
  const completedSteps = analysis.steps.filter((step) => step.status === "completed").length;
  const title = analysis.isExample ? "영구 예시 리포트" : "DB 저장 확인";
  const description = analysis.isExample
    ? "이 리포트는 모든 세션에서 볼 수 있도록 앱에 번들된 예시 분석 데이터입니다."
    : "이 리포트는 Supabase에 저장된 분석 데이터를 다시 불러와 표시합니다.";
  return (
    <section className="storageSummary" aria-label={title}>
      <div className="storageTitle">
        <Database size={20} />
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="storageGrid">
        <StorageItem label="Analysis ID" value={analysis.id} />
        <StorageItem
          label="Repository"
          value={analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}/${analysis.repoName}` : analysis.repoUrl}
        />
        <StorageItem label="Provider" value={analysis.provider.toUpperCase()} />
        <StorageItem label="분석 기준" value={basisLabel(analysis.comparisonBasis)} />
        <StorageItem label="Status" value={statusLabel(analysis.status)} />
        <StorageItem label="문서 메타데이터" value={`${analysis.documents.length}개 저장`} />
        <StorageItem label="단계 로그" value={`${completedSteps}/${analysis.steps.length} 완료`} />
        <StorageItem label="Finding" value={`${analysis.findings.length}개 저장`} />
        <StorageItem label="Artifact" value={`${analysis.artifacts.length}개 저장`} />
        <StorageItem label="완료 시각" value={analysis.completedAt ? new Date(analysis.completedAt).toLocaleString("ko-KR") : "-"} />
      </div>
      {analysis.documents.length ? (
        <div className="documentList">
          {analysis.documents.map((document) => (
            <span key={document.id}>
              {document.name} · {formatBytes(document.size)} · {document.extractedChars.toLocaleString("ko-KR")} chars
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StorageItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="storageItem">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function FindingCard({
  analysis,
  finding,
  draft,
  draftError,
  draftLoading,
  onGenerateDraft,
}: {
  analysis: AnalysisDetail;
  finding: AnalysisDetail["findings"][number];
  draft?: DocumentationDraft;
  draftError?: string;
  draftLoading?: boolean;
  onGenerateDraft?: (findingId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const canDraft =
    analysis.comparisonBasis === "code_latest" &&
    finding.type === "outdated_doc" &&
    Boolean(onGenerateDraft);
  return (
    <article className={`finding ${finding.severity}`}>
      <button className="findingHeader" onClick={() => setOpen((value) => !value)}>
        <span className={`typeBadge ${finding.type}`}>{typeLabel(finding.type)}</span>
        <strong>{finding.title}</strong>
        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
        <ChevronDown size={18} className={open ? "open" : ""} />
      </button>
      {open ? (
        <div className="findingBody">
          <Evidence icon={<FileText />} label="문서 근거" text={finding.documentEvidence} />
          <Evidence icon={<Code2 />} label="코드 분석 결과" text={finding.codeEvidence} />
          {finding.documentLocation?.pageNumber ? (
            <Evidence
              icon={<FileText />}
              label="PDF 위치"
              text={`${finding.documentLocation.documentName ?? "문서"} ${finding.documentLocation.pageNumber}페이지`}
            />
          ) : null}
          {finding.codeLocations.length ? (
            <Evidence icon={<Code2 />} label="코드 위치" text={formatCodeLocations(finding.codeLocations)} />
          ) : null}
          <Evidence
            icon={<FolderGit2 />}
            label="관련 파일"
            text={finding.relatedFiles.length ? finding.relatedFiles.join(", ") : "관련 파일 특정 어려움"}
          />
          <Evidence icon={<Sparkles />} label="권장 조치" text={finding.recommendation} />
          {analysis.comparisonBasis === "document_latest" ? (
            <HighlightDownload analysis={analysis} finding={finding} />
          ) : null}
          {canDraft ? (
            <div className="draftAction">
              <button className="ghostButton" type="button" onClick={() => onGenerateDraft?.(finding.id)} disabled={draftLoading}>
                {draftLoading ? <Loader2 className="spin" size={16} /> : <ClipboardList size={16} />}
                이 기능 문서에 추가하기
              </button>
              {draftError ? <span className="draftError">{draftError}</span> : null}
              {draft ? <DocumentationDraftBox draft={draft} /> : null}
            </div>
          ) : null}
          <div className="confidence">confidence {Math.round(finding.confidence * 100)}%</div>
        </div>
      ) : null}
    </article>
  );
}

function HighlightDownload({
  analysis,
  finding,
}: {
  analysis: AnalysisDetail;
  finding: AnalysisDetail["findings"][number];
}) {
  const hasCombinedArtifact = combinedHighlightArtifacts(analysis).some(
    (artifact) => artifact.id === finding.documentLocation?.artifactId,
  );
  if (hasCombinedArtifact && finding.documentLocation?.highlightStatus === "created") {
    return (
      <div className="highlightNotice">
        {finding.documentLocation.highlightMessage ??
          "상단의 하이라이트 문서 다운 버튼에서 통합 PDF를 다운로드할 수 있습니다."}
      </div>
    );
  }

  const artifactId = finding.documentLocation?.artifactId;
  if (artifactId && finding.documentLocation?.highlightStatus === "created") {
    return (
      <div className="draftAction">
        <a className="ghostButton" href={`/api/analyses/${analysis.id}/artifacts/${artifactId}/download`}>
          <Download size={16} />
          하이라이트 PDF 다운로드
        </a>
        <span>{finding.documentLocation.highlightMessage}</span>
      </div>
    );
  }
  if (finding.documentLocation?.highlightMessage) {
    return <div className="highlightNotice">{finding.documentLocation.highlightMessage}</div>;
  }
  return <div className="highlightNotice">이 finding은 PDF 텍스트 위치와 연결되지 않아 하이라이트 파일이 없습니다.</div>;
}

function combinedHighlightArtifacts(analysis: AnalysisDetail) {
  return analysis.artifacts.filter((artifact) => artifact.type === "highlighted_source_pdf_combined");
}

function DocumentationDraftBox({ draft }: { draft: DocumentationDraft }) {
  const text = [
    `추가 권장 위치: ${draft.suggestedSection}`,
    `추가 권장 제목: ${draft.suggestedTitle}`,
    "",
    draft.body,
    "",
    ...(draft.reviewNotes?.length ? ["검토 필요 사항:", ...draft.reviewNotes.map((note) => `- ${note}`)] : []),
  ].join("\n");

  return (
    <div className="draftBox">
      <strong>문서 추가 초안</strong>
      <dl>
        <div>
          <dt>추가 권장 위치</dt>
          <dd>{draft.suggestedSection}</dd>
        </div>
        <div>
          <dt>추가 권장 제목</dt>
          <dd>{draft.suggestedTitle}</dd>
        </div>
      </dl>
      <p>{draft.body}</p>
      {draft.reviewNotes?.length ? (
        <ul>
          {draft.reviewNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <button className="ghostButton" type="button" onClick={() => void navigator.clipboard.writeText(text)}>
        <Copy size={16} />
        복사하기
      </button>
    </div>
  );
}

function Evidence({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="evidence">
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`statusPill ${status}`}>{statusLabel(status)}</span>;
}

function stepIcon(status: string, index: number) {
  if (status === "completed") return <Check size={18} />;
  if (status === "running") return <Loader2 className="spin" size={18} />;
  if (status === "failed") return <AlertTriangle size={18} />;
  return index;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "대기 중",
    collecting: "수집 중",
    parsing: "문서 분석 중",
    analyzing: "AI 분석 중",
    reporting: "리포트 생성 중",
    completed: "완료",
    failed: "실패",
    pending: "대기 중",
    running: "진행 중...",
  };
  return labels[status] ?? status;
}

function basisLabel(value: ComparisonBasis) {
  const labels: Record<ComparisonBasis, string> = {
    document_latest: "업로드 문서 최신",
    code_latest: "GitHub 코드 최신",
    unknown: "기준 모름",
  };
  return labels[value] ?? "기준 모름";
}

function selectedOptionSummary(options: { missingFeature: boolean; apiMismatch: boolean; outdatedDoc: boolean }) {
  const selected = [
    options.missingFeature ? "기능 누락" : null,
    options.apiMismatch ? "API 불일치" : null,
    options.outdatedDoc ? "Outdated 문서" : null,
  ].filter(Boolean);
  return selected.length ? selected.join(", ") : "선택된 유형 없음";
}

function formatCodeLocations(locations: AnalysisDetail["findings"][number]["codeLocations"]) {
  return locations
    .map((location) => {
      const endpoint = location.endpoint ? `${location.endpoint.method} ${location.endpoint.path}` : null;
      const lineRange =
        location.startLine && location.endLine ? `:${location.startLine}-${location.endLine}` : "";
      const symbol = location.symbolName ? ` · ${location.symbolName}` : "";
      return `${location.path}${lineRange}${symbol}${endpoint ? ` · ${endpoint}` : ""}`;
    })
    .join(", ");
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    missing_feature: "기능 누락",
    api_mismatch: "API 불일치",
    outdated_doc: "Outdated 문서",
  };
  return labels[type] ?? type;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isAcceptedDocument(file: File) {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_DOCUMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function downloadMarkdownReport(analysis: AnalysisDetail) {
  const blob = new Blob([buildReportMarkdown(analysis)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(analysis);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function printPdfReport(analysis: AnalysisDetail) {
  const printWindow = window.open("", "_blank", "width=980,height=720");
  if (!printWindow) {
    window.alert("팝업이 차단되어 PDF 창을 열 수 없습니다. 브라우저 팝업 허용 후 다시 시도하세요.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableReportHtml(analysis));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 350);
}

function buildReportMarkdown(analysis: AnalysisDetail) {
  const repository =
    analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}/${analysis.repoName}` : analysis.repoUrl;
  const completedAt = analysis.completedAt
    ? new Date(analysis.completedAt).toLocaleString("ko-KR")
    : "분석 진행 중";
  const createdAt = new Date(analysis.createdAt).toLocaleString("ko-KR");

  return [
    `# ${repository} 정합성 분석 리포트`,
    "",
    "## 요약",
    analysis.summary ?? "분석 결과 요약이 없습니다.",
    "",
    "## 메타 정보",
    `- Analysis ID: ${analysis.id}`,
    `- Repository: ${repository}`,
    `- Provider: ${analysis.provider.toUpperCase()}`,
    `- 분석 기준: ${basisLabel(analysis.comparisonBasis)}`,
    `- Status: ${statusLabel(analysis.status)}`,
    `- Created At: ${createdAt}`,
    `- Completed At: ${completedAt}`,
    "",
    "## 탐지 요약",
    `- 총 불일치: ${analysis.totals.total}`,
    `- 기능 누락: ${analysis.totals.missingFeature}`,
    `- API 불일치: ${analysis.totals.apiMismatch}`,
    `- Outdated 문서: ${analysis.totals.outdatedDoc}`,
    `- High: ${analysis.totals.high}`,
    `- Low: ${analysis.totals.low}`,
    `- 수집된 코드 파일 수: ${analysis.totals.scope?.collectedCodeFileCount ?? 0}`,
    `- 코드 청크 수: ${analysis.totals.scope?.codeChunkCount ?? 0}`,
    `- 문서 청크 수: ${analysis.totals.scope?.documentChunkCount ?? 0}`,
    "",
    "## 업로드 문서",
    ...documentMarkdownLines(analysis),
    "",
    "## 분석 단계",
    ...stepMarkdownLines(analysis),
    "",
    "## 탐지 결과",
    ...findingMarkdownLines(analysis),
    "",
    "## 권장 다음 조치",
    "- 분석 요약과 finding 근거를 기준으로 문서 최신성을 검토하세요.",
    "- finding이 0건이어도 핵심 API 응답 필드와 인증/권한 흐름은 수동으로 한 번 더 확인하세요.",
    "- 히스토리에서 이전 분석을 열어 변경 전후 리포트 차이를 비교하세요.",
    "",
  ].join("\n");
}

function documentMarkdownLines(analysis: AnalysisDetail) {
  if (!analysis.documents.length) return ["저장된 문서 메타데이터가 없습니다."];

  return analysis.documents.map(
    (document) =>
      `- ${document.name} (${formatBytes(document.size)}, ${document.extractedChars.toLocaleString("ko-KR")} chars extracted)`,
  );
}

function stepMarkdownLines(analysis: AnalysisDetail) {
  if (!analysis.steps.length) return ["저장된 단계 로그가 없습니다."];

  return analysis.steps.map((step) => {
    const duration = step.durationMs ? `, ${formatDuration(step.durationMs)}` : "";
    const message = step.message ? `, ${step.message}` : "";
    return `- ${step.label}: ${statusLabel(step.status)}${duration}${message}`;
  });
}

function findingMarkdownLines(analysis: AnalysisDetail) {
  if (!analysis.findings.length) {
    return [
      "중요 불일치가 발견되지 않았습니다.",
      "",
      "저장된 분석 결과 기준으로 기능 누락, API 불일치, outdated 문서 항목이 0건입니다.",
    ];
  }

  return analysis.findings.flatMap((finding, index) => [
    `### ${index + 1}. ${finding.title}`,
    "",
    `- 유형: ${typeLabel(finding.type)}`,
    `- 심각도: ${finding.severity}`,
    `- Confidence: ${Math.round(finding.confidence * 100)}%`,
    `- 관련 파일: ${finding.relatedFiles.length ? finding.relatedFiles.join(", ") : "관련 파일 특정 어려움"}`,
    `- PDF 위치: ${finding.documentLocation?.pageNumber ? `${finding.documentLocation.documentName ?? "문서"} ${finding.documentLocation.pageNumber}페이지` : "없음"}`,
    `- 코드 위치: ${finding.codeLocations.length ? formatCodeLocations(finding.codeLocations) : "없음"}`,
    "",
    "문서 근거:",
    finding.documentEvidence,
    "",
    "코드 분석 결과:",
    finding.codeEvidence,
    "",
    "권장 조치:",
    finding.recommendation,
    "",
  ]);
}

function reportFileName(analysis: AnalysisDetail) {
  const repository =
    analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}-${analysis.repoName}` : analysis.id;
  const date = new Date(analysis.completedAt ?? analysis.createdAt).toISOString().slice(0, 10);
  return `codematch-report-${sanitizeFileName(repository)}-${date}.md`;
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildPrintableReportHtml(analysis: AnalysisDetail) {
  const repository =
    analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}/${analysis.repoName}` : analysis.repoUrl;
  const completedAt = analysis.completedAt
    ? new Date(analysis.completedAt).toLocaleString("ko-KR")
    : "분석 진행 중";
  const createdAt = new Date(analysis.createdAt).toLocaleString("ko-KR");
  const fileName = reportFileName(analysis).replace(/\.md$/, ".pdf");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileName)}</title>
  <style>
    @page {
      size: A4;
      margin: 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #111827;
      background: #eef3fb;
      font-family: Inter, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 18mm;
      background: #ffffff;
    }

    .cover {
      position: relative;
      overflow: hidden;
      min-height: 116mm;
      padding: 18mm;
      border-radius: 18px;
      color: #ffffff;
      background:
        linear-gradient(135deg, rgba(14, 91, 255, 0.96), rgba(9, 29, 94, 0.98)),
        radial-gradient(circle at 84% 18%, rgba(255, 255, 255, 0.22), transparent 34%);
    }

    .cover::after {
      position: absolute;
      right: -34mm;
      bottom: -44mm;
      width: 96mm;
      height: 96mm;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 50%;
      content: "";
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: 1px solid rgba(255, 255, 255, 0.34);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .mark {
      display: inline-grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 7px;
      color: #0e5bff;
      background: #ffffff;
      font-weight: 900;
    }

    h1 {
      position: relative;
      z-index: 1;
      max-width: 128mm;
      margin: 22mm 0 7mm;
      font-size: 30px;
      line-height: 1.22;
      letter-spacing: 0;
    }

    .subtitle {
      position: relative;
      z-index: 1;
      max-width: 138mm;
      margin: 0;
      color: #dbe7ff;
      font-size: 13px;
      line-height: 1.7;
    }

    .coverMeta {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 18mm;
    }

    .coverMeta div,
    .card,
    .section,
    .finding {
      break-inside: avoid;
    }

    .coverMeta div {
      min-height: 24mm;
      padding: 10px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.12);
    }

    small {
      display: block;
      color: inherit;
      opacity: 0.72;
      font-size: 10px;
      font-weight: 800;
    }

    strong {
      overflow-wrap: anywhere;
    }

    .coverMeta strong {
      display: block;
      margin-top: 5px;
      font-size: 13px;
      line-height: 1.35;
    }

    .content {
      padding-top: 10mm;
    }

    .section {
      margin-top: 9mm;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 4mm;
      color: #0c1533;
      font-size: 18px;
      letter-spacing: 0;
    }

    h2::before {
      width: 5px;
      height: 18px;
      border-radius: 999px;
      background: #0e5bff;
      content: "";
    }

    p {
      margin: 0;
      color: #465572;
      font-size: 11.5px;
      line-height: 1.7;
    }

    .metrics,
    .metaGrid {
      display: grid;
      gap: 8px;
    }

    .metrics {
      grid-template-columns: repeat(4, 1fr);
      margin-top: 6mm;
    }

    .metaGrid {
      grid-template-columns: repeat(3, 1fr);
    }

    .card {
      padding: 10px;
      border: 1px solid #dce5f3;
      border-radius: 12px;
      background: #fbfdff;
    }

    .metricValue {
      display: block;
      margin-top: 5px;
      font-size: 21px;
      font-weight: 900;
    }

    .red {
      color: #e43535;
    }

    .orange {
      color: #f07800;
    }

    .blue {
      color: #0e5bff;
    }

    .green {
      color: #119c55;
    }

    .list {
      display: grid;
      gap: 7px;
    }

    .row {
      padding: 9px 10px;
      border: 1px solid #e1e8f4;
      border-radius: 10px;
      background: #fbfdff;
      font-size: 11px;
      line-height: 1.55;
    }

    .row strong {
      display: block;
      margin-bottom: 2px;
      color: #0c1533;
      font-size: 11.5px;
    }

    .finding {
      margin-top: 8px;
      padding: 12px;
      border: 1px solid #dce5f3;
      border-left: 4px solid #f07800;
      border-radius: 12px;
      background: #ffffff;
    }

    .finding.high {
      border-left-color: #e43535;
    }

    .finding.low {
      border-left-color: #119c55;
    }

    .findingHead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 9px;
    }

    .finding h3 {
      margin: 0;
      color: #0c1533;
      font-size: 14px;
      line-height: 1.35;
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: flex-end;
    }

    .badge {
      display: inline-flex;
      min-height: 22px;
      align-items: center;
      padding: 0 8px;
      border-radius: 999px;
      background: #eef4ff;
      color: #0e5bff;
      font-size: 9.5px;
      font-weight: 900;
      white-space: nowrap;
    }

    .badge.danger {
      color: #d82020;
      background: #ffe9e9;
    }

    .badge.warn {
      color: #b35400;
      background: #fff2df;
    }

    .evidenceGrid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .evidence {
      min-width: 0;
      padding: 9px;
      border: 1px solid #e1e8f4;
      border-radius: 10px;
      background: #fbfdff;
    }

    .evidence b {
      display: block;
      margin-bottom: 4px;
      color: #0c1533;
      font-size: 10.5px;
    }

    .evidence p {
      overflow-wrap: anywhere;
      font-size: 10.5px;
    }

    .footer {
      margin-top: 12mm;
      padding-top: 5mm;
      border-top: 1px solid #dce5f3;
      color: #7a8498;
      font-size: 10px;
      line-height: 1.6;
    }

    @media print {
      body {
        background: #ffffff;
      }

      .page {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <div class="brand"><span class="mark">&lt;/&gt;</span> CodeMatchAA Report</div>
      <h1>${escapeHtml(repository)}<br />정합성 분석 리포트</h1>
      <p class="subtitle">${escapeHtml(analysis.summary ?? "분석 결과 요약이 없습니다.")}</p>
      <div class="coverMeta">
        <div><small>Provider</small><strong>${escapeHtml(analysis.provider.toUpperCase())}</strong></div>
        <div><small>Status</small><strong>${escapeHtml(statusLabel(analysis.status))}</strong></div>
        <div><small>Completed</small><strong>${escapeHtml(completedAt)}</strong></div>
      </div>
    </section>

    <section class="content">
      <section class="section">
        <h2>탐지 요약</h2>
        <p>문서와 코드 간의 의심 불일치 항목을 유형과 심각도 기준으로 요약했습니다.</p>
        <div class="metrics">
          ${printMetric("총 불일치", analysis.totals.total, "red")}
          ${printMetric("기능 누락", analysis.totals.missingFeature, "orange")}
          ${printMetric("API 불일치", analysis.totals.apiMismatch, "blue")}
          ${printMetric("Outdated 문서", analysis.totals.outdatedDoc, "green")}
        </div>
        <div class="metrics">
          ${printMetric("High", analysis.totals.high, "red")}
          ${printMetric("Low", analysis.totals.low, "green")}
          ${printMetric("Finding", analysis.findings.length, "blue")}
        </div>
      </section>

      <section class="section">
        <h2>메타 정보</h2>
        <div class="metaGrid">
          ${printCard("Analysis ID", analysis.id)}
          ${printCard("Repository", repository)}
          ${printCard("Created", createdAt)}
          ${printCard("분석 문서", `${analysis.documents.length}개`)}
          ${printCard("단계 로그", `${analysis.steps.filter((step) => step.status === "completed").length}/${analysis.steps.length} 완료`)}
          ${printCard("DB 저장", "Supabase 조회 데이터")}
        </div>
      </section>

      <section class="section">
        <h2>업로드 문서</h2>
        <div class="list">${printDocumentsHtml(analysis)}</div>
      </section>

      <section class="section">
        <h2>분석 단계</h2>
        <div class="list">${printStepsHtml(analysis)}</div>
      </section>

      <section class="section">
        <h2>탐지 결과</h2>
        ${printFindingsHtml(analysis)}
      </section>

      <section class="section">
        <h2>권장 다음 조치</h2>
        <div class="list">
          <div class="row">분석 요약과 finding 근거를 기준으로 문서 최신성을 검토하세요.</div>
          <div class="row">finding이 0건이어도 핵심 API 응답 필드와 인증/권한 흐름은 수동으로 한 번 더 확인하세요.</div>
          <div class="row">히스토리에서 이전 분석을 열어 변경 전후 리포트 차이를 비교하세요.</div>
        </div>
      </section>

      <div class="footer">
        CodeMatchAA 리포트는 AI 기반 의심 항목과 근거를 제공하는 검토 보조 자료입니다. 업로드 원본 파일과 API key는 이 리포트에 포함되지 않습니다.
      </div>
    </section>
  </main>
</body>
</html>`;
}

function printMetric(label: string, value: number, tone: string) {
  return `<div class="card"><small>${escapeHtml(label)}</small><span class="metricValue ${escapeAttribute(tone)}">${value}</span></div>`;
}

function printCard(label: string, value: string) {
  return `<div class="card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function printDocumentsHtml(analysis: AnalysisDetail) {
  if (!analysis.documents.length) return `<div class="row">저장된 문서 메타데이터가 없습니다.</div>`;

  return analysis.documents
    .map(
      (document) =>
        `<div class="row"><strong>${escapeHtml(document.name)}</strong>${escapeHtml(formatBytes(document.size))} · ${escapeHtml(document.extractedChars.toLocaleString("ko-KR"))} chars extracted</div>`,
    )
    .join("");
}

function printStepsHtml(analysis: AnalysisDetail) {
  if (!analysis.steps.length) return `<div class="row">저장된 단계 로그가 없습니다.</div>`;

  return analysis.steps
    .map((step) => {
      const duration = step.durationMs ? ` · ${formatDuration(step.durationMs)}` : "";
      const message = step.message ? ` · ${step.message}` : "";
      return `<div class="row"><strong>${escapeHtml(step.label)}</strong>${escapeHtml(statusLabel(step.status) + duration + message)}</div>`;
    })
    .join("");
}

function printFindingsHtml(analysis: AnalysisDetail) {
  if (!analysis.findings.length) {
    return `<div class="finding low">
      <div class="findingHead">
        <h3>중요 불일치가 발견되지 않았습니다</h3>
        <div class="badges"><span class="badge">0 findings</span></div>
      </div>
      <p>저장된 분석 결과 기준으로 기능 누락, API 불일치, outdated 문서 항목이 0건입니다. 최종 검수 전 주요 파일과 테스트는 함께 확인하는 것을 권장합니다.</p>
    </div>`;
  }

  return analysis.findings
    .map((finding, index) => {
      const severityClass = finding.severity === "high" ? "danger" : "";
      return `<article class="finding ${escapeAttribute(finding.severity)}">
        <div class="findingHead">
          <h3>${index + 1}. ${escapeHtml(finding.title)}</h3>
          <div class="badges">
            <span class="badge">${escapeHtml(typeLabel(finding.type))}</span>
            <span class="badge ${severityClass}">${escapeHtml(finding.severity)}</span>
            <span class="badge">${Math.round(finding.confidence * 100)}%</span>
          </div>
        </div>
        <div class="evidenceGrid">
          ${printEvidence("문서 근거", finding.documentEvidence)}
          ${printEvidence("코드 분석 결과", finding.codeEvidence)}
          ${printEvidence("관련 파일", finding.relatedFiles.length ? finding.relatedFiles.join(", ") : "관련 파일 특정 어려움")}
          ${printEvidence("권장 조치", finding.recommendation)}
        </div>
      </article>`;
    })
    .join("");
}

function printEvidence(label: string, value: string) {
  return `<div class="evidence"><b>${escapeHtml(label)}</b><p>${escapeHtml(value)}</p></div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/\s+/g, "-");
}

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}

function buildMarkdownReport(analysis: AnalysisDetail) {
  const repository =
    analysis.repoOwner && analysis.repoName ? `${analysis.repoOwner}/${analysis.repoName}` : analysis.repoUrl;
  const lines = [
    "# CodeMatchAA Report",
    "",
    `- Repository: ${repository}`,
    `- Provider: ${analysis.provider.toUpperCase()}`,
    `- Status: ${statusLabel(analysis.status)}`,
    `- Completed At: ${analysis.completedAt ? new Date(analysis.completedAt).toLocaleString("ko-KR") : "-"}`,
    `- Documents: ${analysis.documents.length}`,
    `- Findings: ${analysis.findings.length}`,
    "",
    "## Summary",
    "",
    analysis.summary ?? "분석 요약이 없습니다.",
    "",
    "## Recommendation Summary",
    "",
    analysis.reportRecommendationSummary.headline,
    "",
    ...analysis.reportRecommendationSummary.priorityActions.map((action) => `- ${action}`),
    "",
    "## Uploaded Documents",
    "",
    ...analysis.documents.map(
      (document) =>
        `- ${document.name} (${formatBytes(document.size)}, ${document.extractedChars.toLocaleString("ko-KR")} chars)`,
    ),
    "",
    "## Findings",
    "",
    ...(analysis.findings.length
      ? analysis.findings.flatMap((finding, index) => [
          `### ${index + 1}. ${finding.title}`,
          "",
          `- Type: ${typeLabel(finding.type)}`,
          `- Severity: ${finding.severity}`,
          `- Confidence: ${Math.round(finding.confidence * 100)}%`,
          `- Related Files: ${finding.relatedFiles.length ? finding.relatedFiles.join(", ") : "-"}`,
          `- Document Evidence: ${finding.documentEvidence}`,
          `- Code Evidence: ${finding.codeEvidence}`,
          `- Recommendation: ${finding.recommendation}`,
          "",
        ])
      : ["중요 불일치 항목이 발견되지 않았습니다.", ""]),
  ];
  return `${lines.join("\n")}\n`;
}
