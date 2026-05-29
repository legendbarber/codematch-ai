ALTER TABLE "Analysis"
ADD COLUMN "comparisonBasis" TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE "Finding"
ADD COLUMN "documentLocationJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN "codeLocationsJson" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "GeneratedArtifact" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "findingId" TEXT,
  "type" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeneratedArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentationDraft" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "draftJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentationDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneratedArtifact_analysisId_idx" ON "GeneratedArtifact"("analysisId");
CREATE INDEX "GeneratedArtifact_analysisId_findingId_idx" ON "GeneratedArtifact"("analysisId", "findingId");
CREATE INDEX "DocumentationDraft_analysisId_findingId_idx" ON "DocumentationDraft"("analysisId", "findingId");

ALTER TABLE "GeneratedArtifact"
ADD CONSTRAINT "GeneratedArtifact_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentationDraft"
ADD CONSTRAINT "DocumentationDraft_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentationDraft"
ADD CONSTRAINT "DocumentationDraft_findingId_fkey"
FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
