package com.streamify.api

import retrofit2.http.GET
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface MusicApi {
    @GET("/api/songs")
    suspend fun getSongs(): List<SongResponse>

    @GET("/api/recommendations")
    suspend fun getRecommendations(
        @Query("currentId") currentId: Int? = null,
        @Query("limit") limit: Int = 20,
        @Query("hour") hour: Int? = null,
        @Query("dayOfWeek") dayOfWeek: Int? = null
    ): List<SongResponse>

    @POST("/api/songs/{id}/played")
    suspend fun markPlayed(
        @Path("id") id: Int,
        @Body request: PlayEventRequest
    ): PlayEventResponse

    @POST("/api/songs/{id}/favorite")
    suspend fun toggleFavorite(@Path("id") id: Int): FavoriteResponse

    @POST("/api/songs/{id}/skipped")
    suspend fun markSkipped(@Path("id") id: Int): SuccessResponse

    @PATCH("/api/songs/{id}/metadata")
    suspend fun updateSongMetadata(
        @Path("id") id: Int,
        @Body request: MetadataUpdateRequest
    ): MetadataUpdateResponse

    @POST("/api/metadata/undo")
    suspend fun undoMetadataEdit(): MetadataUpdateResponse

    @GET("/api/songs/{id}/lyrics")
    suspend fun getLyrics(@Path("id") id: Int): LyricsResponse

    @GET("/api/playlists")
    suspend fun getPlaylists(): List<PlaylistResponse>

    @POST("/api/playlists")
    suspend fun createPlaylist(@Body request: PlaylistRequest): PlaylistResponse

    @PUT("/api/playlists/{id}")
    suspend fun renamePlaylist(
        @Path("id") id: Int,
        @Body request: PlaylistRequest
    ): PlaylistResponse

    @POST("/api/playlists/{id}/songs")
    suspend fun addSongToPlaylist(
        @Path("id") id: Int,
        @Body request: PlaylistSongRequest
    ): SuccessResponse

    @GET("/api/playlists/{id}/songs")
    suspend fun getPlaylistSongs(@Path("id") id: Int): List<SongResponse>

    @DELETE("/api/playlists/{id}/songs/{songId}")
    suspend fun removeSongFromPlaylist(
        @Path("id") id: Int,
        @Path("songId") songId: Int
    ): SuccessResponse

    @PUT("/api/playlists/{id}/reorder")
    suspend fun reorderPlaylist(
        @Path("id") id: Int,
        @Body request: PlaylistReorderRequest
    ): SuccessResponse

    @POST("/api/scan")
    suspend fun scanLibrary(): ScanResponse

    @POST("/api/videos/scan")
    suspend fun scanVideoLibrary(): VideoScanResponse

    @GET("/api/videos/series")
    suspend fun getVideoSeries(@Query("scan") scan: Boolean = false): List<VideoSeriesResponse>

    @PUT("/api/videos/series/{id}")
    suspend fun updateVideoSeries(
        @Path("id") id: Int,
        @Body request: VideoSeriesUpdateRequest
    ): VideoSeriesUpdateResponse

    @GET("/api/videos/status")
    suspend fun getVideoStatus(@Query("scan") scan: Boolean = false): VideoStatusResponse

    @GET("/api/videos/episodes/{id}")
    suspend fun getVideoEpisode(@Path("id") id: Int): VideoEpisodeResponse

    @GET("/api/videos/progress")
    suspend fun getVideoProgress(): ContinueWatchingResponse

    @GET("/api/videos/episodes/{id}/progress")
    suspend fun getVideoEpisodeProgress(@Path("id") id: Int): VideoProgressResponse

    @POST("/api/videos/episodes/{id}/progress")
    suspend fun saveVideoEpisodeProgress(
        @Path("id") id: Int,
        @Body request: VideoProgressRequest
    ): VideoProgressResponse

    @GET("/api/stats/overview")
    suspend fun getStatsOverview(): StatsOverviewResponse

    @GET("/api/mixes")
    suspend fun getMixes(): List<MixResponse>

    @GET("/api/duplicates")
    suspend fun getDuplicates(): DuplicatesResponse

    @POST("/api/duplicates/ignore")
    suspend fun ignoreDuplicate(@Body request: DuplicateIgnoreRequest): SuccessResponse

    @GET("/api/library/health")
    suspend fun getLibraryHealth(): LibraryHealthResponse

    @POST("/api/playlists/import")
    suspend fun importPlaylist(
        @Query("name") name: String,
        @Body body: String
    ): PlaylistImportResponse

    @GET("/api/profiles")
    suspend fun getProfiles(): List<ProfileResponse>

    @POST("/api/profiles")
    suspend fun createProfile(@Body request: ProfileRequest): ProfileCreateResponse

    @GET("/api/eq-presets")
    suspend fun getEqPresets(@Query("profileId") profileId: Int = 1): List<EqPresetResponse>

    @POST("/api/eq-presets")
    suspend fun saveEqPreset(@Body request: EqPresetRequest): SuccessResponse

    @GET("/api/discovery")
    suspend fun getDiscovery(): DiscoveryResponse

    @GET("/api/realtime/state")
    suspend fun getRealtimeState(): RealtimeStateResponse

    @POST("/api/realtime/state")
    suspend fun updateRealtimeState(@Body request: PlaybackStateRequest): PlaybackStateResponse
}

