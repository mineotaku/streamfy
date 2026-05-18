package com.streamify

import android.app.PictureInPictureParams
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Brightness6
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OndemandVideo
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.streamify.api.MusicApi
import com.streamify.api.PlayEventRequest
import com.streamify.api.PlaylistRequest
import com.streamify.api.PlaylistSongRequest
import com.streamify.api.SongResponse
import com.streamify.api.VideoEpisodeResponse
import com.streamify.api.VideoProgressRequest
import com.streamify.api.VideoSeasonResponse
import com.streamify.api.VideoSeriesResponse
import com.streamify.player.MusicService
import androidx.core.graphics.ColorUtils
import androidx.core.graphics.drawable.toBitmap
import androidx.palette.graphics.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.URLEncoder
import java.util.Calendar
import java.util.concurrent.TimeUnit

private const val PREFS_NAME = "streamify"
private const val PREF_SERVER_URL = "server_url"
private const val PREF_VIDEO_PREFIX = "video_resume_"

private data class AlbumGroup(
    val key: String,
    val title: String,
    val artist: String,
    val coverArtPath: String?,
    val songs: List<SongResponse>
)

class MainActivity : ComponentActivity() {
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller by mutableStateOf<MediaController?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedServerUrl = prefs.getString(PREF_SERVER_URL, null)
        val initialServerUrl = normalizeServerUrl(savedServerUrl ?: BuildConfig.STREAMIFY_SERVER_URL)

