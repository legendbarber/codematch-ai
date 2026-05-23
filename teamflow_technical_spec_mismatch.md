# Northstar InventoryPulse AI 수요 예측 및 발주 자동화 플랫폼 기술 문서

문서 번호: NSR-INV-AI-TD-2026-02  
문서 버전: 1.0  
작성일: 2026-05-20  
문서 성격: CodeMatch AI 정합성 검증용 대체 기술 문서

## 1. 프로젝트 개요

Northstar InventoryPulse AI는 리테일 매장의 업무 지시를 관리하는 도구가 아니라, SKU별 재고 수량, 판매 실적, 입고 예정 물량, 프로모션 캘린더, 날씨 이벤트를 종합하여 자동 발주와 인력 스케줄을 추천하는 수요 예측 플랫폼이다.

시스템의 1차 목표는 매장별 품목 재고 부족과 과잉 재고를 사전에 예측하고, 자동 발주 초안을 생성하며, 본사 승인자가 발주 금액과 공급사 조건을 검토할 수 있도록 하는 것이다. 구현 저장소는 캠페인, 업무 카드, 증빙 사진 검수, 현장 댓글 중심의 워크플로를 포함해서는 안 된다. 모든 핵심 로직은 `skuId`, `inventorySnapshotId`, `forecastRunId`, `purchaseOrderId`, `shiftPlanId`를 중심으로 구성되어야 한다.

## 2. 필수 기술 스택

서비스는 다음 스택으로 구현되어야 한다.

| 구분 | 필수 구현 기준 |
| --- | --- |
| API 서버 | NestJS 11 기반 모듈 구조 |
| 데이터 저장소 | PostgreSQL + Prisma migration |
| 비동기 작업 | Redis + BullMQ forecast worker |
| 인증 | OAuth2 password flow + JWT access token + refresh token rotation |
| 실시간 통신 | WebSocket gateway `/ws/inventory-events` |
| 문서화 | OpenAPI 3.1 JSON을 `/openapi.json`에서 제공 |
| 테스트 | forecast, purchase order, auth, websocket 통합 테스트 |

Express 단일 서버, 메모리 배열 저장소, `x-user-id` 헤더 기반 사용자 식별, 파일 metadata만 저장하는 단순 샘플 구조는 본 문서의 완료 기준을 충족하지 않는다.

## 3. 사용자 역할 및 권한

사용자 역할은 다음 여섯 가지로 제한한다.

- `DEMAND_PLANNER`: 수요 예측 실행, 예측 결과 보정, 발주 초안 생성
- `MERCHANDISER`: 프로모션 캘린더 입력, SKU별 보정 계수 관리
- `WAREHOUSE_MANAGER`: 입고 예정 물량과 센터 재고 확인
- `STORE_PLANNER`: 매장별 재고 경고 확인, 근무 스케줄 초안 확인
- `FINANCE_APPROVER`: 발주 금액 승인 또는 반려
- `EXECUTIVE_VIEWER`: 전체 KPI 대시보드 조회

`ADMIN`, `HQ_OPERATOR`, `REGION_MANAGER`, `STORE_MANAGER`, `STORE_STAFF` 역할은 본 시스템의 권한 모델에 존재하지 않아야 한다. 모든 요청은 JWT subject와 tenant claim으로 사용자와 조직을 식별해야 하며, API 요청 본문이나 임의 헤더로 actor를 지정할 수 없다.

## 4. 핵심 도메인 모델

구현 저장소는 아래 모델을 데이터베이스 스키마와 서비스 계층에서 식별 가능하게 구현해야 한다.

