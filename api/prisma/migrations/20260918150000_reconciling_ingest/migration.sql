-- Ingest stops being insert-only and starts reconciling.
--
-- `hash` fingerprints the feed-derived fields so a run can write only what
-- genuinely changed; `overridden` marks the rows a person has edited, which
-- ingest then leaves alone for good.
--
-- Both are added without a backfill. `hash` is deliberately left null on every
-- existing row: the old ingest could never apply an upstream edit, so the
-- first reconciling run reads the whole catalogue as changed and pushes the
-- feed's current truth to every client once. That is the point of the change,
-- not a cost of it.
ALTER TABLE "shows" ADD COLUMN "overridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shows" ADD COLUMN "hash" TEXT;

ALTER TABLE "episodes" ADD COLUMN "overridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "episodes" ADD COLUMN "hash" TEXT;

-- What a run actually reconciled, for the dashboard's sync history.
ALTER TABLE "feed_sync_runs" ADD COLUMN "episodesUpdated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "feed_sync_runs" ADD COLUMN "showsUpdated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "feed_sync_runs" ADD COLUMN "overriddenSkipped" INTEGER NOT NULL DEFAULT 0;