        setContent {
            StreamifyTheme {
                StreamifyApp(
                    initialServerUrl = initialServerUrl,
                    onSaveServerUrl = { serverUrl ->
                        prefs.edit().putString(PREF_SERVER_URL, normalizeServerUrl(serverUrl)).apply()
                    },
                    onControllerReady = { readyController ->
                        controller = readyController
                    },
                    getController = { controller }
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        val sessionToken = SessionToken(this, ComponentName(this, MusicService::class.java))
        controllerFuture = MediaController.Builder(this, sessionToken).buildAsync().also { future ->
            future.addListener({
                try {
                    controller = future.get()
                } catch (_: Exception) {
                    controller = null
                }
            }, MoreExecutors.directExecutor())
        }
    }

    override fun onStop() {
        controllerFuture?.let(MediaController::releaseFuture)
        controllerFuture = null
        controller = null
        super.onStop()
    }
}

@Composable
private fun StreamifyApp(
    initialServerUrl: String,
    onSaveServerUrl: (String) -> Unit,
    onControllerReady: (MediaController) -> Unit,
    getController: () -> MediaController?
) {
    var serverUrl by remember { mutableStateOf(initialServerUrl) }
    var serverInput by remember { mutableStateOf(initialServerUrl) }
    var songs by remember { mutableStateOf(emptyList<SongResponse>()) }
    var recommendedSongs by remember { mutableStateOf(emptyList<SongResponse>()) }
    var playQueue by remember { mutableStateOf(emptyList<SongResponse>()) }
    var playlists by remember { mutableStateOf(mapOf<String, List<Int>>()) }
    var loading by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Ready") }
    var error by remember { mutableStateOf<String?>(null) }
    var currentSong by remember { mutableStateOf<SongResponse?>(null) }
    var currentIndex by remember { mutableIntStateOf(-1) }
    var playerQueue by remember { mutableStateOf(emptyList<SongResponse>()) }
    var isPlaying by remember { mutableStateOf(false) }
    var activeTab by remember { mutableStateOf("Home") }
    var animePageOpen by remember { mutableStateOf(false) }
    var tabBackStack by remember { mutableStateOf(emptyList<String>()) }
    var libraryFilter by remember { mutableStateOf("All") }
    var searchQuery by remember { mutableStateOf("") }
    var favoriteIds by remember { mutableStateOf(setOf<Int>()) }
    var recentIds by remember { mutableStateOf(listOf<Int>()) }
    var expandedPlayer by remember { mutableStateOf(false) }
    var progressMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var shuffleEnabled by remember { mutableStateOf(false) }
    var repeatOne by remember { mutableStateOf(false) }
    var videoSeries by remember { mutableStateOf(emptyList<VideoSeriesResponse>()) }
    var videoLoading by remember { mutableStateOf(false) }
    var videoError by remember { mutableStateOf<String?>(null) }
    var selectedSeries by remember { mutableStateOf<VideoSeriesResponse?>(null) }
    var selectedSeason by remember { mutableStateOf<VideoSeasonResponse?>(null) }
    var selectedEpisode by remember { mutableStateOf<VideoEpisodeResponse?>(null) }
    var continueWatching by remember { mutableStateOf(emptyList<VideoEpisodeResponse>()) }
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current

    fun refresh(scanFirst: Boolean) {
        scope.launch {
            loadLibrary(serverUrl, scanFirst = scanFirst) { nextLoading, nextSongs, nextStatus, nextError ->
                loading = nextLoading
                songs = nextSongs
                favoriteIds = nextSongs.filter { it.isFavorite == 1 }.map { it.id }.toSet()
                status = nextStatus
                error = nextError
            }
            recommendedSongs = loadRecommendations(serverUrl, currentSong?.id)
            playQueue = recommendedSongs.ifEmpty { songs }
        }
    }

    fun playSong(song: SongResponse, queue: List<SongResponse> = emptyList()) {
        val controller = getController()
        if (controller == null) {
            error = "Player is still starting. Try again in a moment."
            return
        }
        val effectiveQueue = if (queue.isNotEmpty()) queue else playQueue.ifEmpty { songs }
        if (effectiveQueue.isEmpty()) return

        val mediaItems = effectiveQueue.map { q ->
            val metadata = MediaMetadata.Builder()
                .setTitle(q.title)
                .setArtist(q.artist)
                .setAlbumTitle(q.album)
                .build()
            MediaItem.Builder()
                .setUri("$serverUrl/api/stream/${q.id}")
                .setMediaId(q.id.toString())
                .setMediaMetadata(metadata)
                .build()
        }

        val startIndex = effectiveQueue.indexOfFirst { it.id == song.id }.takeIf { it >= 0 } ?: 0

        controller.setMediaItems(mediaItems, startIndex, 0L)
        controller.prepare()
        controller.play()
        onControllerReady(controller)
        playerQueue = effectiveQueue
        currentSong = effectiveQueue.getOrNull(startIndex)
        currentIndex = startIndex
        isPlaying = true
        recentIds = listOf(song.id) + recentIds.filterNot { it == song.id }.take(19)
        error = null

        scope.launch {
            runCatching {
                val now = Calendar.getInstance()
                createApi(serverUrl).markPlayed(
                    id = song.id,
                    request = PlayEventRequest(
                        hour = now.get(Calendar.HOUR_OF_DAY),
                        dayOfWeek = now.get(Calendar.DAY_OF_WEEK) - 1,
                        source = activeTab.lowercase()
                    )
                )
            }
            recommendedSongs = loadRecommendations(serverUrl, song.id)
            playQueue = recommendedSongs.ifEmpty { playQueue.ifEmpty { songs } }
        }
    }

    fun addToQueue(song: SongResponse) {
        playQueue = if (playQueue.any { it.id == song.id }) playQueue else playQueue + song
    }

    fun addToDefaultPlaylist(song: SongResponse) {
        scope.launch {
            val name = "My Playlist"
            val current = playlists[name] ?: emptyList()
            playlists = if (song.id in current) playlists else playlists + (name to (current + song.id))
            runCatching {
                val api = createApi(serverUrl)
                val playlist = api.getPlaylists().firstOrNull { it.name == name }
                    ?: api.createPlaylist(PlaylistRequest(name))
                api.addSongToPlaylist(playlist.id, PlaylistSongRequest(song.id))
            }.onFailure {
                error = "Could not update playlist on the server."
                playlists = playlists + (name to current)
            }
        }
    }

    fun shareSong(context: Context, song: SongResponse) {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, song.title)
            putExtra(Intent.EXTRA_TEXT, "${song.title} - ${song.artist}")
        }
        try {
            context.startActivity(Intent.createChooser(sendIntent, "Share track").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
        }
    }

    fun playOffset(delta: Int) {
        val queue = playerQueue.ifEmpty { playQueue.ifEmpty { songs } }
        if (queue.isEmpty()) return
        if (delta > 0) {
            currentSong?.let { skipped ->
                scope.launch { runCatching { createApi(serverUrl).markSkipped(skipped.id) } }
            }
        }
        val nextIndex = when {
            repeatOne && delta > 0 && currentIndex >= 0 -> currentIndex
            shuffleEnabled && delta > 0 && queue.size > 1 -> {
                val choices = queue.indices.filterNot { it == currentIndex }
                choices.random()
            }
            currentIndex < 0 -> 0
            else -> (currentIndex + delta + queue.size) % queue.size
        }
        playSong(queue[nextIndex], queue)
    }

    fun toggleFavorite(songId: Int) {
        val wasFavorite = songId in favoriteIds
        val nextFavorite = !wasFavorite
        favoriteIds = if (nextFavorite) favoriteIds + songId else favoriteIds - songId
        fun updateFavorite(list: List<SongResponse>) = list.map { song ->
            if (song.id == songId) song.copy(isFavorite = if (nextFavorite) 1 else 0) else song
        }
        songs = updateFavorite(songs)
        recommendedSongs = updateFavorite(recommendedSongs)
        playQueue = updateFavorite(playQueue)
        playerQueue = updateFavorite(playerQueue)
        currentSong = currentSong?.let { if (it.id == songId) it.copy(isFavorite = if (nextFavorite) 1 else 0) else it }
        scope.launch {
            runCatching { createApi(serverUrl).toggleFavorite(songId) }
                .onSuccess { response ->
                    val serverFavorite = response.isFavorite
                    favoriteIds = if (serverFavorite) favoriteIds + songId else favoriteIds - songId
                    songs = songs.map { if (it.id == songId) it.copy(isFavorite = if (serverFavorite) 1 else 0) else it }
                    recommendedSongs = recommendedSongs.map { if (it.id == songId) it.copy(isFavorite = if (serverFavorite) 1 else 0) else it }
                    playQueue = playQueue.map { if (it.id == songId) it.copy(isFavorite = if (serverFavorite) 1 else 0) else it }
                    playerQueue = playerQueue.map { if (it.id == songId) it.copy(isFavorite = if (serverFavorite) 1 else 0) else it }
                    currentSong = currentSong?.let { if (it.id == songId) it.copy(isFavorite = if (serverFavorite) 1 else 0) else it }
                }
                .onFailure {
                    favoriteIds = if (wasFavorite) favoriteIds + songId else favoriteIds - songId
                    songs = songs.map { if (it.id == songId) it.copy(isFavorite = if (wasFavorite) 1 else 0) else it }
                    recommendedSongs = recommendedSongs.map { if (it.id == songId) it.copy(isFavorite = if (wasFavorite) 1 else 0) else it }
                    playQueue = playQueue.map { if (it.id == songId) it.copy(isFavorite = if (wasFavorite) 1 else 0) else it }
                    playerQueue = playerQueue.map { if (it.id == songId) it.copy(isFavorite = if (wasFavorite) 1 else 0) else it }
                    currentSong = currentSong?.let { if (it.id == songId) it.copy(isFavorite = if (wasFavorite) 1 else 0) else it }
                    error = "Could not update liked songs on the server."
                }
        }
    }

    fun toggleRepeatOne() {
        repeatOne = !repeatOne
        getController()?.repeatMode = if (repeatOne) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }

    fun selectTab(tab: String) {
        if (tab == activeTab) return
        tabBackStack = (tabBackStack.filterNot { it == tab } + activeTab).takeLast(8)
        activeTab = tab
    }

    BackHandler(
        enabled = selectedEpisode != null ||
            selectedSeason != null ||
            selectedSeries != null ||
            animePageOpen ||
            expandedPlayer ||
            searchQuery.isNotBlank() ||
            libraryFilter != "All" ||
            tabBackStack.isNotEmpty() ||
            activeTab != "Home"
    ) {
        when {
            selectedEpisode != null -> selectedEpisode = null
            selectedSeason != null -> selectedSeason = null
            selectedSeries != null -> selectedSeries = null
            animePageOpen -> animePageOpen = false
            expandedPlayer -> expandedPlayer = false
            searchQuery.isNotBlank() -> searchQuery = ""
            activeTab == "Library" && libraryFilter != "All" -> libraryFilter = "All"
            tabBackStack.isNotEmpty() -> {
                activeTab = tabBackStack.last()
                tabBackStack = tabBackStack.dropLast(1)
            }
            activeTab != "Home" -> activeTab = "Home"
        }
    }

    LaunchedEffect(Unit) {
        loadLibrary(serverUrl, scanFirst = false) { nextLoading, nextSongs, nextStatus, nextError ->
            loading = nextLoading
            songs = nextSongs
            favoriteIds = nextSongs.filter { it.isFavorite == 1 }.map { it.id }.toSet()
            status = nextStatus
            error = nextError
        }
        recommendedSongs = loadRecommendations(serverUrl, currentSong?.id)
    }

    LaunchedEffect(animePageOpen, serverUrl) {
        if (animePageOpen && videoSeries.isEmpty() && !videoLoading) {
            videoLoading = true
            videoError = null
            try {
                val api = createApi(serverUrl)
                videoSeries = api.getVideoSeries(scan = false)
                continueWatching = api.getVideoProgress().items
            } catch (e: Exception) {
                videoError = "Video server is not ready yet. ${e.localizedMessage ?: e.javaClass.simpleName}"
                videoSeries = emptyList()
            } finally {
                videoLoading = false
            }
        }
    }

    LaunchedEffect(currentSong, isPlaying) {
        while (currentSong != null) {
            val controller = getController()
            progressMs = controller?.currentPosition?.coerceAtLeast(0L) ?: 0L
            durationMs = controller?.duration
                ?.takeIf { it > 0L && it != C.TIME_UNSET }
                ?: ((currentSong?.duration ?: 0.0) * 1000).toLong()
            delay(500)
        }
    }

    DisposableEffect(getController(), playerQueue, songs) {
        val ctrl = getController() ?: return@DisposableEffect onDispose {}
        val listener = object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val idx = ctrl.currentMediaItemIndex
                currentIndex = idx
                val mediaId = mediaItem?.mediaId?.toIntOrNull()
                currentSong = playerQueue.firstOrNull { it.id == mediaId }
                    ?: playerQueue.getOrNull(idx)
                    ?: songs.firstOrNull { it.id == mediaId }
            }

            override fun onIsPlayingChanged(isPlayingNew: Boolean) {
                isPlaying = isPlayingNew
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && ctrl.repeatMode == Player.REPEAT_MODE_OFF) {
                    isPlaying = false
                    progressMs = 0L
                }
            }
        }
        ctrl.addListener(listener)
        onDispose { ctrl.removeListener(listener) }
    }

    val searchedSongs = songs.filter { song ->
        val query = searchQuery.trim()
        query.isBlank() ||
            song.title.contains(query, ignoreCase = true) ||
            song.artist.contains(query, ignoreCase = true) ||
            song.album.contains(query, ignoreCase = true)
    }

    val visibleSongs = when (libraryFilter) {
        "Liked" -> searchedSongs.filter { it.id in favoriteIds }
        "Recent" -> recentIds.mapNotNull { id -> searchedSongs.firstOrNull { it.id == id } }
        else -> searchedSongs
    }
    val albumGroups = visibleSongs.groupBy { albumKey(it) }
        .values
        .map { group ->
            val ordered = group.sortedWith(compareBy<SongResponse> { it.album }.thenBy { it.title })
            val first = ordered.first()
            AlbumGroup(
                key = albumKey(first),
                title = first.album.ifBlank { "Unknown Album" },
                artist = first.artist.ifBlank { "Unknown Artist" },
                coverArtPath = first.coverArtPath,
                songs = ordered
            )
        }
        .sortedWith(compareBy<AlbumGroup> { it.title.lowercase() }.thenBy { it.artist.lowercase() })
    val displayedSongs = if (activeTab == "Home") recommendedSongs.ifEmpty { songs } else visibleSongs
    var dragTotal by remember { mutableStateOf(0f) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackdrop)
            .pointerInput(animePageOpen) {
                detectHorizontalDragGestures(
                    onDragStart = { dragTotal = 0f },
                    onHorizontalDrag = { _, dragAmount -> dragTotal += dragAmount },
                    onDragEnd = {
                        when {
                            dragTotal > 110f -> animePageOpen = true
                            dragTotal < -110f -> animePageOpen = false
                        }
                        dragTotal = 0f
                    },
                    onDragCancel = { dragTotal = 0f }
                )
            }
    ) {
        if (animePageOpen) {
            AnimeStreamingPage(
                serverUrl = serverUrl,
                series = videoSeries,
                loading = videoLoading,
                error = videoError,
                selectedSeries = selectedSeries,
                selectedSeason = selectedSeason,
                selectedEpisode = selectedEpisode,
                continueWatching = continueWatching,
                onClose = {
                    selectedEpisode = null
                    selectedSeason = null
                    selectedSeries = null
                    animePageOpen = false
                },
                onRefresh = {
                    scope.launch {
                        videoLoading = true
                        videoError = null
                        try {
                            val api = createApi(serverUrl)
                            api.scanVideoLibrary()
                            videoSeries = api.getVideoSeries(scan = false)
                            continueWatching = api.getVideoProgress().items
                        } catch (e: Exception) {
                            videoError = "Video server is not ready yet. ${e.localizedMessage ?: e.javaClass.simpleName}"
                        } finally {
                            videoLoading = false
                        }
                    }
                },
                onSeriesSelected = {
                    selectedSeries = it
                    selectedSeason = null
                    selectedEpisode = null
                },
                onSeasonSelected = {
                    selectedSeason = it
                    selectedEpisode = null
                },
                onEpisodeSelected = { selectedEpisode = it }
            )
        } else LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 18.dp, top = 18.dp, end = 18.dp, bottom = 156.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
            item {
                SpotifyTopBar(
                    activeTab = activeTab,
                    songCount = songs.size,
                    loading = loading,
                    connected = error == null,
                    onVideoClick = { animePageOpen = true },
                    onRefresh = { refresh(scanFirst = false) }
                )
            }

            if (error != null) {
                item {
                    ConnectionRecoveryCard(
                        serverInput = serverInput,
                        error = error.orEmpty(),
                        loading = loading,
                        onServerInputChange = { serverInput = it },
                        onSave = {
                            serverUrl = normalizeServerUrl(serverInput)
                            serverInput = serverUrl
                            onSaveServerUrl(serverUrl)
                            refresh(scanFirst = false)
                        }
                    )
                }
            }

            when (activeTab) {
                "Search" -> {
                    item {
                        SearchPanel(
                            query = searchQuery,
                            loading = loading,
                            status = status,
                            songCount = songs.size,
                            onQueryChange = { searchQuery = it },
                            onScan = { refresh(scanFirst = true) }
                        )
                    }
                    item { SectionTitle("Search results", "${visibleSongs.size} tracks") }
                }
                "Library" -> {
                    item {
                        LibraryHeader(
                            selected = libraryFilter,
                            songCount = songs.size,
                            albumCount = albumGroups.size,
                            likedCount = favoriteIds.size,
                            recentCount = recentIds.size,
                            onSelect = { libraryFilter = it },
                            onScan = { refresh(scanFirst = true) },
                            loading = loading
                        )
                    }
                    item { SectionTitle("Your Library", "${visibleSongs.size} tracks") }
                }
                else -> {
                    item {
                        HomeHero(
                            songs = recommendedSongs.ifEmpty { songs },
                            serverUrl = serverUrl,
                            loading = loading,
                            status = status,
                            onPlay = {
                                recommendedSongs.ifEmpty { songs }.firstOrNull()?.let { playSong(it, recommendedSongs.ifEmpty { songs }) }
                            },
                            onShuffle = {
                                recommendedSongs.ifEmpty { songs }.shuffled().firstOrNull()?.let { playSong(it, recommendedSongs.ifEmpty { songs }) }
                            },
                            onScan = { refresh(scanFirst = true) }
                        )
                    }
                    item { QuickMixes(songs = recommendedSongs.ifEmpty { songs }, serverUrl = serverUrl, onSongClick = { playSong(it, recommendedSongs.ifEmpty { songs }) }) }
                    item { SectionTitle("Smart suggestions", "Based on listening, artists and time") }
                }
            }

            when {
                loading -> item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = Orange)
                    }
                }
                displayedSongs.isEmpty() -> item {
                    EmptyLibrary(
                        message = if (searchQuery.isBlank()) {
                            "No tracks here yet. Tap Scan to refresh the server."
                        } else {
                            "No matches for \"$searchQuery\"."
                        }
                    )
                }
                activeTab == "Library" && libraryFilter == "Albums" -> items(albumGroups, key = { it.key }) { album ->
                    AlbumCollectionRow(
                        album = album,
                        serverUrl = serverUrl,
                        onPlay = { playSong(album.songs.first(), album.songs) }
                    )
                }
                else -> items(displayedSongs, key = { it.id }) { song ->
                    TrackRow(
                        song = song,
                        serverUrl = serverUrl,
                        selected = currentSong?.id == song.id,
                        favorite = song.id in favoriteIds,
                        onClick = { playSong(song, displayedSongs) },
                        onFavorite = { toggleFavorite(song.id) },
                        onAddToQueue = { addToQueue(it) },
                        onShare = { shareSong(ctx, it) }
                    )
                }
            }
        }

        if (!animePageOpen) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MiniPlayer(
                    song = currentSong,
                    serverUrl = serverUrl,
                    isPlaying = isPlaying,
                    onPrevious = { playOffset(-1) },
                    onNext = { playOffset(1) },
                    onExpand = { if (currentSong != null) expandedPlayer = true },
                    onToggle = {
                        getController()?.let { controller ->
                            if (controller.isPlaying) {
                                controller.pause()
                                isPlaying = false
                            } else {
                                controller.play()
                                isPlaying = true
                            }
                        }
                    }
                )
                BottomNavigation(activeTab = activeTab, onTabSelected = { selectTab(it) })
            }
        }

        if (!animePageOpen) currentSong?.let { expandedSong ->
            if (!expandedPlayer) return@let
                ExpandedNowPlaying(
                song = expandedSong,
                serverUrl = serverUrl,
                source = activeTab,
                favorite = expandedSong.id in favoriteIds,
                isPlaying = isPlaying,
                progressMs = progressMs,
                durationMs = durationMs,
                queue = recommendedSongs.ifEmpty { songs },
                currentIndex = currentIndex,
                shuffleEnabled = shuffleEnabled,
                repeatOne = repeatOne,
                onCollapse = { expandedPlayer = false },
                onToggleFavorite = { toggleFavorite(expandedSong.id) },
                onToggleShuffle = { shuffleEnabled = !shuffleEnabled },
                onToggleRepeat = { toggleRepeatOne() },
                onQueueSongClick = { song -> playSong(song, recommendedSongs.ifEmpty { songs }) },
                    onAddToQueue = { addToQueue(it) },
                    onShare = { shareSong(ctx, it) },
                    onAddToPlaylist = { addToDefaultPlaylist(it) },
                onPrevious = { playOffset(-1) },
                onNext = { playOffset(1) },
                onToggle = {
                    getController()?.let { controller ->
                        if (controller.isPlaying) {
                            controller.pause()
                            isPlaying = false
                        } else {
                            controller.play()
                            isPlaying = true
                        }
                    }
                },
                onSeek = { fraction ->
                    val target = (durationMs * fraction).toLong()
                    getController()?.seekTo(target)
                    progressMs = target
                }
            )
        }
    }
}