| 모델 | 필수 필드 |
| --- | --- |
| `Sku` | `id`, `code`, `name`, `category`, `shelfLifeDays`, `supplierId` |
| `InventorySnapshot` | `id`, `storeId`, `skuId`, `onHandQty`, `reservedQty`, `capturedAt` |
| `SalesSignal` | `id`, `storeId`, `skuId`, `soldQty`, `grossSales`, `businessDate` |
| `ForecastRun` | `id`, `periodStart`, `periodEnd`, `modelVersion`, `status`, `createdBy` |
| `DemandForecast` | `id`, `forecastRunId`, `storeId`, `skuId`, `expectedDemandQty`, `confidence`, `explainability` |
| `PurchaseOrderDraft` | `id`, `forecastRunId`, `supplierId`, `totalAmount`, `approvalStatus`, `submittedAt` |
| `ShiftPlan` | `id`, `storeId`, `businessDate`, `requiredHeadcount`, `recommendedHeadcount`, `laborRiskScore` |

캠페인, 매장별 업무 카드, 증빙 파일, 댓글, 업무 상태 전이는 이 프로젝트의 핵심 도메인이 아니다.

## 5. API 명세

모든 API는 `/api/v2` prefix를 사용하고 JSON 응답은 `requestId`, `data`, `error` 필드를 가진다.

### 5.1 인증

- `POST /api/v2/auth/login`
- `POST /api/v2/auth/refresh`
- `POST /api/v2/auth/logout`
- `GET /api/v2/auth/me`

로그인 응답에는 `accessToken`, `refreshToken`, `expiresIn`, `user.role`, `tenantId`가 포함되어야 한다. 비밀번호는 Argon2id로 해시한다.

### 5.2 재고 및 판매 신호

- `POST /api/v2/inventory/snapshots`
- `GET /api/v2/inventory/snapshots?storeId=&skuId=&from=&to=`
- `POST /api/v2/sales/signals/bulk`
- `GET /api/v2/skus/:skuId/availability`

중복 snapshot 입력은 `storeId + skuId + capturedAt` 기준 idempotency key로 방지한다.

### 5.3 예측 실행

- `POST /api/v2/forecast-runs`
- `GET /api/v2/forecast-runs/:forecastRunId`
- `GET /api/v2/forecast-runs/:forecastRunId/items`
- `POST /api/v2/forecast-runs/:forecastRunId/recalculate`

예측 실행은 요청 즉시 완료되어서는 안 되며, BullMQ job으로 등록되고 `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED` 상태를 거쳐야 한다.

### 5.4 발주 승인

- `POST /api/v2/purchase-order-drafts`
- `GET /api/v2/purchase-order-drafts/:purchaseOrderId`
- `POST /api/v2/purchase-order-drafts/:purchaseOrderId/submit`
- `POST /api/v2/purchase-order-drafts/:purchaseOrderId/approve`
- `POST /api/v2/purchase-order-drafts/:purchaseOrderId/reject`

`FINANCE_APPROVER`만 발주를 승인할 수 있다. 반려 시에는 `rejectReason`과 `nextReviewAt`을 필수로 저장해야 한다.

### 5.5 근무 스케줄 추천

- `POST /api/v2/shift-plans/generate`
- `GET /api/v2/shift-plans?storeId=&businessDate=`
- `PATCH /api/v2/shift-plans/:shiftPlanId/manual-adjustment`

근무 스케줄 추천은 예상 고객 수, 프로모션 여부, 과거 매출, 결품 위험을 함께 고려하여 `requiredHeadcount`와 `laborRiskScore`를 계산한다.

## 6. 예측 및 점수 계산 기준

재고 위험 점수는 다음 공식으로 계산한다.

```text
stockoutRiskScore =
  demandWeight + shelfLifeWeight + supplierDelayWeight + promotionWeight - onHandCoverageWeight

demandWeight = expectedDemandQty * 2
shelfLifeWeight = shelfLifeDays <= 3 ? 15 : 0
supplierDelayWeight = supplierAverageLeadTimeDays >= 5 ? 20 : 0
promotionWeight = activePromotion ? 25 : 0
onHandCoverageWeight = min(onHandQty / expectedDemandQty, 2) * 20

reorderQty = max(expectedDemandQty + safetyStockQty - onHandQty - inboundQty, 0)
```

