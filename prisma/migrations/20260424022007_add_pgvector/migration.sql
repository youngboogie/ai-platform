CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "DocumentChunk"
DROP COLUMN IF EXISTS "embedding";

ALTER TABLE "DocumentChunk"
ADD COLUMN "embedding" vector(1024);