@Composable
private fun SpotifyTopBar(
    activeTab: String,
    songCount: Int,
    loading: Boolean,
    connected: Boolean,
    onVideoClick: () -> Unit,
    onRefresh: () -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    when (activeTab) {
                        "Home" -> "For you"
                        "Search" -> "Search"
                        else -> "Your library"
                    },
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White
                )
                IconButton(
                    onClick = onVideoClick,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape)
                        .background(Orange.copy(alpha = 0.18f))
                ) {
                    Icon(
                        imageVector = Icons.Default.OndemandVideo,
                        contentDescription = "Videos",
                        tint = Orange,
                        modifier = Modifier.size(21.dp)
                    )
                }
            }
            Text(
                "$songCount local tracks - Smart playback ready",
                color = MutedText,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        StatusDot(connected = connected)
        Spacer(modifier = Modifier.width(10.dp))
        IconCircleButton(
            icon = Icons.Default.Refresh,
            contentDescription = "Refresh library",
            enabled = !loading,
            onClick = onRefresh
        )
    }
}

@Composable
private fun HomeHero(
    songs: List<SongResponse>,
    serverUrl: String,
    loading: Boolean,
    status: String,
    onPlay: () -> Unit,
    onShuffle: () -> Unit,
    onScan: () -> Unit
) {
    val feature = songs.firstOrNull()
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color(0xFF202020), Color(0xFF101010)))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                AlbumArtwork(
                    coverUrl = feature?.let { coverUrl(serverUrl, it) },
                    title = feature?.title ?: "Streamify",
                    modifier = Modifier.size(86.dp)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text("Recommended now", color = Green, fontSize = 12.sp, fontWeight = FontWeight.Black)
                    Text(
                        feature?.title ?: "Your local mix",
                        color = Color.White,
                        fontSize = 21.sp,
                        lineHeight = 24.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        feature?.reason ?: feature?.artist ?: status,
                        color = MutedText,
                        maxLines = 2,
                        fontSize = 13.sp,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                IconCircleButton(
                    icon = Icons.Default.PlayArrow,
                    contentDescription = "Play recommended",
                    selected = true,
                    enabled = feature != null,
                    onClick = onPlay
                )
                Button(
                    onClick = onShuffle,
                    enabled = songs.isNotEmpty(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color.Black)
                ) {
                    Text("Shuffle", fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onScan,
                    enabled = !loading,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.11f), contentColor = Color.White)
                ) {
                    Text("Scan", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SearchPanel(
    query: String,
    loading: Boolean,
    status: String,
    songCount: Int,
    onQueryChange: (String) -> Unit,
    onScan: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SurfaceCard(
            modifier = Modifier.fillMaxWidth(),
            brush = Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0.14f), Color.White.copy(alpha = 0.07f)))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Default.Search, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    placeholder = { Text("Search songs, artists, albums") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SearchStat("Library", "$songCount tracks")
            SearchStat("Status", if (loading) "Scanning" else status.take(22))
        }
        Button(
            onClick = onScan,
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(46.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.11f), contentColor = Color.White)
        ) {
            Text("Refresh local index", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SearchStat(label: String, value: String) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Text(label, color = MutedText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(value, color = Color.White, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun LibraryHeader(
    selected: String,
    songCount: Int,
    albumCount: Int,
    likedCount: Int,
    recentCount: Int,
    onSelect: (String) -> Unit,
    onScan: () -> Unit,
    loading: Boolean
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("All", "Albums", "Liked", "Recent").forEach { label ->
                FilterPill(text = label, selected = selected == label, onClick = { onSelect(label) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            LibraryStat("Tracks", songCount.toString(), Modifier.weight(1f))
            LibraryStat("Albums", albumCount.toString(), Modifier.weight(1f))
            LibraryStat("Liked", likedCount.toString(), Modifier.weight(1f))
            LibraryStat("Recent", recentCount.toString(), Modifier.weight(1f))
        }
        Button(
            onClick = onScan,
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(46.dp),
            shape = RoundedCornerShape(10.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.10f), contentColor = Color.White)
        ) {
            Text(if (loading) "Updating library..." else "Scan for new music", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun LibraryStat(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(12.dp)
    ) {
        Text(value, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
        Text(label, color = MutedText, fontSize = 12.sp)
    }
}

@Composable
private fun AlbumCollectionRow(
    album: AlbumGroup,
    serverUrl: String,
    onPlay: () -> Unit
) {
    SurfaceCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay),
        brush = Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0.11f), Color.White.copy(alpha = 0.05f)))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            AlbumArtwork(
                coverUrl = albumCoverUrl(serverUrl, album),
                title = album.title,
                modifier = Modifier.size(76.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    album.title,
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    album.artist,
                    color = MutedText,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "${album.songs.size} track${if (album.songs.size == 1) "" else "s"}",
                    color = Orange,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
            IconCircleButton(
                icon = Icons.Default.PlayArrow,
                contentDescription = "Play album",
                selected = true,
                onClick = onPlay
            )
        }
    }
}

@Composable
private fun AnimeStreamingPage(
    serverUrl: String,
    series: List<VideoSeriesResponse>,
    loading: Boolean,
    error: String?,
    selectedSeries: VideoSeriesResponse?,
    selectedSeason: VideoSeasonResponse?,
    selectedEpisode: VideoEpisodeResponse?,
    continueWatching: List<VideoEpisodeResponse>,
    onClose: () -> Unit,
    onRefresh: () -> Unit,
    onSeriesSelected: (VideoSeriesResponse) -> Unit,
    onSeasonSelected: (VideoSeasonResponse) -> Unit,
    onEpisodeSelected: (VideoEpisodeResponse) -> Unit
) {
    val seasons = selectedSeries?.seasons.orEmpty().sortedBy { it.seasonNumber }
    val activeSeason = selectedSeason ?: seasons.firstOrNull()
    val selectedSeasonEpisodes = activeSeason?.episodes.orEmpty().sortedBy { it.episodeNumber }
    val nextEpisode = selectedEpisode?.let { current ->
        selectedSeasonEpisodes.getOrNull(selectedSeasonEpisodes.indexOfFirst { it.id == current.id } + 1)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF1B1008), Color(0xFF080808), Color.Black)))
    ) {
        if (selectedEpisode != null) {
            Column(modifier = Modifier.fillMaxSize()) {
                NetworkVideoPlayer(
                    serverUrl = serverUrl,
                    url = videoStreamUrl(serverUrl, selectedEpisode),
                    episode = selectedEpisode,
                    seriesTitle = selectedSeries?.title ?: "Now streaming",
                    nextEpisode = nextEpisode,
                    onEpisodeFinished = { next -> next?.let(onEpisodeSelected) }
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        selectedSeries?.title ?: "Now streaming",
                        color = Orange,
                        fontWeight = FontWeight.Black,
                        fontSize = 12.sp
                    )
                    Text(
                        selectedEpisode.title,
                        color = Color.White,
                        fontWeight = FontWeight.Black,
                        fontSize = 24.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        "S${selectedEpisode.seasonNumber} E${selectedEpisode.episodeNumber}",
                        color = MutedText,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    selectedEpisode.description?.takeIf { it.isNotBlank() }?.let {
                        Text(it, color = Color.White.copy(alpha = 0.74f), fontSize = 14.sp, lineHeight = 20.sp)
                    }
                    Button(
                        onClick = onClose,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color.Black)
                    ) {
                        Text("Back to Streamify", fontWeight = FontWeight.Black)
                    }
                }
            }
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, top = 18.dp, end = 16.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("STREAMIFY ANIME", color = Orange, fontSize = 12.sp, fontWeight = FontWeight.Black)
                        Text(
                            selectedSeries?.title ?: "Browse",
                            color = Color.White,
                            fontSize = 30.sp,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            if (selectedSeries == null) "Swipe left to return to music" else "Choose a season, then an episode",
                            color = MutedText,
                            fontSize = 13.sp
                        )
                    }
                    IconCircleButton(
                        icon = Icons.Default.KeyboardArrowDown,
                        contentDescription = "Close anime",
                        onClick = onClose
                    )
                }
            }

            if (selectedSeries == null) {
                if (continueWatching.isNotEmpty()) {
                    item {
                        ContinueWatchingRow(
                            serverUrl = serverUrl,
                            episodes = continueWatching,
                            onEpisodeSelected = onEpisodeSelected
                        )
                    }
                }
                item {
                    AnimeHero(onRefresh = onRefresh, loading = loading)
                }
                if (loading) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Orange)
                        }
                    }
                } else if (series.isEmpty()) {
                    item {
                        AnimeEmptyState(error = error)
                    }
                } else {
                    items(series, key = { it.id }) { item ->
                        AnimeSeriesCard(
                            serverUrl = serverUrl,
                            series = item,
                            onClick = { onSeriesSelected(item) }
                        )
                    }
                }
            } else {
                item {
                    AnimeSeriesHeader(serverUrl = serverUrl, series = selectedSeries)
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(seasons, key = { it.seasonNumber }) { season ->
                            FilterPill(
                                text = season.title ?: "Season ${season.seasonNumber}",
                                selected = activeSeason?.seasonNumber == season.seasonNumber,
                                onClick = { onSeasonSelected(season) }
                            )
                        }
                    }
                }
                val episodes = selectedSeasonEpisodes
                if (episodes.isEmpty()) {
                    item {
                        AnimeEmptyState(error = "No episodes found for this season yet.")
                    }
                } else {
                    items(episodes, key = { it.id }) { episode ->
                        AnimeEpisodeRow(
                            serverUrl = serverUrl,
                            episode = episode,
                            onClick = { onEpisodeSelected(episode) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AnimeHero(onRefresh: () -> Unit, loading: Boolean) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.horizontalGradient(listOf(Color(0xFF3B1704), Color(0xFF111111)))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(82.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Brush.linearGradient(listOf(Orange, Gold))),
                contentAlignment = Alignment.Center
            ) {
                Text("TV", color = Color.Black, fontSize = 28.sp, fontWeight = FontWeight.Black)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Network video library", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text(
                    "Series, seasons, and episodes will appear here after the server video scanner is added.",
                    color = MutedText,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
            IconCircleButton(
                icon = Icons.Default.Refresh,
                contentDescription = "Refresh videos",
                enabled = !loading,
                onClick = onRefresh
            )
        }
    }
}

@Composable
private fun ContinueWatchingRow(serverUrl: String, episodes: List<VideoEpisodeResponse>, onEpisodeSelected: (VideoEpisodeResponse) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Continue watching", "Saved on your Streamify server")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(episodes, key = { it.id }) { episode ->
                Column(
                    modifier = Modifier
                        .width(180.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White.copy(alpha = 0.08f))
                        .clickable { onEpisodeSelected(episode) }
                        .padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PosterImage(
                        imageUrl = videoImageUrl(serverUrl, episode.thumbnailPath),
                        title = episode.title,
                        modifier = Modifier.fillMaxWidth().height(96.dp),
                        rounded = 6
                    )
                    Text(episode.seriesTitle ?: "Series", color = Orange, fontSize = 11.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(episode.title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    CompactVideoSeekBar(
                        value = if ((episode.durationMs ?: 0L) > 0L) (episode.positionMs ?: 0L).toFloat() / (episode.durationMs ?: 1L).toFloat() else 0f,
                        onValueChange = {}
                    )
                }
            }
        }
    }
}

