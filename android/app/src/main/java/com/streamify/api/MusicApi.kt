package com.streamify.api

import retrofit2.http.GET
import retrofit2.http.Body
import retrofit2.http.POST
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

    @GET("/api/songs/{id}/lyrics")
    suspend fun getLyrics(@Path("id") id: Int): LyricsResponse

    @POST("/api/scan")
    suspend fun scanLibrary(): ScanResponse
}

data class SongResponse(
    val id: Int,
    val title: String,
    val artist: String,
    val album: String,
    val duration: Double,
    val coverArtPath: String?,
    val path: String,
    val reason: String? = null
)

data class ScanResponse(
    val success: Boolean,
    val newCount: Int
)

data class PlayEventRequest(
    val hour: Int,
    val dayOfWeek: Int,
    val source: String
)

data class PlayEventResponse(
    val success: Boolean
)

data class LyricsResponse(
    val lyrics: String
)
