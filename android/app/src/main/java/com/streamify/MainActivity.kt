package com.streamify

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import coil.compose.AsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.streamify.api.MusicApi
import com.streamify.api.PlayEventRequest
import com.streamify.api.SongResponse
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

class MainActivity : ComponentActivity() {
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null

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
    var loading by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Ready") }
    var error by remember { mutableStateOf<String?>(null) }
    var currentSong by remember { mutableStateOf<SongResponse?>(null) }
    var currentIndex by remember { mutableIntStateOf(-1) }
    var isPlaying by remember { mutableStateOf(false) }
    var activeTab by remember { mutableStateOf("Home") }
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
    val scope = rememberCoroutineScope()

    fun refresh(scanFirst: Boolean) {
        scope.launch {
            loadLibrary(serverUrl, scanFirst = scanFirst) { nextLoading, nextSongs, nextStatus, nextError ->
                loading = nextLoading
                songs = nextSongs
                status = nextStatus
                error = nextError
            }
            recommendedSongs = loadRecommendations(serverUrl, currentSong?.id)
        }
    }

    fun playSong(song: SongResponse, queue: List<SongResponse> = songs) {
        val controller = getController()
        if (controller == null) {
            error = "Player is still starting. Try again in a moment."
            return
        }

        val metadata = MediaMetadata.Builder()
            .setTitle(song.title)
            .setArtist(song.artist)
            .setAlbumTitle(song.album)
            .build()
        val mediaItem = MediaItem.Builder()
            .setUri("$serverUrl/api/stream/${song.id}")
            .setMediaId(song.id.toString())
            .setMediaMetadata(metadata)
            .build()

        controller.setMediaItem(mediaItem)
        controller.prepare()
        controller.play()
        onControllerReady(controller)
        currentSong = song
        currentIndex = queue.indexOfFirst { it.id == song.id }.takeIf { it >= 0 } ?: songs.indexOfFirst { it.id == song.id }
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
        }
    }

    fun playOffset(delta: Int) {
        if (songs.isEmpty()) return
        val nextIndex = when {
            repeatOne && delta > 0 && currentIndex >= 0 -> currentIndex
            shuffleEnabled && delta > 0 && songs.size > 1 -> {
                val choices = songs.indices.filterNot { it == currentIndex }
                choices.random()
            }
            currentIndex < 0 -> 0
            else -> (currentIndex + delta + songs.size) % songs.size
        }
        playSong(songs[nextIndex])
    }

    fun toggleFavorite(songId: Int) {
        favoriteIds = if (songId in favoriteIds) favoriteIds - songId else favoriteIds + songId
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
        enabled = expandedPlayer ||
            searchQuery.isNotBlank() ||
            libraryFilter != "All" ||
            tabBackStack.isNotEmpty() ||
            activeTab != "Home"
    ) {
        when {
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
            status = nextStatus
            error = nextError
        }
        recommendedSongs = loadRecommendations(serverUrl, currentSong?.id)
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
    val displayedSongs = if (activeTab == "Home") recommendedSongs.ifEmpty { songs } else visibleSongs

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackdrop)
    ) {
        LazyColumn(
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
                else -> items(displayedSongs, key = { it.id }) { song ->
                    TrackRow(
                        song = song,
                        serverUrl = serverUrl,
                        selected = currentSong?.id == song.id,
                        favorite = song.id in favoriteIds,
                        onClick = { playSong(song, displayedSongs) },
                        onFavorite = { toggleFavorite(song.id) }
                    )
                }
            }
        }

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

        currentSong?.let { expandedSong ->
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
    onRefresh: () -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
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
                Button(
                    onClick = onPlay,
                    enabled = songs.isNotEmpty(),
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = Green, contentColor = Color.Black)
                ) {
                    Text("Play", fontWeight = FontWeight.Black)
                }
                Button(
                    onClick = onShuffle,
                    enabled = songs.isNotEmpty(),
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.12f), contentColor = Color.White)
                ) {
                    Text("Shuffle", fontWeight = FontWeight.Black)
                }
                IconCircleButton(
                    icon = Icons.Default.Refresh,
                    contentDescription = "Scan library",
                    enabled = !loading,
                    onClick = onScan
                )
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
    likedCount: Int,
    recentCount: Int,
    onSelect: (String) -> Unit,
    onScan: () -> Unit,
    loading: Boolean
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("All", "Liked", "Recent").forEach { label ->
                FilterPill(text = label, selected = selected == label, onClick = { onSelect(label) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            LibraryStat("Tracks", songCount.toString(), Modifier.weight(1f))
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
    onFavorite: () -> Unit
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
                IconCircleButton(
                    icon = Icons.Default.MoreVert,
                    contentDescription = "More options",
                    onClick = { activeInfoTab = "Suggestions" }
                )
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