@Composable
private fun AnimeSeriesHeader(serverUrl: String, series: VideoSeriesResponse) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0.12f), Color.White.copy(alpha = 0.05f)))
    ) {
        Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            PosterImage(
                imageUrl = videoImageUrl(serverUrl, series.posterPath),
                title = series.title,
                modifier = Modifier.width(112.dp).height(158.dp)
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(series.title, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${series.seasons.size} season${if (series.seasons.size == 1) "" else "s"}", color = Orange, fontSize = 13.sp, fontWeight = FontWeight.Black)
                Text(series.description ?: "Ready to stream on your local network.", color = MutedText, fontSize = 13.sp, lineHeight = 19.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun AnimeSeriesCard(serverUrl: String, series: VideoSeriesResponse, onClick: () -> Unit) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        brush = Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.04f)))
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PosterImage(
                imageUrl = videoImageUrl(serverUrl, series.posterPath),
                title = series.title,
                modifier = Modifier.width(86.dp).height(122.dp)
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(series.title, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${series.seasons.size} season${if (series.seasons.size == 1) "" else "s"} available", color = Orange, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(series.description ?: "Tap to view seasons and episodes.", color = MutedText, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = Orange, modifier = Modifier.size(30.dp))
        }
    }
}

@Composable
private fun AnimeEpisodeRow(serverUrl: String, episode: VideoEpisodeResponse, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.07f))
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        PosterImage(
            imageUrl = videoImageUrl(serverUrl, episode.thumbnailPath),
            title = episode.title,
            modifier = Modifier.width(122.dp).height(70.dp),
            rounded = 6
        )
        Column(modifier = Modifier.weight(1f)) {
            Text("Episode ${episode.episodeNumber}", color = Orange, fontSize = 11.sp, fontWeight = FontWeight.Black)
            Text(episode.title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(formatDuration(episode.duration ?: 0.0), color = MutedText, fontSize = 12.sp)
        }
        IconCircleButton(
            icon = Icons.Default.PlayArrow,
            contentDescription = "Play episode",
            selected = true,
            onClick = onClick
        )
    }
}

@Composable
private fun AnimeEmptyState(error: String?) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.04f)))
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("No videos indexed", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Text(error ?: "Add server video scanning next and this page will populate automatically.", color = MutedText, fontSize = 14.sp, lineHeight = 20.sp)
        }
    }
}

