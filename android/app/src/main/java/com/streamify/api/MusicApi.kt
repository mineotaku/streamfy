package com.streamify.api

import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface MusicApi {
    @GET("/api/songs")
    suspend fun getSongs(): List<SongResponse>

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
    val path: String
)

data class ScanResponse(
    val success: Boolean,
    val newCount: Int
)
