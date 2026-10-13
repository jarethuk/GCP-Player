-- CreateEnum
CREATE TYPE "FeedSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "feed_sources" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "showTitle" TEXT,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,

    CONSTRAINT "feed_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shows" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "system" TEXT,
    "description" TEXT,
    "artworkUrl" TEXT,
    "matchPattern" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "showId" TEXT,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "description" TEXT,
    "audioUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "season" INTEGER,
    "number" INTEGER,
    "artworkUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_sync_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "status" "FeedSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "itemsUnattributed" INTEGER NOT NULL DEFAULT 0,
    "showsCreated" INTEGER NOT NULL DEFAULT 0,
    "failedFeeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,

    CONSTRAINT "feed_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feed_sources_url_key" ON "feed_sources"("url");

-- CreateIndex
CREATE INDEX "feed_sources_isEnabled_sortIndex_idx" ON "feed_sources"("isEnabled", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "shows_slug_key" ON "shows"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "shows_title_key" ON "shows"("title");

-- CreateIndex
CREATE INDEX "shows_updatedAt_id_idx" ON "shows"("updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_guid_key" ON "episodes"("guid");

-- CreateIndex
CREATE INDEX "episodes_showId_updatedAt_id_idx" ON "episodes"("showId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "episodes_showId_publishedAt_idx" ON "episodes"("showId", "publishedAt");

-- CreateIndex
CREATE INDEX "episodes_updatedAt_id_idx" ON "episodes"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "feed_sync_runs_startedAt_idx" ON "feed_sync_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_showId_fkey" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
