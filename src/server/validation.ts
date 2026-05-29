import { z } from "zod";
import type { AnalysisOptions, ComparisonBasis } from "./types";

export const providerSchema = z.enum(["openai", "gemini"]);

export const comparisonBasisSchema = z.enum(["document_latest", "code_latest", "unknown"]);

export const analysisOptionsSchema = z.object({
  missingFeature: z.boolean().default(true),
  apiMismatch: z.boolean().default(true),
  outdatedDoc: z.boolean().default(true),
});

export const createAnalysisSchema = z.object({
  repoUrl: z.string().url().max(500),
  provider: providerSchema,
  comparisonBasis: comparisonBasisSchema.default("unknown"),
  options: analysisOptionsSchema,
});

export function normalizeOptionsForBasis(
  comparisonBasis: ComparisonBasis,
  options: AnalysisOptions,
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
      apiMismatch: options.apiMismatch,
      outdatedDoc: false,
    };
  }

  return options;
}
