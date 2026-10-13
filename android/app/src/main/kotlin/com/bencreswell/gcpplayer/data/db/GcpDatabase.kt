package com.bencreswell.gcpplayer.data.db

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.DeleteColumn
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.AutoMigrationSpec
import com.bencreswell.gcpplayer.data.model.EpisodeEntity
import com.bencreswell.gcpplayer.data.model.PatreonCredentialEntity
import com.bencreswell.gcpplayer.data.model.ShowEntity

@Database(
    entities = [ShowEntity::class, EpisodeEntity::class, PatreonCredentialEntity::class],
    version = 4,
    exportSchema = true,
    autoMigrations = [
        AutoMigration(from = 1, to = 2, spec = GcpDatabase.FeedToApi::class),
        // Version 3 adds episodes.videoUrl. Nullable and added, so Room writes
        // the migration itself — there is nothing to tell it and no spec.
        AutoMigration(from = 2, to = 3),
        // Version 4 is Patreon: the credential table, the Patreon columns, and
        // `audioUrl` becoming nullable — which SQLite can't ALTER, so Room
        // rebuilds the episodes table and copies the rows across. Local state
        // comes with them. `listedAt` arrives as 0 on every row and is filled
        // by the first sync, which the upgrade always runs in full anyway.
        AutoMigration(from = 3, to = 4),
    ],
)
abstract class GcpDatabase : RoomDatabase() {
    abstract fun showDao(): ShowDao
    abstract fun episodeDao(): EpisodeDao
    abstract fun patreonDao(): PatreonDao

    /**
     * Version 2 is the move off the RSS feeds and onto the catalogue API.
     *
     * `matchPattern` was the regex that attributed episodes to a show while
     * the phone was the thing parsing feeds; that work happens once on the
     * server now. `episodesSyncedAt` replaces it — a nullable column, so
     * Room adds it without being told, but the drop has to be declared.
     *
     * Migrated rather than rebuilt because none of what is worth keeping
     * comes from the API: what has been played, where you had got to, and
     * which shows are starred are all this device's, and a destructive
     * migration would quietly throw them away on upgrade.
     */
    @DeleteColumn(tableName = "shows", columnName = "matchPattern")
    class FeedToApi : AutoMigrationSpec

    // A device upgrading from 2 finds videoUrl null on every row until the
    // next sync fills it, which is the same place a fresh install starts.

    companion object {
        fun build(context: Context): GcpDatabase =
            Room.databaseBuilder(context, GcpDatabase::class.java, "gcp.db").build()
    }
}
