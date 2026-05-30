# Google Cloud Run Deployment Guide

이 문서는 CodeMatchAA를 Google Cloud에 배포하는 절차를 정리한다. 현재 프로젝트에는 Cloud Run + Supabase Postgres + Secret Manager 조합을 권장한다.

## Recommended Architecture

- Runtime: Google Cloud Run
- Build: Cloud Run source deploy / Cloud Build Buildpacks
- Container image storage: Artifact Registry
- Database: Supabase Postgres
- Secrets: Google Secret Manager
- Region: `asia-northeast3` by default

Cloud Run을 선택한 이유는 Next.js 앱을 컨테이너로 바로 배포할 수 있고, 사용량이 없을 때 `min-instances=0`으로 비용을 줄일 수 있기 때문이다. 이 프로젝트는 분석 API가 응답 후 background 작업을 계속 수행하므로 Cloud Run 배포 시 `--no-cpu-throttling`을 사용한다.

## Prerequisites

필요한 항목:

- Google Cloud project
- Billing enabled project
- Cloud Shell 또는 로컬 `gcloud` CLI
- Supabase Postgres connection strings
- Node.js/npm available in the deploy environment

Cloud Shell을 쓰면 `gcloud`가 이미 설치되어 있다. 로컬 Ubuntu에서 `gcloud: command not found`가 나오면 로컬에 Google Cloud CLI가 없는 것이다. 가장 쉬운 방법은 Google Cloud Console 오른쪽 위 Cloud Shell을 열어서 진행하는 것이다.

## Project Variables

아래 값은 각자 프로젝트에 맞게 바꾼다.

```bash
export PROJECT_ID="codematch-ai-497200"
export PROJECT_NUMBER="612075794804"
export REGION="asia-northeast3"
export SERVICE="codematch-ai"
```

프로젝트 번호를 모르면 다음 명령으로 확인한다.

```bash
gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)"
```

현재 Cloud Shell 프로젝트를 지정한다.

```bash
gcloud config set project "$PROJECT_ID"
```

## Billing

Cloud Run, Cloud Build, Artifact Registry, Secret Manager API를 활성화하려면 프로젝트에 결제 계정이 연결되어 있어야 한다.

확인:

```bash
gcloud billing projects describe "$PROJECT_ID"
```

`billingEnabled: false`이면 Google Cloud Console에서 결제 계정을 프로젝트에 연결한다.

권한 오류 예시:

```text
permission: billing.resourceAssociations.create
reason: IAM_PERMISSION_DENIED
```

이 경우 현재 계정에 결제 계정 연결 권한이 없는 것이다. 결제 계정의 `Billing Account Administrator` 또는 프로젝트/결제 연결에 필요한 권한을 받은 뒤 다시 시도한다.

## Enable APIs

필요한 API를 활성화한다.

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

일부 명령은 `Do you want to continue (Y/n)?`를 물어볼 수 있고, 어떤 경우에는 묻지 않고 바로 성공한다. 프롬프트가 안 떴다고 실패한 것은 아니다.

확인:

```bash
gcloud services list --enabled \
  --filter="name:(run.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com OR secretmanager.googleapis.com)"
```

## Secrets

이 프로젝트는 Prisma datasource에서 다음 환경변수를 사용한다.

- `DATABASE_URL`: Supabase transaction pooler URL
- `DIRECT_URL`: Supabase session pooler 또는 direct URL

Supabase를 쓸 때 권장:

- `DATABASE_URL`: transaction pooler, 일반적으로 port `6543`, `?pgbouncer=true`
- `DIRECT_URL`: session pooler 또는 direct DB URL, Prisma schema sync용

비밀값은 문서나 Git에 쓰지 않는다. Secret Manager에 저장한다.

```bash
printf '%s' 'YOUR_DATABASE_URL' | gcloud secrets create codematch-database-url \
  --replication-policy=automatic \
  --data-file=-

printf '%s' 'YOUR_DIRECT_URL' | gcloud secrets create codematch-direct-url \
  --replication-policy=automatic \
  --data-file=-
```

이미 secret이 있으면 `create` 대신 새 version을 추가한다.

```bash
printf '%s' 'NEW_DATABASE_URL' | gcloud secrets versions add codematch-database-url \
  --data-file=-

printf '%s' 'NEW_DIRECT_URL' | gcloud secrets versions add codematch-direct-url \
  --data-file=-
```

확인:

```bash
gcloud secrets list
```

