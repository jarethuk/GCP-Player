-- Patreon: the shows that exist only there, and the early releases of shows
-- that don't.
--
-- `audioUrl` becomes nullable because an episode that is so far only on
-- Patreon has no public audio, and the API never serves a patron's. Every
-- existing row keeps its value.
--
-- No backfill of `patreonShowId`: the seed links the public shows whose
-- Patreon collection is titled differently, and ingest links the rest.
ALTER TABLE "shows" ADD COLUMN "patreonShowId" TEXT;
ALTER TABLE "shows" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "shows_patreonShowId_key" ON "shows"("patreonShowId");

ALTER TABLE "episodes" ALTER COLUMN "audioUrl" DROP NOT NULL;
ALTER TABLE "episodes" ADD COLUMN "patreonPostId" TEXT;
CREATE UNIQUE INDEX "episodes_patreonPostId_key" ON "episodes"("patreonPostId");

-- When Patreon published it: a patron's client lists episodes by this.
ALTER TABLE "episodes" ADD COLUMN "patreonPublishedAt" TIMESTAMPTZ(3);
