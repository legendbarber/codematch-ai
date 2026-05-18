import { z } from "zod";
import type { AnalysisOptions, AnalysisReport, FindingType } from "../types";

export const reportFindingSchema = z.object({
  type: z.enum(["missing_feature", "api_mismatch", "outdated_doc"]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(2).max(140),
  documentEvidence: z.string().min(1).max(1200),
  codeEvidence: z.string().min(1).max(1200),
  relatedFiles: z.array(z.string().min(1)).max(8),
  recommendation: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
});

export const analysisReportSchema = z.object({
  summary: z.string().min(1).max(1600),
  findings: z.array(reportFindingSchema).max(12),
});

export const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "severity",
          "title",
          "documentEvidence",
          "codeEvidence",
          "relatedFiles",
          "recommendation",
          "confidence",
        ],
        properties: {
          type: {
            type: "string",
            enum: ["missing_feature", "api_mismatch", "outdated_doc"],
          },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          title: { type: "string" },
          documentEvidence: { type: "string" },
          codeEvidence: { type: "string" },
          relatedFiles: {
            type: "array",
            items: { type: "string" },
          },
          recommendation: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export function parseReport(payload: unknown): AnalysisReport {
  return analysisReportSchema.parse(payload);
}

export function filterReportByOptions(
  report: AnalysisReport,
  options: AnalysisOptions,
): AnalysisReport {
  const allowed = new Set<FindingType>();
  if (options.missingFeature) allowed.add("missing_feature");
  if (options.apiMismatch) allowed.add("api_mismatch");
  if (options.outdatedDoc) allowed.add("outdated_doc");

  return {
    ...report,
    findings: report.findings.filter((finding) => allowed.has(finding.type)),
  };
}
