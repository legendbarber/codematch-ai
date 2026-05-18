# Google Cloud Deployment Notes

## Target

- App runtime: Cloud Run container
- Database: Supabase Postgres or Cloud SQL for PostgreSQL
- Secrets: Secret Manager or Cloud Run environment variables

## Database

The app uses PostgreSQL through `prisma/schema.prisma`. For Supabase, set `DATABASE_URL` to the transaction pooler connection string with `pgbouncer=true`, and `DIRECT_URL` to the session pooler or direct database URL for Prisma schema sync/migrations. For Cloud SQL, set both values to the Cloud SQL PostgreSQL connection string unless a separate migration URL is preferred.

Recommended deployment sequence:

1. Create a Supabase Postgres project or Cloud SQL PostgreSQL instance.
2. Store `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and optional `GITHUB_TOKEN` as secrets.
3. Build the app container with `npm ci`, `npx prisma generate`, and `npm run build`.
4. Run schema sync using `npx prisma db push` for the beta, or create production migrations before launch.
5. Deploy to Cloud Run with the Cloud SQL connection attached.

## Notes

- Background analysis currently runs in the web process. For heavier production use, move the runner to Cloud Tasks or Pub/Sub.
- Uploaded source documents are not persisted; only document metadata and evidence snippets in findings are saved.
