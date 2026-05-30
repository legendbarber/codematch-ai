import { promises as fs } from "node:fs";
import path from "node:path";
import type { AnalysisOptions, AnalysisPlan, ComparisonBasis, FindingType } from "../types";

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
  analysisPlan?: AnalysisPlan;
  comparisonBasis: ComparisonBasis;
  options?: AnalysisOptions;
}): Promise<LoadedDetectionDoc[]> {
  const types = selectRequiredDetectionTypes(input);
  return Promise.all(
    types.map(async (type) => {
      const relativePath = detectionDocPaths[type];
      const absolutePath = path.join(process.cwd(), relativePath);
      const content = await fs.readFile(absolutePath, "utf8");
      return { type, relativePath, content };
    }),
  );
}

function selectRequiredDetectionTypes(input: {
  analysisPlan?: AnalysisPlan;
  comparisonBasis: ComparisonBasis;
  options?: AnalysisOptions;
}) {
  const selected = input.options
    ? detectionTypesForOptions(input.comparisonBasis, input.options)
    : detectionTypesFromPlan(input.analysisPlan);
  const fallback = selected.length > 0 ? selected : detectionTypesForBasis(input.comparisonBasis);
  return unique(fallback.filter((type) => detectionTypeAllowedForBasis(type, input.comparisonBasis)));
}

function detectionTypesForOptions(comparisonBasis: ComparisonBasis, options: AnalysisOptions): FindingType[] {
  if (comparisonBasis === "document_latest") {
    return [
      ...(options.missingFeature ? ["missing_feature" as const] : []),
      ...(options.apiMismatch ? ["api_mismatch" as const] : []),
    ];
  }
  if (comparisonBasis === "code_latest") {
    return options.outdatedDoc ? ["outdated_doc"] : [];
  }
  return [
    ...(options.missingFeature ? ["missing_feature" as const] : []),
    ...(options.apiMismatch ? ["api_mismatch" as const] : []),
    ...(options.outdatedDoc ? ["outdated_doc" as const] : []),
  ];
}

function detectionTypesFromPlan(analysisPlan?: AnalysisPlan): FindingType[] {
  if (!analysisPlan) return [];
  return unique([
    ...analysisPlan.targetAreas.flatMap((area) => area.detectionTypes),
    ...analysisPlan.requiredDetectionDocs.flatMap(detectionTypeFromDocPath),
  ]);
}

function detectionTypeFromDocPath(value: string): FindingType[] {
  return (Object.entries(detectionDocPaths) as Array<[FindingType, string]>)
    .filter(([, relativePath]) => value.endsWith(relativePath.replace(/^multi-agent-docs\//, "")) || value.endsWith(relativePath))
    .map(([type]) => type);
}

function detectionTypesForBasis(comparisonBasis: ComparisonBasis): FindingType[] {
  if (comparisonBasis === "document_latest") return ["missing_feature", "api_mismatch"];
  if (comparisonBasis === "code_latest") return ["outdated_doc"];
  return ["missing_feature", "api_mismatch", "outdated_doc"];
}

function detectionTypeAllowedForBasis(type: FindingType, comparisonBasis: ComparisonBasis) {
  if (comparisonBasis === "document_latest") return type === "missing_feature" || type === "api_mismatch";
  if (comparisonBasis === "code_latest") return type === "outdated_doc";
  return true;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
