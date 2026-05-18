"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  Flag,
  FolderGit2,
  History,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Provider = "openai" | "gemini";

type Totals = {
  total: number;
  missingFeature: number;
  apiMismatch: number;
  outdatedDoc: number;
  high: number;
  medium: number;
  low: number;
};

type AnalysisSummary = {
  id: string;
  repoUrl: string;
  repoOwner: string | null;
  repoName: string | null;
  provider: Provider;
  status: string;
  summary: string | null;
  error: string | null;
  totals: Totals;
  createdAt: string;
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
    severity: "high" | "medium" | "low";
    title: string;
    documentEvidence: string;
    codeEvidence: string;
    relatedFiles: string[];
    recommendation: string;
    confidence: number;
  }>;
};

const DEFAULT_STEPS = [
  "Repository URL 확인",
  "GitHub 코드 수집",
  "문서 Parsing",
  "AI 비교 분석",
  "결과 리포트 생성",
];

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/vercel/next.js");
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState({
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: true,
  });
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [active, setActive] = useState<AnalysisDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeIsRunning = active
    ? ["queued", "collecting", "parsing", "analyzing", "reporting"].includes(active.status)
    : false;

  useEffect(() => {
    void loadHistory();
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

  async function loadHistory() {
    const response = await fetch("/api/analyses", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setHistory(payload.analyses);
    }
  }

  async function loadAnalysis(id: string) {
    const response = await fetch(`/api/analyses/${id}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setActive(payload.analysis);
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
    formData.set("apiKey", apiKey);
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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  function removeFile(fileName: string) {
    setFiles((current) => current.filter((file) => file.name !== fileName));
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">
            <Code2 size={24} />
          </span>
          <span>CodeMatch <strong>AI</strong></span>
        </div>
        <nav>
          <a href="#features">기능</a>
          <a href="#report">분석 결과</a>
          <a href="#history">히스토리</a>
        </nav>
      </header>

      <section className="hero">
        <div className="heroText">
          <h1>
            개발 문서와 코드의
            <span> 불일치를 자동으로 탐지하세요</span>
          </h1>
          <p>
            공개 GitHub Repository와 개발 문서를 비교해 기능 누락, API 불일치,
            outdated 문서 가능성을 AI가 분석합니다.
          </p>
          <div className="heroActions">
            <a className="primaryLink" href="#analyze">
              <Sparkles size={18} />
              분석 시작
            </a>
            <a className="secondaryLink" href="#report">
              <FileText size={18} />
              리포트 보기
            </a>
          </div>
        </div>
        <div className="heroVisual" aria-hidden="true">
          <div className="docPanel leftDoc">
            <FileText size={28} />
            <span />
            <span />
            <span />
          </div>
          <div className="aiNode">AI</div>
          <div className="docPanel rightDoc">
            <Code2 size={28} />
            <span />
            <span />
            <span />
          </div>
          <div className="connection" />
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
              placeholder="https://github.com/example/project"
            />
          </label>

          <div className="field">
            <span>개발 문서 업로드</span>
            <div className="fileGrid">
              {files.map((file) => (
                <div className="fileChip" key={file.name}>
                  <FileText size={22} />
                  <div>
                    <strong>{file.name}</strong>
                    <small>{formatBytes(file.size)}</small>
                  </div>
                  <button type="button" aria-label={`${file.name} 제거`} onClick={() => removeFile(file.name)}>
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
                파일 추가
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="hiddenInput"
              type="file"
              multiple
              accept=".md,.markdown,.txt,.pdf,.json,.yaml,.yml"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </div>

          <div className="controlsRow">
            <label className="field compact">
              <span>AI Provider</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </label>
            <label className="field compact apiKeyField">
              <span>{provider === "openai" ? "OpenAI API Key" : "Gemini API Key"}</span>
              <div className="secretInput">
                <KeyRound size={18} />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={
                    provider === "openai"
                      ? "sk-... 또는 환경변수 사용"
                      : "AIza... 또는 환경변수 사용"
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
          </div>

          <div className="secretNotice">
            <ShieldCheck size={18} />
            <span>입력한 API key는 분석 요청 1회에만 사용되며 DB에 저장하지 않습니다. 비워두면 서버 환경변수 또는 휴리스틱 fallback을 사용합니다.</span>
          </div>

          <div className="checksRow">
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
            <button className="ghostButton" onClick={() => void loadAnalysis(active.id)}>
              <RefreshCw size={16} />
              새로고침
            </button>
          ) : null}
        </div>

        <div className="metricGrid">
          <Metric icon={<AlertTriangle />} label="총 불일치" value={active?.totals.total ?? 0} tone="red" />
          <Metric icon={<Sparkles />} label="기능 누락" value={active?.totals.missingFeature ?? 0} tone="orange" />
          <Metric icon={<Code2 />} label="API 불일치" value={active?.totals.apiMismatch ?? 0} tone="purple" />
          <Metric icon={<FileText />} label="Outdated 문서" value={active?.totals.outdatedDoc ?? 0} tone="blue" />
          <Metric icon={<Flag />} label="High" value={active?.totals.high ?? 0} tone="red" />
          <Metric icon={<Flag />} label="Medium" value={active?.totals.medium ?? 0} tone="orange" />
          <Metric icon={<Flag />} label="Low" value={active?.totals.low ?? 0} tone="green" />
        </div>

        <div className="resultLayout">
          <div className="findings">
            {active?.status === "failed" ? (
              <div className="emptyState danger">
                <AlertTriangle size={26} />
                <strong>분석 실패</strong>
                <span>{active.error}</span>
              </div>
            ) : active?.findings?.length ? (
              active.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)
            ) : (
              <div className="emptyState">
                <SearchCheck size={28} />
                <strong>표시할 finding이 없습니다</strong>
                <span>분석 완료 후 높은 신뢰도의 불일치가 없으면 빈 리포트가 유지됩니다.</span>
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
            <p>익명 세션 기준으로 최근 20개 분석이 보관됩니다.</p>
          </div>
          <History size={24} />
        </div>
        <div className="historyList">
          {history.map((item) => (
            <button
              className={`historyItem ${active?.id === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => void loadAnalysis(item.id)}
            >
              <span>
                <strong>{item.repoOwner && item.repoName ? `${item.repoOwner}/${item.repoName}` : item.repoUrl}</strong>
                <small>
                  {item.provider.toUpperCase()} · {new Date(item.createdAt).toLocaleString("ko-KR")}
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

function FindingCard({ finding }: { finding: AnalysisDetail["findings"][number] }) {
  const [open, setOpen] = useState(true);
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
          <Evidence
            icon={<FolderGit2 />}
            label="관련 파일"
            text={finding.relatedFiles.length ? finding.relatedFiles.join(", ") : "관련 파일 특정 어려움"}
          />
          <Evidence icon={<Sparkles />} label="권장 조치" text={finding.recommendation} />
          <div className="confidence">confidence {Math.round(finding.confidence * 100)}%</div>
        </div>
      ) : null}
    </article>
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

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}
