import { promises as fs } from "node:fs";
import path from "node:path";
import type { ComparisonBasis, FindingType } from "../types";

export type LoadedDetectionDoc = {
  type: FindingType;
  relativePath: string;
  content: string;
};

const detectionDocPaths: Record<FindingType, string> = {
  missing_feature: "multi-agent-docs/detection-types/missing-feature.md",
  api_mismatch: "multi-agent-docs/detection-types/api-mismatch.md",
  outdated_doc: "multi-agent-docs/detection-types/outdated-doc.md",
};

export async function loadRequiredDetectionDocs(input: {
  comparisonBasis: ComparisonBasis;
}): Promise<LoadedDetectionDoc[]> {
  const types = detectionTypesForBasis(input.comparisonBasis);
  return Promise.all(
    types.map(async (type) => {
      const relativePath = detectionDocPaths[type];
      const absolutePath = path.join(process.cwd(), relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      return { type, relativePath, content };
    }),
  );
}

function detectionTypesForBasis(comparisonBasis: ComparisonBasis): FindingType[] {
  if (comparisonBasis === "document_latest") return ["missing_feature", "api_mismatch"];
  if (comparisonBasis === "code_latest") return ["outdated_doc"];
  return ["missing_feature", "api_mismatch", "outdated_doc"];
}
