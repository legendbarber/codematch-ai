import { z } from "zod";

export const providerSchema = z.enum(["openai", "gemini"]);

export const analysisOptionsSchema = z.object({
  missingFeature: z.boolean().default(true),
  apiMismatch: z.boolean().default(true),
  outdatedDoc: z.boolean().default(true),
});

export const createAnalysisSchema = z.object({
  repoUrl: z.string().url().max(500),
  provider: providerSchema,
  options: analysisOptionsSchema,
});
