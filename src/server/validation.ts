import { z } from "zod";
import type { AnalysisOptions, ComparisonBasis } from "./types";

export const providerSchema = z.enum(["openai", "gemini"]);

export const comparisonBasisSchema = z.enum(["document_latest", "code_latest", "unknown"]);

const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = {
  missingFeature: true,
  apiMismatch: true,
  outdatedDoc: true,
};

export const analysisOptionsSchema = z.object({
  missingFeature: z.boolean().default(true),
  apiMismatch: z.boolean().default(true),
  outdatedDoc: z.boolean().default(true),
});

export const createAnalysisSchema = z.object({
  repoUrl: z.string().url().max(500),
  provider: providerSchema,
  comparisonBasis: comparisonBasisSchema.default("unknown"),
  options: analysisOptionsSchema.default(DEFAULT_ANALYSIS_OPTIONS),
});

export function normalizeOptionsForBasis(
  comparisonBasis: ComparisonBasis,
): AnalysisOptions {
  if (comparisonBasis === "code_latest") {
    return {
      missingFeature: false,
      apiMismatch: false,
      outdatedDoc: true,
    };
  }

  if (comparisonBasis === "document_latest") {
    return {
      missingFeature: true,
      apiMismatch: true,
      outdatedDoc: false,
    };
  }

  return {
    missingFeature: true,
    apiMismatch: true,
    outdatedDoc: true,
  };
}