@Composable
private fun PosterImage(imageUrl: String?, title: String, modifier: Modifier, rounded: Int = 8) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(rounded.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF3A2418), Color(0xFF111111))))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(rounded.dp)),
        contentAlignment = Alignment.Center
    ) {
        AsyncImage(
            model = imageUrl,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        if (imageUrl == null) {
            Text(title.take(1).uppercase(), color = Orange, fontSize = 28.sp, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun NetworkVideoPlayer(
    serverUrl: String,
    url: String,
    episode: VideoEpisodeResponse,
    seriesTitle: String,
    nextEpisode: VideoEpisodeResponse?,
    onEpisodeFinished: (VideoEpisodeResponse?) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE) }
    val resumeKey = "$PREF_VIDEO_PREFIX${episode.id}"
    var showResumePrompt by remember(url) { mutableStateOf(false) }
    var controlsVisible by remember { mutableStateOf(true) }
    var isPlaying by remember { mutableStateOf(true) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var volumeLevel by remember { mutableStateOf(prefs.getFloat("video_volume", 0.9f)) }
    var brightnessLevel by remember { mutableStateOf(1f) }
    var expanded by remember { mutableStateOf(false) }
    var playbackSpeed by remember { mutableStateOf(prefs.getFloat("video_speed", 1f)) }
    var resizeMode by remember { mutableIntStateOf(prefs.getInt("video_resize", AspectRatioFrameLayout.RESIZE_MODE_FIT)) }
    var languageLabel by remember { mutableStateOf(prefs.getString("video_language_label", "Auto") ?: "Auto") }
    var subtitlesEnabled by remember { mutableStateOf(prefs.getBoolean("video_subtitles", true)) }
    var autoplayEnabled by remember { mutableStateOf(prefs.getBoolean("video_autoplay", true)) }
    var locked by remember { mutableStateOf(false) }
    var audioBoost by remember { mutableStateOf(prefs.getBoolean("video_boost", false)) }
    var nightMode by remember { mutableStateOf(prefs.getBoolean("video_night", false)) }
    val speedOptions = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f, 2.5f, 3f)
    val resizeOptions = listOf(
        VideoResizeOption("Fit", AspectRatioFrameLayout.RESIZE_MODE_FIT),
        VideoResizeOption("Crop", AspectRatioFrameLayout.RESIZE_MODE_ZOOM),
        VideoResizeOption("Stretch", AspectRatioFrameLayout.RESIZE_MODE_FILL)
    )
    val languageOptions = listOf(
        "Auto" to null,
        "English" to "en",
        "Japanese" to "ja",
        "Tamil" to "ta",
        "Hindi" to "hi",
        "Korean" to "ko"
    )
    val player = remember(url) {
        val subtitle = videoSubtitleUrl(serverUrl, episode.subtitlePath)
        val mediaItemBuilder = MediaItem.Builder().setUri(url)
        if (subtitle != null) {
            val mimeType = if (subtitle.endsWith(".vtt", ignoreCase = true)) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP
            mediaItemBuilder.setSubtitleConfigurations(
                listOf(
                    MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle))
                        .setMimeType(mimeType)
                        .setLanguage(languageOptions.firstOrNull { it.first == languageLabel }?.second ?: "en")
                        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                        .build()
                )
            )
        }
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(mediaItemBuilder.build())
            prepare()
            volume = effectiveVideoVolume(volumeLevel, audioBoost, nightMode)
            playWhenReady = true
        }
    }

    LaunchedEffect(playbackSpeed, volumeLevel, audioBoost, nightMode, subtitlesEnabled) {
        player.setPlaybackSpeed(playbackSpeed)
        player.volume = effectiveVideoVolume(volumeLevel, audioBoost, nightMode)
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitlesEnabled)
            .build()
        prefs.edit()
            .putFloat("video_speed", playbackSpeed)
            .putFloat("video_volume", volumeLevel)
            .putBoolean("video_subtitles", subtitlesEnabled)
            .putBoolean("video_boost", audioBoost)
            .putBoolean("video_night", nightMode)
            .apply()
    }

    fun applyLanguage(label: String, code: String?) {
        languageLabel = label
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setPreferredAudioLanguage(code)
            .setPreferredTextLanguage(code)
            .build()
        prefs.edit().putString("video_language_label", label).putString("video_language_code", code).apply()
    }

    LaunchedEffect(url) {
        val savedPosition = prefs.getLong(resumeKey, 0L)
        val serverProgress = runCatching { createApi(serverUrl).getVideoEpisodeProgress(episode.id) }.getOrNull()
        val resumePosition = maxOf(savedPosition, serverProgress?.positionMs ?: 0L)
        if (resumePosition > 12_000L) {
            prefs.edit().putLong(resumeKey, resumePosition).apply()
            showResumePrompt = true
        }
    }

    LaunchedEffect(player) {
        var ticks = 0
        while (true) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            durationMs = player.duration.takeIf { it > 0L && it != C.TIME_UNSET } ?: 0L
            isPlaying = player.isPlaying
            if (positionMs > 5_000L && (durationMs == 0L || positionMs < durationMs - 8_000L)) {
                prefs.edit().putLong(resumeKey, positionMs).apply()
            }
            ticks++
            if (ticks % 10 == 0 && positionMs > 5_000L) {
                runCatching {
                    createApi(serverUrl).saveVideoEpisodeProgress(
                        episode.id,
                        VideoProgressRequest(positionMs = positionMs, durationMs = durationMs, completed = false)
                    )
                }
            }
            delay(500)
        }
    }

    DisposableEffect(player, autoplayEnabled, nextEpisode) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    prefs.edit().remove(resumeKey).apply()
                    scope.launch {
                        runCatching {
                            createApi(serverUrl).saveVideoEpisodeProgress(
                                episode.id,
                                VideoProgressRequest(positionMs = durationMs, durationMs = durationMs, completed = true)
                            )
                        }
                    }
                    if (autoplayEnabled && nextEpisode != null) onEpisodeFinished(nextEpisode)
                }
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    DisposableEffect(player) {
        onDispose {
            if (player.currentPosition > 5_000L) {
                prefs.edit().putLong(resumeKey, player.currentPosition).apply()
            }
            player.release()
        }
    }

    if (showResumePrompt) {
        AlertDialog(
            onDismissRequest = { showResumePrompt = false },
            title = { Text("Continue watching?") },
            text = { Text("${episode.title}\nResume from ${formatDuration(prefs.getLong(resumeKey, 0L) / 1000.0)}") },
            confirmButton = {
                TextButton(onClick = {
                    player.seekTo(prefs.getLong(resumeKey, 0L))
                    player.play()
                    showResumePrompt = false
                }) { Text("Continue") }
            },
            dismissButton = {
                TextButton(onClick = {
                    prefs.edit().remove(resumeKey).apply()
                    player.seekTo(0L)
                    player.play()
                    showResumePrompt = false
                }) { Text("Start over") }
            }
        )
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(240.dp)
            .background(Color.Black)
            .pointerInput(player, expanded, locked) {
                detectTapGestures(
                    onTap = { controlsVisible = !controlsVisible },
                    onDoubleTap = { offset ->
                        if (!locked) {
                            if (offset.x < size.width / 2f) {
                                player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L))
                            } else {
                                player.seekTo((player.currentPosition + 10_000L).coerceAtMost(durationMs.takeIf { it > 0L } ?: Long.MAX_VALUE))
                            }
                            controlsVisible = true
                        }
                    }
                )
            }
            .pointerInput(player, volumeLevel, brightnessLevel) {
                detectDragGestures { change, dragAmount ->
                    if (locked) return@detectDragGestures
                    change.consume()
                    if (kotlin.math.abs(dragAmount.y) > kotlin.math.abs(dragAmount.x)) {
                        if (change.position.x > size.width / 2f) {
                            volumeLevel = (volumeLevel - dragAmount.y / size.height).coerceIn(0f, 1f)
                            player.volume = volumeLevel
                        } else {
                            brightnessLevel = (brightnessLevel - dragAmount.y / size.height).coerceIn(0.35f, 1.35f)
                        }
                    } else {
                        player.seekTo((player.currentPosition + (dragAmount.x * 120).toLong()).coerceAtLeast(0L))
                    }
                    controlsVisible = true
                }
            }
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    this.player = player
                    useController = false
                    this.resizeMode = resizeMode
                }
            },
            update = {
                it.player = player
                it.resizeMode = resizeMode
            },
            modifier = Modifier.fillMaxSize()
        )
        if (brightnessLevel < 1f) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = (1f - brightnessLevel).coerceIn(0f, 0.65f)))
            )
        }
        if (controlsVisible) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.72f), Color.Transparent)))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(seriesTitle, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("S${episode.seasonNumber} E${episode.episodeNumber} - ${episode.title}", color = MutedText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconCircleButton(
                    icon = Icons.Default.Fullscreen,
                    contentDescription = "Fullscreen",
                    onClick = { expanded = true },
                    modifier = Modifier.size(44.dp)
                )
                IconCircleButton(
                    icon = Icons.Default.PictureInPictureAlt,
                    contentDescription = "Picture in picture",
                    onClick = { enterVideoPictureInPicture(context) },
                    modifier = Modifier.size(44.dp)
                )
                IconCircleButton(
                    icon = Icons.Default.Lock,
                    contentDescription = "Lock controls",
                    onClick = {
                        locked = true
                        controlsVisible = false
                    },
                    modifier = Modifier.size(44.dp)
                )
            }
        }
        if (locked) {
            IconCircleButton(
                icon = Icons.Default.Lock,
                contentDescription = "Unlock controls",
                onClick = {
                    locked = false
                    controlsVisible = true
                },
                modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).size(44.dp)
            )
        }
        if (controlsVisible) {
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.88f))))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(seriesTitle, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("S${episode.seasonNumber} E${episode.episodeNumber} • ${episode.title}", color = MutedText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                CompactVideoSeekBar(
                    value = if (durationMs > 0L) positionMs.toFloat() / durationMs.toFloat() else 0f,
                    onValueChange = { ratio ->
                        if (durationMs > 0L) player.seekTo((durationMs * ratio).toLong())
                    }
                )
                Box(modifier = Modifier.fillMaxWidth().height(52.dp), contentAlignment = Alignment.Center) {
                    Text(formatDuration(positionMs / 1000.0), color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterStart).width(52.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconCircleButton(icon = Icons.Default.SkipPrevious, contentDescription = "Back 10 seconds", onClick = { player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L)) }, modifier = Modifier.size(44.dp))
                        IconCircleButton(
                            icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            selected = true,
                            onClick = {
                                if (player.isPlaying) player.pause() else player.play()
                                isPlaying = player.isPlaying
                            },
                            modifier = Modifier.size(52.dp)
                        )
                        IconCircleButton(icon = Icons.Default.SkipNext, contentDescription = "Forward 10 seconds", onClick = { player.seekTo((player.currentPosition + 10_000L).coerceAtMost(durationMs.takeIf { it > 0L } ?: Long.MAX_VALUE)) }, modifier = Modifier.size(44.dp))
                    }
                    Text(formatDuration(durationMs / 1000.0), color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterEnd).width(52.dp))
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    VideoLevelChip(icon = Icons.Default.VolumeUp, text = "${(volumeLevel * 100).toInt()}%")
                    Spacer(modifier = Modifier.width(12.dp))
                    VideoLevelChip(icon = Icons.Default.Brightness6, text = "${(brightnessLevel * 100).toInt()}%")
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    VideoOptionMenu(
                        label = "${formatSpeed(playbackSpeed)}x",
                        options = speedOptions.map { "${formatSpeed(it)}x" },
                        onSelect = { selected ->
                            playbackSpeed = selected.removeSuffix("x").toFloatOrNull() ?: playbackSpeed
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    VideoOptionMenu(
                        label = resizeOptions.firstOrNull { it.mode == resizeMode }?.label ?: "Fit",
                        options = resizeOptions.map { it.label },
                        onSelect = { selected ->
                            resizeMode = resizeOptions.firstOrNull { it.label == selected }?.mode ?: resizeMode
                            prefs.edit().putInt("video_resize", resizeMode).apply()
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    VideoOptionMenu(
                        label = languageLabel,
                        options = languageOptions.map { it.first },
                        onSelect = { selected ->
                            val option = languageOptions.firstOrNull { it.first == selected }
                            applyLanguage(option?.first ?: "Auto", option?.second)
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    VideoOptionMenu(
                        label = if (subtitlesEnabled) "Subs on" else "Subs off",
                        options = listOf("Subs on", "Subs off"),
                        onSelect = { subtitlesEnabled = it == "Subs on" }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    VideoOptionMenu(
                        label = if (autoplayEnabled) "Autoplay" else "Manual",
                        options = listOf("Autoplay", "Manual"),
                        onSelect = {
                            autoplayEnabled = it == "Autoplay"
                            prefs.edit().putBoolean("video_autoplay", autoplayEnabled).apply()
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    VideoOptionMenu(
                        label = if (audioBoost) "Boost" else if (nightMode) "Night" else "Audio",
                        options = listOf("Audio", "Boost", "Night"),
                        onSelect = {
                            audioBoost = it == "Boost"
                            nightMode = it == "Night"
                        }
                    )
                }
            }
        }
    }

    if (expanded) {
        Dialog(
            onDismissRequest = { expanded = false },
            properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
                    .pointerInput(player, expanded, locked) {
                        detectTapGestures(
                            onTap = { controlsVisible = !controlsVisible },
                            onDoubleTap = { offset ->
                                if (!locked) {
                                    if (offset.x < size.width / 2f) {
                                        player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L))
                                    } else {
                                        player.seekTo((player.currentPosition + 10_000L).coerceAtMost(durationMs.takeIf { it > 0L } ?: Long.MAX_VALUE))
                                    }
                                    controlsVisible = true
                                }
                            }
                        )
                    }
            ) {
                AndroidView(
                    factory = { viewContext ->
                        PlayerView(viewContext).apply {
                            this.player = player
                            useController = false
                            this.resizeMode = resizeMode
                        }
                    },
                    update = {
                        it.player = player
                        it.resizeMode = resizeMode
                    },
                    modifier = Modifier.fillMaxSize()
                )
                if (brightnessLevel < 1f) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = (1f - brightnessLevel).coerceIn(0f, 0.65f)))
                    )
                }
                if (controlsVisible) {
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.78f), Color.Transparent)))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(seriesTitle, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("S${episode.seasonNumber} E${episode.episodeNumber} - ${episode.title}", color = MutedText, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconCircleButton(
                            icon = Icons.Default.FullscreenExit,
                            contentDescription = "Exit fullscreen",
                            onClick = { expanded = false },
                            modifier = Modifier.size(44.dp)
                        )
                        IconCircleButton(
                            icon = Icons.Default.PictureInPictureAlt,
                            contentDescription = "Picture in picture",
                            onClick = { enterVideoPictureInPicture(context) },
                            modifier = Modifier.size(44.dp)
                        )
                        IconCircleButton(
                            icon = Icons.Default.Lock,
                            contentDescription = "Lock controls",
                            onClick = {
                                locked = true
                                controlsVisible = false
                            },
                            modifier = Modifier.size(44.dp)
                        )
                    }
                    if (locked) {
                        IconCircleButton(
                            icon = Icons.Default.Lock,
                            contentDescription = "Unlock controls",
                            onClick = {
                                locked = false
                                controlsVisible = true
                            },
                            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp).size(44.dp)
                        )
                    }
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.92f))))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        CompactVideoSeekBar(
                            value = if (durationMs > 0L) positionMs.toFloat() / durationMs.toFloat() else 0f,
                            onValueChange = { ratio ->
                                if (durationMs > 0L) player.seekTo((durationMs * ratio).toLong())
                            }
                        )
                        Box(modifier = Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
                            Text(formatDuration(positionMs / 1000.0), color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterStart).width(52.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                IconCircleButton(icon = Icons.Default.SkipPrevious, contentDescription = "Back 10 seconds", onClick = { player.seekTo((player.currentPosition - 10_000L).coerceAtLeast(0L)) }, modifier = Modifier.size(46.dp))
                                IconCircleButton(
                                    icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                    contentDescription = if (isPlaying) "Pause" else "Play",
                                    selected = true,
                                    onClick = {
                                        if (player.isPlaying) player.pause() else player.play()
                                        isPlaying = player.isPlaying
                                    },
                                    modifier = Modifier.size(56.dp)
                                )
                                IconCircleButton(icon = Icons.Default.SkipNext, contentDescription = "Forward 10 seconds", onClick = { player.seekTo((player.currentPosition + 10_000L).coerceAtMost(durationMs.takeIf { it > 0L } ?: Long.MAX_VALUE)) }, modifier = Modifier.size(46.dp))
                            }
                            Text(formatDuration(durationMs / 1000.0), color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterEnd).width(52.dp))
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            VideoOptionMenu(
                                label = "${formatSpeed(playbackSpeed)}x",
                                options = speedOptions.map { "${formatSpeed(it)}x" },
                                onSelect = { selected ->
                                    playbackSpeed = selected.removeSuffix("x").toFloatOrNull() ?: playbackSpeed
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            VideoOptionMenu(
                                label = resizeOptions.firstOrNull { it.mode == resizeMode }?.label ?: "Fit",
                                options = resizeOptions.map { it.label },
                                onSelect = { selected ->
                                    resizeMode = resizeOptions.firstOrNull { it.label == selected }?.mode ?: resizeMode
                                    prefs.edit().putInt("video_resize", resizeMode).apply()
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            VideoOptionMenu(
                                label = languageLabel,
                                options = languageOptions.map { it.first },
                                onSelect = { selected ->
                                    val option = languageOptions.firstOrNull { it.first == selected }
                                    applyLanguage(option?.first ?: "Auto", option?.second)
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            VideoOptionMenu(
                                label = if (subtitlesEnabled) "Subs on" else "Subs off",
                                options = listOf("Subs on", "Subs off"),
                                onSelect = { subtitlesEnabled = it == "Subs on" }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            VideoOptionMenu(
                                label = if (autoplayEnabled) "Autoplay" else "Manual",
                                options = listOf("Autoplay", "Manual"),
                                onSelect = {
                                    autoplayEnabled = it == "Autoplay"
                                    prefs.edit().putBoolean("video_autoplay", autoplayEnabled).apply()
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            VideoOptionMenu(
                                label = if (audioBoost) "Boost" else if (nightMode) "Night" else "Audio",
                                options = listOf("Audio", "Boost", "Night"),
                                onSelect = {
                                    audioBoost = it == "Boost"
                                    nightMode = it == "Night"
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VideoLevelChip(icon: ImageVector, text: String) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(icon, contentDescription = null, tint = MutedText, modifier = Modifier.size(15.dp))
        Text(text, color = MutedText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

private data class VideoResizeOption(val label: String, val mode: Int)

@Composable
private fun VideoOptionMenu(label: String, options: List<String>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(
            onClick = { expanded = true },
            modifier = Modifier
                .height(34.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.12f)),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp)
        ) {
            Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option, fontWeight = if (option == label) FontWeight.Black else FontWeight.Normal) },
                    onClick = {
                        expanded = false
                        onSelect(option)
                    }
                )
            }
        }
    }
}

@Composable
private fun CompactVideoSeekBar(value: Float, onValueChange: (Float) -> Unit) {
    var widthPx by remember { mutableIntStateOf(1) }
    val progress = value.coerceIn(0f, 1f)
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(18.dp)
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .pointerInput(widthPx) {
                detectTapGestures { offset ->
                    onValueChange((offset.x / widthPx.toFloat()).coerceIn(0f, 1f))
                }
            },
        contentAlignment = Alignment.CenterStart
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.20f))
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(progress)
                .height(3.dp)
                .clip(CircleShape)
                .background(Orange)
        )
        Box(
            modifier = Modifier
                .padding(start = ((maxWidth - 10.dp) * progress).coerceAtLeast(0.dp))
                .size(10.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
    }
}

private fun formatSpeed(value: Float): String {
    return if (value % 1f == 0f) value.toInt().toString() else value.toString()
}

@Composable
private fun QuickMixes(songs: List<SongResponse>, serverUrl: String, onSongClick: (SongResponse) -> Unit) {
    val mixes = songs.take(6)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Personalized picks", "Updated from your listening")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (mixes.isEmpty()) {
                items(listOf("Smart Mix", "Liked rotation", "Recently played")) { title ->
                    MixTile(title = title, subtitle = "Scan to populate", coverUrl = null, onClick = {})
                }
            } else {
                items(mixes, key = { it.id }) { song ->
                    MixTile(
                        title = song.title,
                        subtitle = song.reason ?: song.artist,
                        coverUrl = coverUrl(serverUrl, song),
                        onClick = { onSongClick(song) }
                    )
                }
            }
        }
    }
}