선택 사항으로 OpenAI/Gemini API key도 Secret Manager에 저장할 수 있다. 현재 앱은 화면에서 1회용 API key 입력도 지원하므로, 서버 환경변수로 꼭 넣지 않아도 된다.
단, 코드 최신 모드의 문서 추가 초안 생성은 Gemini를 사용하므로 서버 `GEMINI_API_KEY`가 없으면 사용자가 초안 생성 요청 시점에 Gemini key를 다시 입력해야 한다.

```bash
printf '%s' 'YOUR_OPENAI_API_KEY' | gcloud secrets create codematch-openai-api-key \
  --replication-policy=automatic \
  --data-file=-

printf '%s' 'YOUR_GEMINI_API_KEY' | gcloud secrets create codematch-gemini-api-key \
  --replication-policy=automatic \
  --data-file=-
```

## Grant Secret Access To Cloud Run

Cloud Run revision이 Secret Manager 값을 읽으려면 실행 서비스 계정에 `Secret Manager Secret Accessor` 권한이 필요하다.

기본 Compute Engine 서비스 계정을 사용하는 경우:

```bash
export RUN_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

권한 부여:

```bash
gcloud secrets add-iam-policy-binding codematch-database-url \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding codematch-direct-url \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

OpenAI/Gemini secret을 Cloud Run 환경변수로 연결할 경우 해당 secret에도 같은 권한을 준다.

```bash
gcloud secrets add-iam-policy-binding codematch-openai-api-key \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding codematch-gemini-api-key \
  --member="serviceAccount:${RUN_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

권한이 없으면 배포 중 다음 오류가 난다.

```text
Permission denied on secret: ... for Revision service account ...
The service account used must be granted the 'Secret Manager Secret Accessor' role
```

## Install Dependencies And Sync Database

Cloud Shell에서 repository root로 이동한 뒤 dependency를 설치한다.

```bash
npm ci
```

Prisma schema sync 전에 현재 shell에 DB 환경변수를 임시로 export한다.

```bash
export DATABASE_URL="$(gcloud secrets versions access latest --secret=codematch-database-url)"
export DIRECT_URL="$(gcloud secrets versions access latest --secret=codematch-direct-url)"
```

DB schema를 Supabase에 반영한다.

```bash
npx prisma db push
```

주의:

- 위 `export`는 현재 Cloud Shell 세션에서만 유지된다.
- Cloud Run에는 아래 deploy 명령의 `--update-secrets`로 영구 연결한다.
- `npx prisma db push`에서 `Environment variable not found: DIRECT_URL`이 나오면 `DIRECT_URL` export가 빠진 것이다.

## Artifact Storage

하이라이트 PDF artifact는 원본 업로드 문서 내용을 포함한다. 개발 환경의 `ARTIFACT_STORAGE_DRIVER=local`은 `./var/artifacts` 같은 로컬 디렉터리에 파일을 쓰는 방식이며, Cloud Run production 보존 저장소로 사용하면 안 된다.

Cloud Run local filesystem은 revision 재시작, 새 instance 생성, scale-to-zero 이후에 보존을 보장하지 않는다. production에서 하이라이트 PDF 다운로드를 제공하려면 Supabase Storage 또는 Google Cloud Storage 같은 object storage adapter를 별도로 연결해야 한다. 현재 production 기본값은 storage disabled이며, 이 경우 하이라이트 PDF 다운로드는 표시되지 않거나 서버가 명확한 오류를 반환한다.

관련 환경변수:

- `ARTIFACT_STORAGE_DRIVER`: production에서는 기본 `disabled`. 개발에서만 `local` 사용.
- `LOCAL_ARTIFACT_DIR`: local driver의 저장 디렉터리.
- `ARTIFACT_RETENTION_DAYS`: 다운로드 허용 기간. 만료 후 다운로드 API는 `410`을 반환한다.

Cloud Run 배포 시 artifact storage를 disabled로 명시하려면 기본 배포 명령의 env vars에 `ARTIFACT_STORAGE_DRIVER=disabled`를 포함한다.

## Deploy To Cloud Run

기본 배포 명령:

```bash
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=900 \
  --concurrency=10 \
  --min-instances=0 \
  --max-instances=5 \
  --no-cpu-throttling \
  --set-env-vars="NODE_ENV=production,OPENAI_MODEL=gpt-5-mini,GEMINI_MODEL=gemini-2.5-flash,ALLOW_HEURISTIC_FALLBACK=true,ARTIFACT_STORAGE_DRIVER=disabled,ARTIFACT_RETENTION_DAYS=1" \
  --update-secrets="DATABASE_URL=codematch-database-url:latest,DIRECT_URL=codematch-direct-url:latest"
