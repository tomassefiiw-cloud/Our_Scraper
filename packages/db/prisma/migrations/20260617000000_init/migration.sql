-- =============================================================================
-- Migration: init
-- Adds full-text search support (TSVECTOR) and trigger, mirroring §5 schema.
-- Prisma doesn't natively model TSVECTOR, so we add it via raw SQL.
-- =============================================================================

-- Full-text search vector on jobs
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Index for full-text search
CREATE INDEX IF NOT EXISTS "idx_jobs_search" ON "jobs" USING GIN(search_vector);

-- Trigger function to keep search_vector in sync with title + company + description
CREATE OR REPLACE FUNCTION jobs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."companyName", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_search_vector ON "jobs";
CREATE TRIGGER trg_jobs_search_vector
  BEFORE INSERT OR UPDATE ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION jobs_search_vector_update();

-- Helpful composite index for feed ordering
CREATE INDEX IF NOT EXISTS "idx_jobs_feed"
  ON "jobs" ("isClosed", "postedAt" DESC)
  WHERE "isClosed" = false;
