import { describe, expect, it } from "vitest";
import { EXAMPLE_ANALYSIS_ID, getExampleAnalysis } from "@/server/example-analysis";

describe("bundled example analysis", () => {
  it("keeps totals aligned with bundled findings", () => {
    const analysis = getExampleAnalysis(EXAMPLE_ANALYSIS_ID);

    expect(analysis).not.toBeNull();
    if (!analysis) return;

    expect(analysis.totals.total).toBe(analysis.findings.length);
    expect(analysis.totals.missingFeature).toBe(
      analysis.findings.filter((finding) => finding.type === "missing_feature").length,
    );
    expect(analysis.totals.apiMismatch).toBe(
      analysis.findings.filter((finding) => finding.type === "api_mismatch").length,
    );
    expect(analysis.totals.outdatedDoc).toBe(
      analysis.findings.filter((finding) => finding.type === "outdated_doc").length,
    );
    expect(analysis.totals.high).toBe(analysis.findings.filter((finding) => finding.severity === "high").length);
    expect(analysis.totals.low).toBe(analysis.findings.filter((finding) => finding.severity === "low").length);
  });
});
