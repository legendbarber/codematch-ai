# 출력 계약

이 문서는 멀티 에이전트 구현 시 단계별 출력 구조를 정의한다. 현재 코드의 `FindingType`, `Severity`, `ComparisonBasis`, `ReportFinding`과 호환되도록 이름을 유지한다.

## 공통 enum

```json
{
  "comparisonBasis": ["document_latest", "code_latest", "unknown"],
  "findingType": ["missing_feature", "api_mismatch", "outdated_doc"],
  "severity": ["high", "medium", "low"],
  "mergeStatus": ["consensus", "needs_review", "disagreement", "excluded"]
}
```

## 분석 계획 출력

```json
{
  "summary": "분석 계획 요약",
  "targetAreas": [
    {
      "id": "area-1",
      "priority": "high",
      "documentRequirement": "문서 요구사항 요약",
      "candidatePaths": ["src/app/api/**", "src/server/**"],
      "detectionTypes": ["missing_feature", "api_mismatch"],
      "reason": "해당 경로를 분석해야 하는 이유",
      "uncertainty": "구조만 보고 판단한 한계"
    }
  ],
  "requiredDetectionDocs": [
    "detection-types/missing-feature.md",
    "detection-types/api-mismatch.md"
  ],
  "analysisNotes": ["분석 에이전트에게 전달할 주의사항"]
}
```

## 분석 에이전트 출력

```json
{
  "agentId": "analysis-agent-a",
  "provider": "openai",
  "summary": "분석 결과 요약",
  "findings": [
    {
      "type": "missing_feature",
      "severity": "high",
      "title": "사용자에게 표시할 짧은 제목",
      "documentEvidence": "문서 근거 요약",
      "codeEvidence": "코드 근거 또는 구현 근거 부재 표현",
      "relatedFiles": ["src/server/example.ts"],
      "documentLocation": {
        "documentName": "technical-spec.pdf",
        "pageNumber": 3,
        "matchedText": "근거 문장"
      },
      "codeLocations": [
        {
          "path": "src/app/api/example/route.ts",
          "symbolName": "GET",
          "startLine": 10,
          "endLine": 45,
          "endpoint": {
            "method": "GET",
            "path": "/api/example"
          }
        }
      ],
      "recommendation": "사용자가 취해야 할 조치",
      "confidence": 0.82,
      "limitations": ["분석 범위 제한 또는 불확실성"]
    }
  ],
  "reviewNotes": ["finding으로 확정하지 않은 관찰"]
}
```

`limitations`와 `reviewNotes`는 멀티 에이전트 내부 계약이다. 현재 DB 저장용 `ReportFinding`에는 포함하지 않으며, 구현 시 저장 여부를 별도로 결정한다.

## 최종 리포트 출력

```json
{
  "summary": "사용자용 최종 요약",
  "findings": [
    {
      "type": "outdated_doc",
      "severity": "medium",
      "title": "문서에 반영되지 않은 구현 기능",
      "documentEvidence": "문서에서 확인된 누락 또는 오래된 설명",
      "codeEvidence": "구현 근거",
      "relatedFiles": ["src/server/example.ts"],
      "documentLocation": {
        "documentName": "technical-spec.md",
        "matchedText": "관련 문서 문구"
      },
      "codeLocations": [
        {
          "path": "src/server/example.ts",
          "symbolName": "generateExample",
          "startLine": 20,
          "endLine": 80
        }
      ],
      "recommendation": "문서에 새 section을 추가한다.",
      "confidence": 0.74,
      "mergeStatus": "consensus",
      "supportingAgents": ["analysis-agent-a", "analysis-agent-b"]
    }
  ],
  "needsReview": [],
  "disagreements": [],
  "analysisScope": {
    "collectedCodeFileCount": 0,
    "codeChunkCount": 0,
    "documentChunkCount": 0,
    "warnings": []
  }
}
```

`mergeStatus`와 `supportingAgents`는 최종 리포트 내부 품질 표시용 필드다. 기존 UI/DB에 바로 저장하려면 현재 `ReportFinding` 필드만 저장하고, 병합 상태는 별도 JSON 또는 summary에 포함하는 방식으로 확장한다.