@Composable
private fun MixTile(title: String, subtitle: String, coverUrl: String?, onClick: () -> Unit) {
    Column(modifier = Modifier.width(132.dp).clickable(onClick = onClick)) {
        AlbumArtwork(coverUrl = coverUrl, title = title, modifier = Modifier.fillMaxWidth().aspectRatio(1f))
        Spacer(modifier = Modifier.height(8.dp))
        Text(title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Text(subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MutedText, fontSize = 12.sp)
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(title, modifier = Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Black)
        Text(subtitle, color = MutedText, fontSize = 12.sp)
    }
}

@Composable
private fun TrackRow(
    song: SongResponse,
    serverUrl: String,
    selected: Boolean,
    favorite: Boolean,
    onClick: () -> Unit,
    onFavorite: () -> Unit,
    onAddToQueue: (SongResponse) -> Unit,
    onShare: (SongResponse) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (selected) Color.White.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AlbumArtwork(
            coverUrl = coverUrl(serverUrl, song),
            title = song.title,
            modifier = Modifier.size(56.dp)
        )
        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
            Text(
                song.title,
                color = if (selected) Green else Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${song.artist} - ${song.album}",
                color = MutedText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 13.sp
            )
        }
        Text(formatDuration(song.duration), color = MutedText, fontSize = 12.sp)
        Spacer(modifier = Modifier.width(8.dp))
        IconButton(
            onClick = onFavorite,
            modifier = Modifier.size(42.dp)
        ) {
            Icon(
                imageVector = if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                contentDescription = "Favorite",
                tint = if (favorite) Green else MutedText,
                modifier = Modifier.size(24.dp)
            )
        }
        var menuExpanded by remember { mutableStateOf(false) }
        val context = LocalContext.current
        IconCircleButton(
            icon = Icons.Default.MoreVert,
            contentDescription = "More",
            selected = false,
            enabled = true,
            onClick = { menuExpanded = true },
            modifier = Modifier.size(42.dp)
        )
        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
            DropdownMenuItem(
                text = {
                    Column {
                        Text("Share", fontWeight = FontWeight.Bold)
                        Text("Send track link", color = MutedText, fontSize = 12.sp)
                    }
                },
                leadingIcon = { Icon(Icons.Default.Share, contentDescription = null, tint = MutedText) },
                onClick = {
                    menuExpanded = false
                    onShare(song)
                }
            )
            DropdownMenuItem(
                text = {
                    Column {
                        Text(if (favorite) "Remove from Liked" else "Add to Liked Songs", fontWeight = FontWeight.Bold)
                        Text("Save to your liked list", color = MutedText, fontSize = 12.sp)
                    }
                },
                leadingIcon = { Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = null, tint = if (favorite) Green else MutedText) },
                onClick = {
                    menuExpanded = false
                    onFavorite()
                }
            )
            DropdownMenuItem(
                text = {
                    Column {
                        Text("Add to queue", fontWeight = FontWeight.Bold)
                        Text("Play after current list", color = MutedText, fontSize = 12.sp)
                    }
                },
                leadingIcon = { Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = null, tint = MutedText) },
                onClick = {
                    menuExpanded = false
                    onAddToQueue(song)
                }
            )
            DropdownMenuItem(
                text = { Text("Go to album", fontWeight = FontWeight.Bold) },
                leadingIcon = { Icon(Icons.Default.LibraryMusic, contentDescription = null, tint = MutedText) },
                onClick = {
                    menuExpanded = false
                    val intent = Intent(Intent.ACTION_SEARCH).apply { putExtra("query", song.album) }
                    try { context.startActivity(intent) } catch (_: Exception) {}
                }
            )
            DropdownMenuItem(
                text = { Text("Go to artists", fontWeight = FontWeight.Bold) },
                leadingIcon = { Icon(Icons.Default.Headphones, contentDescription = null, tint = MutedText) },
                onClick = {
                    menuExpanded = false
                    val intent = Intent(Intent.ACTION_SEARCH).apply { putExtra("query", song.artist) }
                    try { context.startActivity(intent) } catch (_: Exception) {}
                }
            )
        }
    }
}

