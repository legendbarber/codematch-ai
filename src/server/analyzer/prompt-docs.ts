import { promises as fs } from "node:fs";
import path from "node:path";

export type PromptStage = "planner" | "analysis" | "report_writer";

export type LoadedPromptDoc = {
  relativePath: string;
  content: string;
};

const promptDocsByStage: Record<PromptStage, string[]> = {
  planner: [
    "multi-agent-docs/agents/analysis-planner-agent.md",
    "multi-agent-docs/multi-agent-workflow.md",
    "multi-agent-docs/output-contracts.md",
  ],
  analysis: [
    "multi-agent-docs/agents/analysis-agent.md",
    "multi-agent-docs/hallucination-mitigation.md",
    "multi-agent-docs/output-contracts.md",
  ],
  report_writer: [
    "multi-agent-docs/agents/report-writer-agent.md",
    "multi-agent-docs/hallucination-mitigation.md",
    "multi-agent-docs/output-contracts.md",
    "multi-agent-docs/multi-agent-workflow.md",
  ],
};

export async function loadPromptDocsForStage(stage: PromptStage): Promise<LoadedPromptDoc[]> {
  return Promise.all(
    promptDocsByStage[stage].map(async (relativePath) => {
      const absolutePath = path.join(process.cwd(), relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      return { relativePath, content };
    }),
  );
}