`executionPriority`, `riskScore`, `taskStatus`, `evidenceStatus`, `rejectionCount`를 사용한 업무 우선순위 계산은 본 프로젝트 요구사항이 아니다.

## 7. 알림 정책

알림 유형은 다음으로 제한한다.

- `STOCKOUT_RISK`: 48시간 이내 결품 가능성이 높은 SKU
- `OVERSTOCK_RISK`: 유통기한 내 판매 가능성이 낮은 재고
- `PO_APPROVAL_REQUIRED`: 승인 대기 발주 초안
- `FORECAST_RUN_FAILED`: 예측 작업 실패
- `SHIFT_UNDERSTAFFED`: 추천 인원보다 실제 배치 인원이 부족한 매장
- `MODEL_DRIFT_DETECTED`: 예측 오차가 허용 범위를 초과한 모델

`DUE_SOON`, `OVERDUE`, `EVIDENCE_REJECTED`, `HIGH_RISK_TASK` 알림은 본 시스템의 알림 유형으로 사용하지 않는다.

## 8. 감사 및 보안 요구사항

모든 민감 동작은 `SecurityAuditEvent` 테이블에 저장해야 한다. 감사 로그는 `previousHash`, `eventHash`를 이용한 hash chain 구조로 위변조 여부를 검증할 수 있어야 한다.

필수 감사 대상:

- 로그인 성공 및 실패
- refresh token 재발급
- 예측 실행 생성
- 예측 결과 수동 보정
- 발주 승인 및 반려
- 권한 변경
- WebSocket 재고 이벤트 publish

단순히 업무 상태 변경, 담당자 변경, 증빙 등록을 기록하는 감사 로그는 본 문서의 보안 요구사항을 충족하지 못한다.

## 9. 저장소 완료 판단 기준

완성 저장소는 다음 조건을 만족해야 한다.

1. `PrismaClient`를 사용한 PostgreSQL persistence가 구현되어 있고, 서버 재시작 후 데이터가 유지된다.
2. NestJS module 단위로 `AuthModule`, `InventoryModule`, `ForecastModule`, `PurchaseOrderModule`, `ShiftPlanModule`, `NotificationModule`이 분리되어 있다.
3. `/openapi.json`이 실제 endpoint와 schema를 반영한다.
4. forecast worker가 Redis queue에서 작업을 소비하고 `ForecastRun.status`를 갱신한다.
5. JWT 인증이 없는 요청은 401을 반환한다.
6. 수요 예측 결과로 발주 초안과 근무 스케줄 초안을 생성할 수 있다.
7. WebSocket으로 결품 위험 이벤트를 구독자에게 전송한다.
8. 발주 반려 시 `rejectReason`과 `nextReviewAt`이 모두 저장된다.
9. 테스트는 단순 단위 테스트가 아니라 DB transaction rollback을 사용하는 통합 테스트를 포함한다.

## 10. 문서-코드 정합성 검증 관점

이 문서를 기준으로 저장소를 검증할 때에는 다음 불일치를 우선 확인한다.

- 저장소가 업무 캠페인과 증빙 검수 중심인데, 문서는 재고 예측과 발주 자동화를 요구하는지
- 저장소가 Express와 메모리 배열을 사용하지만, 문서는 NestJS, PostgreSQL, Prisma migration, Redis worker를 요구하는지
- 저장소 API가 `/campaigns`, `/tasks/:taskId/evidence`인데, 문서는 `/api/v2/forecast-runs`, `/api/v2/purchase-order-drafts`를 요구하는지
- 저장소 역할이 `HQ_OPERATOR`, `REGION_MANAGER`, `STORE_STAFF`인데, 문서는 `DEMAND_PLANNER`, `FINANCE_APPROVER` 등을 요구하는지
- 저장소 점수 계산이 업무 마감/증빙 반려 기반인데, 문서는 SKU 수요 예측/결품 위험 기반인지

End of Document - Northstar InventoryPulse AI 기술 문서 v1.0