@Composable
private fun CompactTrackRow(
    song: SongResponse,
    serverUrl: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AlbumArtwork(
            coverUrl = coverUrl(serverUrl, song),
            title = song.title,
            modifier = Modifier.size(46.dp)
        )
        Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
            Text(song.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
            Text(song.artist, color = MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp)
        }
        Icon(
            imageVector = Icons.Default.PlayArrow,
            contentDescription = null,
            tint = MutedText,
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
private fun MiniPlayer(
    song: SongResponse?,
    serverUrl: String,
    isPlaying: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onExpand: () -> Unit,
    onToggle: () -> Unit
) {
    SurfaceCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = song != null, onClick = onExpand),
        brush = Brush.horizontalGradient(listOf(Color(0xFF2A1712), Color(0xFF101010)))
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            AlbumArtwork(
                coverUrl = song?.let { coverUrl(serverUrl, it) },
                title = song?.title ?: "Streamify",
                modifier = Modifier.size(48.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    song?.title ?: "Choose a track",
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.Bold
                )
                Text(song?.artist ?: "Streamify is ready", color = MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconCircleButton(
                icon = Icons.Default.SkipPrevious,
                contentDescription = "Previous",
                enabled = song != null,
                onClick = onPrevious
            )
            IconCircleButton(
                icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Play",
                selected = true,
                enabled = song != null,
                onClick = onToggle
            )
            IconCircleButton(
                icon = Icons.Default.SkipNext,
                contentDescription = "Next",
                enabled = song != null,
                onClick = onNext
            )
        }
    }
}

@Composable
private fun ExpandedNowPlaying(
    song: SongResponse?,
    serverUrl: String,
    source: String,
    favorite: Boolean,
    isPlaying: Boolean,
    progressMs: Long,
    durationMs: Long,
    queue: List<SongResponse>,
    currentIndex: Int,
    shuffleEnabled: Boolean,
    repeatOne: Boolean,
    onCollapse: () -> Unit,
    onToggleFavorite: () -> Unit,
    onToggleShuffle: () -> Unit,
    onToggleRepeat: () -> Unit,
    onQueueSongClick: (SongResponse) -> Unit,
    onAddToQueue: (SongResponse) -> Unit,
    onShare: (SongResponse) -> Unit,
    onAddToPlaylist: (SongResponse) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToggle: () -> Unit,
    onSeek: (Float) -> Unit
) {
    val track = song ?: return
    val context = LocalContext.current
    var backgroundColors by remember {
        mutableStateOf(listOf(Color(0xFF496D62), Color(0xFF17201D), Color(0xFF060707)))
    }
    var activeInfoTab by remember { mutableStateOf("Suggestions") }
    var lyrics by remember(track.id) { mutableStateOf<String?>(null) }
    var lyricsError by remember(track.id) { mutableStateOf<String?>(null) }
    var loadingLyrics by remember(track.id) { mutableStateOf(false) }
    val progress = if (durationMs > 0L) {
        (progressMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    val cover = coverUrl(serverUrl, track)
    val upcoming = queue.drop((currentIndex + 1).coerceAtLeast(0)).take(4)

    LaunchedEffect(cover) {
        backgroundColors = extractCoverGradient(context, cover)
    }

    LaunchedEffect(track.id, activeInfoTab) {
        if (activeInfoTab != "Lyrics" || lyrics != null || loadingLyrics) return@LaunchedEffect
        loadingLyrics = true
        lyricsError = null
        runCatching { createApi(serverUrl).getLyrics(track.id).lyrics }
            .onSuccess { lyrics = it }
            .onFailure { lyricsError = "Lyrics are not available right now." }
        loadingLyrics = false
    }

    fun shareTrack() {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, track.title)
            putExtra(Intent.EXTRA_TEXT, "${track.title} - ${track.artist}")
        }
        context.startActivity(Intent.createChooser(sendIntent, "Share track"))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(backgroundColors))
            .padding(horizontal = 22.dp, vertical = 20.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconCircleButton(
                    icon = Icons.Default.KeyboardArrowDown,
                    contentDescription = "Collapse player",
                    onClick = onCollapse
                )
                Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "PLAYING FROM ${source.uppercase()}",
                        color = Color.White.copy(alpha = 0.78f),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        sourceLabel(source),
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                var moreExpanded by remember { mutableStateOf(false) }
                IconCircleButton(
                    icon = Icons.Default.MoreVert,
                    contentDescription = "More options",
                    onClick = { moreExpanded = true }
                )
                val ctx = LocalContext.current
                DropdownMenu(expanded = moreExpanded, onDismissRequest = { moreExpanded = false }) {
                    DropdownMenuItem(text = { Text("Share") }, onClick = {
                        moreExpanded = false
                        onShare(track)
                    })
                    DropdownMenuItem(text = { Text("Add to Liked Songs") }, onClick = {
                        moreExpanded = false
                        onToggleFavorite()
                    })
                    DropdownMenuItem(text = { Text("Add to playlist") }, onClick = {
                        moreExpanded = false
                        onAddToPlaylist(track)
                    })
                    DropdownMenuItem(text = { Text("Add to Queue") }, onClick = {
                        moreExpanded = false
                        onAddToQueue(track)
                    })
                    DropdownMenuItem(text = { Text("View song credits") }, onClick = {
                        moreExpanded = false
                        // no-op credits view for now
                    })
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 2.dp, bottom = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                AlbumArtwork(
                    coverUrl = cover,
                    title = track.title,
                    modifier = Modifier
                        .fillMaxWidth(0.88f)
                        .aspectRatio(1f)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        track.title,
                        color = Color.White,
                        fontSize = 27.sp,
                        lineHeight = 32.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        "${track.artist}, ${track.album}",
                        color = Color.White.copy(alpha = 0.72f),
                        fontSize = 18.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconCircleButton(
                    icon = if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    contentDescription = "Favorite",
                    selected = favorite,
                    onClick = onToggleFavorite
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Headphones,
                    contentDescription = null,
                    tint = Green,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Local Audio Link Active", color = Green, modifier = Modifier.weight(1f), fontSize = 14.sp)
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.10f))
                        .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape)
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                ) {
                    Text(track.album.uppercase().take(24), color = MutedText, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }

            TrackSeekBar(progress = progress, onSeek = onSeek)

            Row(modifier = Modifier.fillMaxWidth()) {
                Text(formatMillis(progressMs), color = MutedText, modifier = Modifier.weight(1f))
                Text(formatMillis(durationMs), color = MutedText)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconPlainButton(
                    icon = Icons.Default.Shuffle,
                    contentDescription = "Shuffle",
                    selected = shuffleEnabled,
                    onClick = onToggleShuffle
                )
                IconPlainButton(Icons.Default.SkipPrevious, "Previous", onClick = onPrevious)
                IconCircleButton(
                    icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    selected = true,
                    large = true,
                    onClick = onToggle
                )
                IconPlainButton(Icons.Default.SkipNext, "Next", onClick = onNext)
                IconPlainButton(
                    icon = if (repeatOne) Icons.Default.RepeatOne else Icons.Default.Repeat,
                    contentDescription = "Repeat",
                    selected = repeatOne,
                    onClick = onToggleRepeat
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Headphones,
                    contentDescription = null,
                    tint = Green,
                    modifier = Modifier.size(19.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Headphones ready", color = Green, modifier = Modifier.weight(1f), fontSize = 14.sp)
                IconPlainButton(Icons.Default.Share, "Share", onClick = { shareTrack() })
                IconPlainButton(
                    icon = Icons.AutoMirrored.Filled.QueueMusic,
                    contentDescription = "Suggestions",
                    selected = activeInfoTab == "Suggestions",
                    onClick = { activeInfoTab = "Suggestions" }
                )
            }

            PlayerInfoTabs(activeTab = activeInfoTab, onTabSelected = { activeInfoTab = it })

            when (activeInfoTab) {
                "Lyrics" -> LyricsPanel(
                    lyrics = lyrics,
                    loading = loadingLyrics,
                    error = lyricsError
                )
                "Artist" -> ArtistDetailsCard(
                    artist = primaryArtist(track.artist),
                    album = track.album,
                    serverUrl = serverUrl
                )
                else -> QueuePreview(
                    title = "Song suggestions",
                    songs = upcoming.ifEmpty { queue.filterNot { it.id == track.id }.take(6) },
                    serverUrl = serverUrl,
                    onSongClick = onQueueSongClick
                )
            }

            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}

@Composable
private fun TrackSeekBar(progress: Float, onSeek: (Float) -> Unit) {
    var widthPx by remember { mutableIntStateOf(1) }
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp)
            .onSizeChanged { widthPx = it.width.coerceAtLeast(1) }
            .pointerInput(widthPx) {
                detectTapGestures { offset ->
                    onSeek((offset.x / widthPx.toFloat()).coerceIn(0f, 1f))
                }
            },
        contentAlignment = Alignment.CenterStart
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.18f))
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(progress)
                .height(4.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
        Box(
            modifier = Modifier
                .padding(start = ((maxWidth - 14.dp) * progress).coerceAtLeast(0.dp))
                .size(14.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
    }
}

@Composable
private fun ArtistDetailsCard(artist: String, album: String, serverUrl: String) {
    val photoUrl = artistPhotoUrl(serverUrl, artist)
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0.13f), Color.White.copy(alpha = 0.06f)))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            ArtistAvatar(
                artist = artist,
                photoUrl = photoUrl,
                modifier = Modifier.size(62.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text("Artist", color = MutedText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(
                    artist,
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 20.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "Appears on $album",
                    color = Color.White.copy(alpha = 0.70f),
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                imageVector = Icons.Default.Headphones,
                contentDescription = null,
                tint = Green,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
private fun PlayerInfoTabs(activeTab: String, onTabSelected: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        listOf("Suggestions", "Lyrics", "Artist").forEach { tab ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(11.dp))
                    .background(if (activeTab == tab) Color.White.copy(alpha = 0.18f) else Color.Transparent)
                    .clickable { onTabSelected(tab) }
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    tab,
                    color = if (activeTab == tab) Color.White else MutedText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun LyricsPanel(lyrics: String?, loading: Boolean, error: String?) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.12f), Color.White.copy(alpha = 0.06f)))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Lyrics", color = Color.White, fontWeight = FontWeight.Black, fontSize = 17.sp)
            Text(
                text = when {
                    loading -> "Loading lyrics..."
                    error != null -> error
                    lyrics.isNullOrBlank() -> "No lyrics found for this track."
                    else -> lyrics.lines()
                        .filter { it.isNotBlank() }
                        .joinToString("\n") { line -> line.replace(Regex("^\\[[^]]+]\\s*"), "") }
                },
                color = Color.White.copy(alpha = 0.78f),
                fontSize = 15.sp,
                lineHeight = 23.sp
            )
        }
    }
}

@Composable
private fun ArtistAvatar(artist: String, photoUrl: String, modifier: Modifier = Modifier) {
    var photoLoaded by remember(photoUrl) { mutableStateOf(false) }
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.24f), Color.White.copy(alpha = 0.08f))))
            .border(1.dp, Color.White.copy(alpha = 0.14f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        AsyncImage(
            model = photoUrl,
            contentDescription = artist,
            contentScale = ContentScale.Crop,
            onSuccess = { photoLoaded = true },
            onError = { photoLoaded = false },
            modifier = Modifier.fillMaxSize()
        )
        if (!photoLoaded) {
            Text(
                artist.take(1).uppercase(),
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun QueuePreview(
    title: String,
    songs: List<SongResponse>,
    serverUrl: String,
    onSongClick: (SongResponse) -> Unit
) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.12f), Color.White.copy(alpha = 0.06f)))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = Color.White, fontWeight = FontWeight.Black, fontSize = 17.sp)
            songs.take(6).forEach { song ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { onSongClick(song) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AlbumArtwork(
                        coverUrl = coverUrl(serverUrl, song),
                        title = song.title,
                        modifier = Modifier.size(40.dp)
                    )
                    Column(modifier = Modifier.padding(start = 10.dp).weight(1f)) {
                        Text(song.title, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                        Text(song.artist, color = MutedText, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp)
                    }
                    Text(formatDuration(song.duration), color = MutedText, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun IconCircleButton(
    icon: ImageVector,
    contentDescription: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    large: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val size = if (large) 70.dp else 48.dp
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                when {
                    selected -> Green
                    enabled -> Color.White.copy(alpha = 0.12f)
                    else -> Color.White.copy(alpha = 0.04f)
                }
            )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (selected) Color.Black else Color.White,
            modifier = Modifier.size(if (large) 36.dp else 25.dp)
        )
    }
}

@Composable
private fun IconPlainButton(
    icon: ImageVector,
    contentDescription: String,
    selected: Boolean = false,
    onClick: () -> Unit
) {
    IconButton(onClick = onClick, modifier = Modifier.size(48.dp)) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (selected) Green else Color.White,
            modifier = Modifier.size(28.dp)
        )
    }
}

