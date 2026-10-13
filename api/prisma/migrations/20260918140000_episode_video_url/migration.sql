-- The video version of an episode, as the feeds reference it.
--
-- Nullable with no default and no backfill here: the value comes from the
-- feeds, and the next ingest run fills every row whose item carries one
-- (see EpisodeFill in src/feed/plan.ts). Filling it there rather than in SQL
-- keeps one definition of what counts as a video link.
ALTER TABLE "episodes" ADD COLUMN "videoUrl" TEXT;
