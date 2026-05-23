# TeamFlow RetailOps Test Fixtures

This directory contains sample inputs for validating CodeMatch AI behavior.

## Fixture Layout

- `docs/teamflow_technical_spec.md`
  - Matching technical specification for the TeamFlow RetailOps sample.
- `docs/teamflow_technical_spec.pdf`
  - PDF version of the matching technical specification.
- `docs/teamflow_technical_spec_mismatch.md`
  - Intentionally mismatched technical specification for negative testing.
- `docs/teamflow_technical_spec_mismatch.pdf`
  - PDF version of the mismatched technical specification.
- `repos/implemented`
  - Code sample that is intended to match the TeamFlow RetailOps technical specification.
- `repos/incomplete`
  - Code sample with intentionally missing or mismatched features.

## Intended Test Scenarios

1. Upload `docs/teamflow_technical_spec.pdf` and analyze `repos/implemented`.
   - Expected result: CodeMatch should report high alignment or no major findings.

2. Upload `docs/teamflow_technical_spec.pdf` and analyze `repos/incomplete`.
   - Expected result: CodeMatch should report missing or mismatched implementation details.

3. Upload `docs/teamflow_technical_spec_mismatch.pdf` and analyze `repos/implemented`.
   - Expected result: CodeMatch should report substantial mismatch because the document describes a different product.

## Notes

- `repos/incomplete` is intentionally not a production-ready implementation.
- Generated folders such as `node_modules` and `dist` are excluded from these fixtures.