data class SongResponse(
    val id: Int,
    val title: String,
    val artist: String,
    val album: String,
    val duration: Double,
    val coverArtPath: String?,
    val path: String,
    val reason: String? = null,
    val format: String? = null,
    val dateAdded: String? = null,
    val isFavorite: Int = 0,
    val playCount: Int = 0,
    val skipCount: Int = 0,
    val lastPlayed: String? = null,
    val year: Int? = null,
    val trackNumber: Int? = null,
    val discNumber: Int? = null,
    val composer: String? = null,
    val albumArtist: String? = null,
    val genre: String? = null
)

data class ScanResponse(
    val success: Boolean,
    val newCount: Int
)

data class VideoScanResponse(
    val success: Boolean,
    val newCount: Int = 0,
    val updatedCount: Int = 0,
    val skippedCount: Int = 0,
    val removedCount: Int = 0,
    val seriesCount: Int = 0,
    val episodeCount: Int = 0
)

data class PlayEventRequest(
    val hour: Int,
    val dayOfWeek: Int,
    val source: String
)

data class PlayEventResponse(
    val success: Boolean
)

data class SuccessResponse(
    val success: Boolean
)

data class FavoriteResponse(
    val success: Boolean,
    val isFavorite: Boolean
)

data class LyricsResponse(
    val lyrics: String
)

data class PlaylistResponse(
    val id: Int,
    val name: String,
    val createdAt: String? = null
)

data class PlaylistRequest(
    val name: String
)

data class PlaylistSongRequest(
    val songId: Int
)

data class PlaylistReorderRequest(
    val songIds: List<Int>
)

data class MetadataUpdateRequest(
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val genre: String? = null,
    val albumArtist: String? = null,
    val composer: String? = null,
    val year: Int? = null,
    val trackNumber: Int? = null,
    val discNumber: Int? = null
)

data class MetadataUpdateResponse(
    val success: Boolean,
    val song: SongResponse? = null,
    val fileWrite: String? = null
)

data class VideoSeriesResponse(
    val id: Int,
    val title: String,
    val sortTitle: String? = null,
    val description: String? = null,
    val posterPath: String? = null,
    val backdropPath: String? = null,
    val seasons: List<VideoSeasonResponse> = emptyList()
)

data class VideoSeasonResponse(
    val seasonNumber: Int,
    val title: String? = null,
    val episodes: List<VideoEpisodeResponse> = emptyList()
)

data class VideoEpisodeResponse(
    val id: Int,
    val title: String,
    val episodeNumber: Int,
    val seasonNumber: Int,
    val duration: Double? = null,
    val thumbnailPath: String? = null,
    val streamPath: String? = null,
    val description: String? = null,
    val seriesTitle: String? = null,
    val path: String? = null,
    val format: String? = null,
    val fileSize: Long? = null,
    val dateAdded: String? = null,
    val subtitlePath: String? = null,
    val positionMs: Long? = null,
    val durationMs: Long? = null,
    val completed: Int? = null,
    val progressUpdatedAt: String? = null
)

data class ContinueWatchingResponse(
    val items: List<VideoEpisodeResponse> = emptyList()
)

data class VideoProgressRequest(
    val positionMs: Long,
    val durationMs: Long,
    val completed: Boolean = false
)