@Composable
private fun BottomNavigation(activeTab: String, onTabSelected: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color.Black.copy(alpha = 0.96f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp))
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        listOf("Home", "Search", "Library").forEach { tab ->
            NavItem(label = tab, selected = activeTab == tab, onClick = { onTabSelected(tab) })
        }
    }
}

@Composable
private fun NavItem(label: String, selected: Boolean, onClick: () -> Unit) {
    val icon = when (label) {
        "Home" -> Icons.Default.Home
        "Search" -> Icons.Default.Search
        else -> Icons.Default.LibraryMusic
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) Color.White.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = if (selected) Green else MutedText,
            modifier = Modifier.size(21.dp)
        )
        Text(label, color = if (selected) Color.White else MutedText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun FilterPill(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.09f))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp)
    ) {
        Text(
            text,
            color = if (selected) Color.Black else Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun CircleTextButton(
    text: String,
    selected: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(
                when {
                    selected -> Green
                    enabled -> Color.White.copy(alpha = 0.12f)
                    else -> Color.White.copy(alpha = 0.04f)
                }
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text,
            color = if (selected) Color.Black else if (enabled) Color.White else MutedText.copy(alpha = 0.5f),
            fontWeight = FontWeight.Black,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun StatusDot(connected: Boolean) {
    Box(
        modifier = Modifier
            .size(12.dp)
            .clip(CircleShape)
            .background(if (connected) Green else ErrorColor)
    )
}

@Composable
private fun EmptyLibrary(message: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(84.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Brush.linearGradient(listOf(OrangeDeep, Orange, Gold))),
            contentAlignment = Alignment.Center
        ) {
            Text("S", color = Color.Black, fontSize = 40.sp, fontWeight = FontWeight.Black)
        }
        Text("Nothing playing here", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(message, color = MutedText)
    }
}

@Composable
private fun ConnectionRecoveryCard(
    serverInput: String,
    error: String,
    loading: Boolean,
    onServerInputChange: (String) -> Unit,
    onSave: () -> Unit
) {
    SurfaceCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color(0xFF22110B), Color(0xFF151515)))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Server connection needed", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(error, color = ErrorColor, fontSize = 13.sp)
            OutlinedTextField(
                value = serverInput,
                onValueChange = onServerInputChange,
                label = { Text("Server URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = onSave,
                enabled = !loading,
                colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color.Black)
            ) {
                Text("Connect", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AlbumArtwork(coverUrl: String?, title: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF2A2A2A), Color(0xFF0F0F0F))))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center
    ) {
        AsyncImage(
            model = coverUrl,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        if (coverUrl == null) {
            Text(
                title.take(1).uppercase(),
                color = Orange,
                fontWeight = FontWeight.Black,
                fontSize = 28.sp
            )
        }
    }
}

@Composable
private fun SurfaceCard(
    modifier: Modifier = Modifier,
    brush: Brush,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.border(
            width = 1.dp,
            brush = Brush.linearGradient(listOf(Color.White.copy(alpha = 0.14f), Color.Transparent)),
            shape = RoundedCornerShape(18.dp)
        ),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(18.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(brush)
        ) {
            content()
        }
    }
}

private fun coverUrl(serverUrl: String, song: SongResponse): String? {
    val cover = song.coverArtPath ?: return null
    return if (cover.startsWith("http")) cover else "${normalizeServerUrl(serverUrl)}$cover"
}

private fun albumCoverUrl(serverUrl: String, album: AlbumGroup): String? {
    val cover = album.coverArtPath ?: return null
    return if (cover.startsWith("http")) cover else "${normalizeServerUrl(serverUrl)}$cover"
}

private fun albumKey(song: SongResponse): String {
    return "${normalizeCollectionName(song.album)}::${normalizeCollectionName(song.artist)}"
}

private fun normalizeCollectionName(value: String): String {
    return value.trim()
        .lowercase()
        .replace(Regex("\\s+"), " ")
        .ifBlank { "unknown" }
}

private fun videoImageUrl(serverUrl: String, path: String?): String? {
    val imagePath = path?.takeIf { it.isNotBlank() } ?: return null
    return if (imagePath.startsWith("http")) imagePath else "${normalizeServerUrl(serverUrl)}$imagePath"
}

private fun videoStreamUrl(serverUrl: String, episode: VideoEpisodeResponse): String {
    val path = episode.streamPath
    return when {
        !path.isNullOrBlank() && path.startsWith("http") -> path
        !path.isNullOrBlank() -> "${normalizeServerUrl(serverUrl)}$path"
        else -> "${normalizeServerUrl(serverUrl)}/api/videos/episodes/${episode.id}/stream"
    }
}

private fun videoSubtitleUrl(serverUrl: String, path: String?): String? {
    val subtitlePath = path?.takeIf { it.isNotBlank() } ?: return null
    return if (subtitlePath.startsWith("http")) subtitlePath else "${normalizeServerUrl(serverUrl)}$subtitlePath"
}

private fun effectiveVideoVolume(volume: Float, boost: Boolean, night: Boolean): Float {
    val boosted = if (boost) volume * 1.7f else volume
    val nightAdjusted = if (night) boosted.coerceAtMost(0.65f) else boosted
    return nightAdjusted.coerceIn(0f, 2f)
}

private fun enterVideoPictureInPicture(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val activity = context as? Activity ?: return
    val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(16, 9))
        .build()
    activity.enterPictureInPictureMode(params)
}

private fun artistPhotoUrl(serverUrl: String, artist: String): String {
    val encoded = URLEncoder.encode(artist, Charsets.UTF_8.name())
    return "${normalizeServerUrl(serverUrl)}/api/artist-photo/$encoded"
}

private fun primaryArtist(artist: String): String {
    return artist.split(",", "&", " feat. ", " ft. ")
        .firstOrNull()
        ?.trim()
        ?.takeIf { it.isNotBlank() }
        ?: artist
}

private suspend fun extractCoverGradient(context: Context, coverUrl: String?): List<Color> {
    if (coverUrl == null) return listOf(Color(0xFF496D62), Color(0xFF17201D), Color(0xFF060707))

    return try {
        val request = ImageRequest.Builder(context)
            .data(coverUrl)
            .allowHardware(false)
            .build()
        val result = context.imageLoader.execute(request)
        val bitmap = (result as? SuccessResult)?.drawable?.toBitmap()
            ?: return listOf(Color(0xFF496D62), Color(0xFF17201D), Color(0xFF060707))
        val palette = Palette.from(bitmap).maximumColorCount(12).generate()
        val dominant = palette.getDominantColor(0xFF496D62.toInt())
        val vibrant = palette.getVibrantColor(dominant)
        val muted = palette.getMutedColor(dominant)

        listOf(
            Color(ColorUtils.blendARGB(vibrant, android.graphics.Color.BLACK, 0.38f)),
            Color(ColorUtils.blendARGB(muted, android.graphics.Color.BLACK, 0.58f)),
            Color(ColorUtils.blendARGB(dominant, android.graphics.Color.BLACK, 0.82f))
        )
    } catch (_: Exception) {
        listOf(Color(0xFF496D62), Color(0xFF17201D), Color(0xFF060707))
    }
}

private suspend fun loadLibrary(
    serverUrl: String,
    scanFirst: Boolean,
    update: (loading: Boolean, songs: List<SongResponse>, status: String, error: String?) -> Unit
) {
    update(true, emptyList(), "Connecting to ${normalizeServerUrl(serverUrl)}...", null)
    try {
        val api = createApi(serverUrl)
        val scanMessage = if (scanFirst) {
            val scan = api.scanLibrary()
            "Scan complete: ${scan.newCount} new track(s). "
        } else {
            ""
        }
        val songs = api.getSongs()
        val status = if (songs.isEmpty()) {
            "${scanMessage}Connected. Library is empty."
        } else {
            "${scanMessage}Loaded ${songs.size} track(s)."
        }
        update(false, songs, status, null)
    } catch (e: Exception) {
        update(
            false,
            emptyList(),
            "Connection failed.",
            "Could not reach ${normalizeServerUrl(serverUrl)}. ${e.localizedMessage ?: e.javaClass.simpleName}"
        )
    }
}

private suspend fun loadRecommendations(serverUrl: String, currentSongId: Int?): List<SongResponse> {
    return try {
        val now = Calendar.getInstance()
        createApi(serverUrl).getRecommendations(
            currentId = currentSongId,
            limit = 20,
            hour = now.get(Calendar.HOUR_OF_DAY),
            dayOfWeek = now.get(Calendar.DAY_OF_WEEK) - 1
        )
    } catch (_: Exception) {
        emptyList()
    }
}

private fun createApi(serverUrl: String): MusicApi {
    val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    return Retrofit.Builder()
        .baseUrl("${normalizeServerUrl(serverUrl)}/")
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(MusicApi::class.java)
}

private fun normalizeServerUrl(value: String): String {
    val trimmed = value.trim().trimEnd('/')
    return when {
        trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
        trimmed.isBlank() -> "http://10.0.2.2:3000"
        else -> "http://$trimmed"
    }
}

private fun formatDuration(seconds: Double): String {
    if (seconds <= 0.0) return "--:--"
    val totalSeconds = seconds.toInt()
    val minutes = totalSeconds / 60
    val remainder = totalSeconds % 60
    return "$minutes:${remainder.toString().padStart(2, '0')}"
}

private fun formatMillis(milliseconds: Long): String {
    if (milliseconds <= 0L) return "0:00"
    val totalSeconds = (milliseconds / 1000).toInt()
    val minutes = totalSeconds / 60
    val remainder = totalSeconds % 60
    return "$minutes:${remainder.toString().padStart(2, '0')}"
}

private fun sourceLabel(source: String): String {
    return when (source) {
        "Search" -> "Recent Searches"
        "Library" -> "Your Library"
        else -> "Streamify Home"
    }
}

@Composable
private fun StreamifyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Orange,
            background = AppBackground,
            surface = PanelColor,
            onPrimary = Color.Black,
            onBackground = Color.White,
            onSurface = Color.White
        ),
        content = content
    )
}

private val AppBackground = Color(0xFF080808)
private val AppBackdrop = Brush.verticalGradient(
    listOf(Color(0xFF22120C), Color(0xFF080808), Color(0xFF050505))
)
private val PanelColor = Color(0xFF171717)
private val MutedText = Color(0xFFB8AEA8)
private val Orange = Color(0xFFFF7A1A)
private val OrangeDeep = Color(0xFF9A3D0A)
private val Gold = Color(0xFFFFC06A)
private val Green = Color(0xFF26E15A)
private val ErrorColor = Color(0xFFFF6B6B)
