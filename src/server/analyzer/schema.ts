import { z } from "zod";
import type { AnalysisOptions, AnalysisPlan, AnalysisReport, ComparisonBasis, DocumentationDraft, FindingType } from "../types";

const codeLocationSchema = z.object({
  path: z.string().min(1).max(400),
  symbolName: z.string().min(1).max(200).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  endpoint: z
    .object({
      method: z.string().min(1).max(12),
      path: z.string().min(1).max(300),
    })
    .optional(),
});

const documentLocationSchema = z.object({
  documentName: z.string().min(1).max(300),
  pageNumber: z.number().int().positive().optional(),
  matchedText: z.string().min(1).max(1200).optional(),
  boundingBoxes: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
    )
    .max(20)
    .optional(),
});

export const reportFindingSchema = z.object({
  type: z.enum(["missing_feature", "api_mismatch", "outdated_doc"]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string().min(2).max(140),
  documentEvidence: z.string().min(1).max(1200),
  codeEvidence: z.string().min(1).max(1200),
  relatedFiles: z.array(z.string().min(1)).max(8),
  documentLocation: documentLocationSchema.optional(),
  codeLocations: z.array(codeLocationSchema).max(8).optional(),
  recommendation: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
});

export const documentationDraftSchema = z.object({
  suggestedSection: z.string().min(1).max(200),
  suggestedTitle: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  supportingCodeLocations: z.array(codeLocationSchema).max(8),
  reviewNotes: z.array(z.string().min(1).max(500)).max(8).optional(),
});

export const analysisReportSchema = z.object({
  summary: z.string().min(1).max(1600),
  findings: z.array(reportFindingSchema).max(12),
});

export const analysisPlanSchema = z.object({
  summary: z.string().min(1).max(1200),
  targetAreas: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        priority: z.enum(["high", "medium", "low"]),
        documentRequirement: z.string().min(1).max(800),
        candidatePaths: z.array(z.string().min(1).max(400)).max(12),
        detectionTypes: z.array(z.enum(["missing_feature", "api_mismatch", "outdated_doc"])).max(3),
        reason: z.string().min(1).max(800),
        uncertainty: z.string().min(1).max(800),
      }),
    )
    .min(1)
    .max(12),
  requiredDetectionDocs: z.array(z.string().min(1).max(200)).max(3),
  analysisNotes: z.array(z.string().min(1).max(600)).max(8),
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
          documentLocation: {
            type: "object",
            additionalProperties: false,
            properties: {
              documentName: { type: "string" },
              pageNumber: { type: "number" },
              matchedText: { type: "string" },
              boundingBoxes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["x", "y", "width", "height"],
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                    width: { type: "number" },
                    height: { type: "number" },
                  },
                },
              },
            },
          },
          codeLocations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path"],
              properties: {
                path: { type: "string" },
                symbolName: { type: "string" },
                startLine: { type: "number" },
                endLine: { type: "number" },
                endpoint: {
                  type: "object",
                  additionalProperties: false,
                  required: ["method", "path"],
                  properties: {
                    method: { type: "string" },
                    path: { type: "string" },
                  },
                },
              },
            },
          },
          recommendation: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export const analysisPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "targetAreas", "requiredDetectionDocs", "analysisNotes"],
  properties: {
    summary: { type: "string" },
    targetAreas: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "priority",
          "documentRequirement",
          "candidatePaths",
          "detectionTypes",
          "reason",
          "uncertainty",
        ],
        properties: {
          id: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          documentRequirement: { type: "string" },
          candidatePaths: {
            type: "array",
            maxItems: 12,
            items: { type: "string" },
          },
          detectionTypes: {
            type: "array",
            maxItems: 3,
            items: {
              type: "string",
              enum: ["missing_feature", "api_mismatch", "outdated_doc"],
            },
          },
          reason: { type: "string" },
          uncertainty: { type: "string" },
        },
      },
    },
    requiredDetectionDocs: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
    analysisNotes: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
  },
} as const;

export function parseAnalysisPlan(payload: unknown): AnalysisPlan {
  return analysisPlanSchema.parse(payload);
}

export function parseReport(payload: unknown): AnalysisReport {
  return analysisReportSchema.parse(payload);
}

export function parseDocumentationDraft(payload: unknown): DocumentationDraft {
  return documentationDraftSchema.parse(payload);
}

export function filterReportByOptions(
  report: AnalysisReport,
  options: AnalysisOptions,
  comparisonBasis: ComparisonBasis = "unknown",
): AnalysisReport {
  if (comparisonBasis === "code_latest") {
    return {
      ...report,
      findings: report.findings.filter((finding) => finding.type === "outdated_doc"),
    };
  }

  const allowed = new Set<FindingType>();
  if (options.missingFeature) allowed.add("missing_feature");
  if (options.apiMismatch) allowed.add("api_mismatch");
  if (options.outdatedDoc) allowed.add("outdated_doc");

  return {
    ...report,
    findings: report.findings.filter((finding) => allowed.has(finding.type)),
  };
}
