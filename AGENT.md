# Agent Context

이 문서는 에이전트가 프로젝트를 이해하고 작업을 이어가기 위한 메인 컨텍스트 파일이다.

에이전트는 작업 전 이 문서를 읽고, 의미 있는 작업 후 관련 문서를 갱신해야 한다.

## Documents

### `agent-docs/project-overview.md`
프로젝트가 무엇인지, 왜 존재하는지, 핵심 도메인이 무엇인지 설명한다.

### `agent-docs/current-status.md`
현재까지 완료된 작업, 진행 중인 작업, 다음 작업, 막힌 문제를 기록한다.

### `agent-docs/project-structure.md`
현재 폴더 구조, 주요 파일, 모듈의 역할을 설명한다.

### `agent-docs/goals-and-scope.md`
프로젝트 목표, 범위, 하지 않을 일을 기록한다.

### `agent-docs/decisions.md`
중요한 설계 결정, 정책 결정, 그 이유를 기록한다.

### `agent-docs/work-log.md`
에이전트가 수행한 의미 있는 작업을 시간순으로 기록한다.

### `agent-docs/open-questions.md`
아직 결정되지 않은 질문, 확인이 필요한 사항을 기록한다.

### `agent-docs/policies.md`
에이전트가 따라야 할 작업 규칙, 코딩 규칙, 문서화 규칙을 기록한다.

### `agent-docs/glossary.md`
프로젝트에서 사용하는 용어를 정리한다.

## Agent Rules

- 작업 시작 전 `AGENT.md`와 필요한 하위 문서를 읽는다.
- 작업 후 의미 있는 변경 사항을 관련 문서에 갱신한다.
- `AGENT.md`는 인덱스와 요약만 유지하고, 자세한 내용은 하위 문서에 기록한다.
- 상태 변경은 `agent-docs/current-status.md`, 작업 기록은 `agent-docs/work-log.md`에 남긴다.
- 구조 변경은 `agent-docs/project-structure.md`, 목표/범위 변경은 `agent-docs/goals-and-scope.md`에 기록한다.
- 중요한 설계/정책 결정은 `agent-docs/decisions.md`에 이유와 함께 기록한다.
- 불확실하거나 확인이 필요한 내용은 `agent-docs/open-questions.md`에 기록한다.
- 사소한 내부 행동은 기록하지 않고, 문서는 간결하고 사실 기반으로 유지한다.
- 문서를 갱신할 때는 기존 내용을 먼저 수정하고, 필요할 때만 새 항목을 추가한다.
- 오래되었거나 현재와 맞지 않는 내용은 남겨두지 말고 수정하거나 제거한다.