data class VideoProgressResponse(
    val success: Boolean = true,
    val episodeId: Int,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val completed: Int = 0
)

data class VideoSeriesUpdateRequest(
    val title: String,
    val posterPath: String? = null
)

data class VideoSeriesUpdateResponse(
    val success: Boolean,
    val series: VideoSeriesResponse? = null
)

data class VideoStatusResponse(
    val videoDir: String,
    val seriesCount: Int,
    val seasonCount: Int,
    val episodeCount: Int,
    val lastScan: Map<String, Any>? = null,
    val lastScanUpdatedAt: String? = null,
    val scan: VideoScanResponse? = null
)

data class StatsOverviewResponse(
    val totals: StatsTotalsResponse,
    val playedSeconds: StatsTotalResponse,
    val topSongs: List<SongResponse> = emptyList(),
    val topArtists: List<ArtistStatsResponse> = emptyList(),
    val topAlbums: List<AlbumStatsResponse> = emptyList(),
    val genreDistribution: List<GenreStatsResponse> = emptyList(),
    val hourly: List<HourlyStatsResponse> = emptyList(),
    val daily: List<DailyStatsResponse> = emptyList(),
    val recent: List<SongResponse> = emptyList()
)

data class StatsTotalsResponse(
    val songCount: Int = 0,
    val libraryDuration: Double = 0.0,
    val playCount: Int = 0,
    val skipCount: Int = 0,
    val favoriteCount: Int = 0
)

data class StatsTotalResponse(
    val total: Double = 0.0
)

data class ArtistStatsResponse(
    val id: Int,
    val name: String,
    val plays: Int = 0,
    val seconds: Double = 0.0
)

data class AlbumStatsResponse(
    val id: Int,
    val title: String,
    val artist: String,
    val coverArtPath: String? = null,
    val plays: Int = 0
)

data class GenreStatsResponse(
    val name: String,
    val tracks: Int = 0,
    val plays: Int = 0
)

data class HourlyStatsResponse(
    val hour: Int,
    val plays: Int = 0
)

data class DailyStatsResponse(
    val dayOfWeek: Int,
    val plays: Int = 0
)

data class MixResponse(
    val id: String,
    val name: String,
    val songs: List<SongResponse> = emptyList()
)

data class DuplicatesResponse(
    val duplicates: List<DuplicateGroupResponse> = emptyList()
)

data class DuplicateGroupResponse(
    val fingerprint: String,
    val reason: String,
    val items: List<SongResponse> = emptyList()
)

data class DuplicateIgnoreRequest(
    val fingerprint: String
)

data class LibraryHealthResponse(
    val missingFiles: List<SongResponse> = emptyList(),
    val missingArtwork: List<SongResponse> = emptyList(),
    val unknownArtists: List<SongResponse> = emptyList(),
    val unknownAlbums: List<SongResponse> = emptyList(),
    val unsupportedFormats: List<SongResponse> = emptyList(),
    val emptyFolders: List<String> = emptyList()
)

data class PlaylistImportResponse(
    val id: Int,
    val created: Boolean,
    val added: Int = 0,
    val missing: Int = 0
)

data class ProfileResponse(
    val id: Int,
    val name: String,
    val isGuest: Int = 0,
    val createdAt: String? = null,
    val lastActive: String? = null
)

data class ProfileRequest(
    val name: String,
    val pin: String? = null,
    val isGuest: Boolean = false
)

data class ProfileCreateResponse(
    val id: Int,
    val name: String
)

data class EqPresetResponse(
    val id: Int,
    val profileId: Int,
    val name: String,
    val bands: String,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class EqPresetRequest(
    val profileId: Int = 1,
    val name: String,
    val bands: Map<String, Float>
)

data class DiscoveryResponse(
    val name: String,
    val port: Int,
    val websocket: String,
    val offline: Boolean,
    val version: String
)

data class RealtimeStateResponse(
    val playback: PlaybackStateResponse
)

data class PlaybackStateRequest(
    val songId: Int? = null,
    val isPlaying: Boolean? = null,
    val progress: Double? = null,
    val volume: Double? = null
)

data class PlaybackStateResponse(
    val songId: Int? = null,
    val isPlaying: Boolean = false,
    val progress: Double = 0.0,
    val volume: Double = 0.7,
    val updatedAt: String? = null
)