```

처음 `--source .` 배포를 하면 Cloud Run이 Artifact Registry repository 생성을 물어볼 수 있다.

```text
Deploying from source requires an Artifact Registry Docker repository...
Do you want to continue (Y/n)?
```

`Y`를 입력하면 된다.

서버 환경변수로 OpenAI/Gemini API key까지 연결하고 싶으면 secret 권한을 먼저 부여한 뒤 다음처럼 추가한다.

```bash
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=900 \
  --concurrency=10 \
  --min-instances=0 \
  --max-instances=5 \
  --no-cpu-throttling \
  --set-env-vars="NODE_ENV=production,OPENAI_MODEL=gpt-5-mini,GEMINI_MODEL=gemini-2.5-flash,ALLOW_HEURISTIC_FALLBACK=true,ARTIFACT_STORAGE_DRIVER=disabled,ARTIFACT_RETENTION_DAYS=1" \
  --update-secrets="DATABASE_URL=codematch-database-url:latest,DIRECT_URL=codematch-direct-url:latest,OPENAI_API_KEY=codematch-openai-api-key:latest,GEMINI_API_KEY=codematch-gemini-api-key:latest"
```

## Verify Deployment

서비스 URL 확인:

```bash
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format="value(status.url)"
```

상태 확인:

```bash
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format="value(status.conditions)"
```

최근 로그 확인:

```bash
gcloud run services logs read "$SERVICE" \
  --region "$REGION" \
  --limit=100
```

배포가 성공하면 Google Cloud Console/Cloud Shell/브라우저를 닫아도 서비스는 계속 유지된다. 단, `--min-instances=0`이면 요청이 없을 때 인스턴스가 0개로 내려가며, 다음 요청 때 다시 시작되어 첫 요청이 조금 느릴 수 있다.

## Update Existing Deployment

코드를 수정한 뒤 같은 deploy 명령을 다시 실행하면 새 revision이 생성된다.

환경변수만 바꾸고 싶으면:

```bash
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-env-vars="ALLOW_HEURISTIC_FALLBACK=true"
```

secret version을 추가한 뒤 `:latest`를 쓰고 있다면 새 revision 배포 또는 서비스 업데이트 시 최신 version이 반영된다.

## Troubleshooting

### `gcloud: command not found`

로컬 환경에 Google Cloud CLI가 설치되지 않은 것이다. Cloud Shell을 쓰거나 로컬에 Google Cloud CLI를 설치한다.

### `sudo snap install application-default login` 실패

`application-default login`은 설치할 snap 이름이 아니라 `gcloud auth application-default login` 명령의 일부다. Cloud Shell에서는 보통 별도 설치 없이 `gcloud`를 사용한다.

### `Billing account ... is not found`

프로젝트에 결제 계정이 연결되지 않았다. Google Cloud Console의 Billing 화면에서 프로젝트와 결제 계정을 연결한다.

### `SERVICE_DISABLED`

필요 API가 비활성화되어 있다. `gcloud services enable ...` 명령으로 API를 켠다. 방금 켰다면 1분 정도 기다린 뒤 재시도한다.

### `Permission denied on secret`

Cloud Run revision 서비스 계정에 Secret Manager 접근 권한이 없다. `Grant Secret Access To Cloud Run` 섹션의 IAM binding 명령을 실행한다.

### `Environment variable not found: DIRECT_URL`

`npx prisma db push`를 실행하는 Cloud Shell 세션에 `DIRECT_URL`이 없다. Secret Manager에서 읽어와 export한 뒤 다시 실행한다.

### `bash: NAME:: command not found`

`gcloud secrets list` 결과 화면의 `NAME: ...` 같은 출력 텍스트를 다시 terminal에 붙여넣은 경우다. 명령어만 붙여넣는다.

## Operational Notes

- 업로드 원본 문서 파일, 전체 문서 텍스트, 전체 GitHub 소스 코드는 장기 저장하지 않는다.
- Supabase에는 분석 메타데이터, 문서 메타데이터, 분석 단계, finding/evidence, 생성 artifact 메타데이터, 문서 초안 JSON이 저장된다.
- 하이라이트 PDF artifact가 생성되면 파일 자체에는 원본 문서 내용이 포함된다. production에서는 object storage와 retention cleanup 정책을 별도 운영해야 한다.
- 공개 배포 상태에서는 API 비용 보호를 위해 rate limit, 인증, quota 정책을 추가 검토해야 한다.
- background 분석이 길어질수록 Cloud Run web process만으로는 한계가 있다. 운영 규모가 커지면 Cloud Tasks 또는 Pub/Sub worker 분리를 검토한다.
