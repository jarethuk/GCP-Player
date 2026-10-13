package com.bencreswell.gcpplayer.di

import android.content.Context
import com.bencreswell.gcpplayer.data.api.Catalogue
import com.bencreswell.gcpplayer.data.api.CatalogueApi
import com.bencreswell.gcpplayer.data.db.EpisodeDao
import com.bencreswell.gcpplayer.data.db.GcpDatabase
import com.bencreswell.gcpplayer.data.db.PatreonDao
import com.bencreswell.gcpplayer.data.db.ShowDao
import com.bencreswell.gcpplayer.playback.DownloadEraser
import com.bencreswell.gcpplayer.playback.DownloadsRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun okHttpClient(): OkHttpClient = OkHttpClient.Builder()
        // The iOS client gives a feed 20 seconds; match it, so a slow feed
        // behaves the same on both phones.
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): GcpDatabase = GcpDatabase.build(context)

    @Provides
    fun showDao(database: GcpDatabase): ShowDao = database.showDao()

    @Provides
    fun episodeDao(database: GcpDatabase): EpisodeDao = database.episodeDao()

    @Provides
    fun patreonDao(database: GcpDatabase): PatreonDao = database.patreonDao()

    @Provides
    @Singleton
    fun context(@ApplicationContext context: Context): Context = context
}

@Module
@InstallIn(SingletonComponent::class)
abstract class BindingsModule {
    @Binds
    abstract fun catalogue(api: CatalogueApi): Catalogue

    @Binds
    abstract fun downloadEraser(downloads: DownloadsRepository): DownloadEraser
}
