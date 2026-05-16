package com.streamify

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.streamify.api.MusicApi
import com.streamify.api.SongResponse
import com.streamify.player.MusicService
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
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
    var loading by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Ready") }
    var error by remember { mutableStateOf<String?>(null) }
    var currentSong by remember { mutableStateOf<SongResponse?>(null) }
    var isPlaying by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun refresh(scanFirst: Boolean) {
        scope.launch {
            loadLibrary(serverUrl, scanFirst = scanFirst) { nextLoading, nextSongs, nextStatus, nextError ->
                loading = nextLoading
                songs = nextSongs
                status = nextStatus
                error = nextError
            }
        }
    }

    LaunchedEffect(Unit) {
        loadLibrary(serverUrl, scanFirst = false) { nextLoading, nextSongs, nextStatus, nextError ->
            loading = nextLoading
            songs = nextSongs
            status = nextStatus
            error = nextError
        }
    }

    val playSong: (SongResponse) -> Unit = { song ->
        val controller = getController()
        if (controller == null) {
            error = "Player is still starting. Try again in a moment."
        } else {
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
            isPlaying = true
            error = null
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppBackdrop)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 18.dp, top = 18.dp, end = 18.dp, bottom = 148.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                SoundcastHeader(
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

            item {
                ControlDeck(
                    songCount = songs.size,
                    loading = loading,
                    onScan = { refresh(scanFirst = true) }
                )
            }

            item {
                Text("Recommended Stations", fontSize = 34.sp, fontWeight = FontWeight.Normal)
            }

            item {
                StationCarousel(songs = songs, serverUrl = serverUrl, onSongClick = playSong)
            }

            item {
                Text("Popular Albums And Singles", fontSize = 31.sp, fontWeight = FontWeight.Normal)
            }

            item {
                SectionGrid(songs = songs, serverUrl = serverUrl, onSongClick = playSong)
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Picked For You", modifier = Modifier.weight(1f), fontSize = 29.sp)
                    Text("Picked for this library", color = MutedText)
                }
            }

            when {
                loading -> item {
                    Box(modifier = Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Orange)
                    }
                }
                songs.isEmpty() -> item {
                    EmptyLibrary()
                }
                else -> items(songs, key = { it.id }) { song ->
                    PlaylistRow(song = song, serverUrl = serverUrl, onClick = { playSong(song) })
                }
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            FloatingMiniPlayer(
                song = currentSong,
                isPlaying = isPlaying,
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
            BottomNavigation()
        }
    }
}

@Composable
private fun SoundcastHeader(
    songCount: Int,
    loading: Boolean,
    connected: Boolean,
    onRefresh: () -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "SOUNDCAST",
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
                color = Color.White
            )
            Text(
                "BROADCAST ACTIVE / LISTENER VIEW",
                color = MutedText,
                fontSize = 10.sp,
                letterSpacing = 3.sp
            )
        }
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(GlassDark)
                .clickable(enabled = !loading, onClick = onRefresh)
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(if (loading) "..." else "R", color = if (connected) Color.White else ErrorColor, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun ControlDeck(
    songCount: Int,
    loading: Boolean,
    onScan: () -> Unit
) {
    GlossCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.verticalGradient(listOf(Color(0xFF281006), Color(0xFF190905)))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White.copy(alpha = 0.08f))
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(16.dp))
                    .padding(12.dp)
            ) {
                Text("Search songs, artists, albums...", color = MutedText)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilterChip("ALL SONGS", selected = true)
                FilterChip("LIKED", selected = false)
                FilterChip("RECENT", selected = false)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Button(
                    onClick = onScan,
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(58.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Orange, contentColor = Color.White)
                ) {
                    Text("AUDIO / $songCount", fontWeight = FontWeight.Black, letterSpacing = 2.sp)
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(58.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Color.White.copy(alpha = 0.07f))
                        .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(18.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("VIDEO / 0", color = MutedText, letterSpacing = 2.sp)
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CategoryPill("All", selected = true)
                CategoryPill("Music", selected = false)
                CategoryPill("Podcasts", selected = false)
            }
        }
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
    GlossCard(
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
                Text("CONNECT", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun EmptyLibrary(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(84.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(OrangeDeep, Orange, Gold))),
            contentAlignment = Alignment.Center
        ) {
            Text("S", color = Color.Black, fontSize = 40.sp, fontWeight = FontWeight.Black)
        }
        Text("No tracks yet", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(
            "Drop songs into the server music folder, then tap Scan.",
            color = MutedText
        )
    }
}

@Composable
private fun StationCarousel(songs: List<SongResponse>, serverUrl: String, onSongClick: (SongResponse) -> Unit) {
    if (songs.isEmpty()) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(sampleStations) { sample ->
                StationCard(title = sample, subtitle = "Local network radio", coverUrl = null, onClick = {})
            }
        }
        return
    }

    LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(songs.take(8), key = { it.id }) { song ->
            StationCard(
                title = song.title,
                subtitle = "${song.artist} - ${song.album}",
                coverUrl = coverUrl(serverUrl, song),
                onClick = { onSongClick(song) }
            )
        }
    }
}

@Composable
private fun StationCard(title: String, subtitle: String, coverUrl: String?, onClick: () -> Unit) {
    Column(modifier = Modifier.width(232.dp).clickable(onClick = onClick)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(28.dp))
                .background(Brush.linearGradient(listOf(Color(0xFFFF9CAF), Color(0xFFFFC0CB))))
                .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(28.dp))
        ) {
            Text(
                "SOUNDCAST        RADIO",
                modifier = Modifier.padding(18.dp),
                color = Color.Black,
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 3.sp
            )
            CoverDisc(
                coverUrl = coverUrl,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(102.dp)
            )
            Text(
                title,
                modifier = Modifier.align(Alignment.BottomStart).padding(18.dp),
                color = Color.Black,
                fontSize = 32.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        Text(subtitle, color = MutedText, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun SectionGrid(songs: List<SongResponse>, serverUrl: String, onSongClick: (SongResponse) -> Unit) {
    val visible = songs.take(4)
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        if (visible.isEmpty()) {
            AlbumTile("Local Mix", "Scan to populate", null, Modifier.weight(1f), {})
            AlbumTile("Recently Added", "Waiting for tracks", null, Modifier.weight(1f), {})
        } else {
            visible.take(2).forEach { song ->
                AlbumTile(
                    title = song.title,
                    subtitle = song.artist,
                    coverUrl = coverUrl(serverUrl, song),
                    modifier = Modifier.weight(1f),
                    onClick = { onSongClick(song) }
                )
            }
        }
    }
}

@Composable
private fun AlbumTile(title: String, subtitle: String, coverUrl: String?, modifier: Modifier, onClick: () -> Unit) {
    Column(modifier = modifier.clickable(onClick = onClick)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(Color(0xFF2B1610), Color(0xFF080808))))
        ) {
            AsyncImage(
                model = coverUrl,
                contentDescription = title,
                modifier = Modifier.fillMaxSize()
            )
            if (coverUrl == null) {
                CoverDisc(null, Modifier.align(Alignment.Center).size(74.dp))
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 16.sp)
        Text(subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MutedText, fontSize = 12.sp)
    }
}

@Composable
private fun PlaylistRow(song: SongResponse, serverUrl: String, onClick: () -> Unit) {
    GlossCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        brush = Brush.horizontalGradient(listOf(Color(0xFF1A1110), Color(0xFF120D10), Color(0xFF090909)))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CoverDisc(coverUrl(serverUrl, song), Modifier.size(54.dp))
            Column(modifier = Modifier.padding(start = 12.dp).weight(1f)) {
                Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                Text(
                    "${song.artist.uppercase()} / ${song.album.uppercase()} / ${formatDuration(song.duration)}",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = MutedText,
                    fontSize = 10.sp,
                    letterSpacing = 2.sp
                )
            }
            CircleButton("...")
        }
    }
}

@Composable
private fun FloatingMiniPlayer(
    song: SongResponse?,
    isPlaying: Boolean,
    onToggle: () -> Unit
) {
    GlossCard(
        modifier = Modifier.fillMaxWidth(),
        brush = Brush.horizontalGradient(listOf(Color(0xAAEFE7D9), Color(0xAA2A1D1B)))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(Orange, Gold))),
                contentAlignment = Alignment.Center
            ) {
                Text("S", color = Color.Black, fontWeight = FontWeight.Black)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(song?.title ?: "Ready to broadcast", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                Text(song?.artist ?: "Choose a track", color = Color.White.copy(alpha = 0.70f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            CircleButton(if (isPlaying) "II" else ">") { if (song != null) onToggle() }
        }
    }
}

@Composable
private fun BottomNavigation() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
            .background(Color.Black.copy(alpha = 0.96f))
            .padding(horizontal = 28.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        NavItem("Home", selected = true)
        NavItem("Search", selected = false)
        NavItem("Library", selected = false)
    }
}

@Composable
private fun NavItem(label: String, selected: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(if (selected) "[]" else "()", color = if (selected) Color.White else MutedText, fontWeight = FontWeight.Bold)
        Text(label, color = if (selected) Color.White else MutedText, fontSize = 12.sp)
    }
}

@Composable
private fun StatusPill(text: String, positive: Boolean) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (positive) Orange.copy(alpha = 0.18f) else ErrorColor.copy(alpha = 0.18f))
            .border(
                width = 1.dp,
                color = if (positive) Orange.copy(alpha = 0.5f) else ErrorColor.copy(alpha = 0.5f),
                shape = CircleShape
            )
            .padding(horizontal = 12.dp, vertical = 7.dp)
    ) {
        Text(
            text = text,
            color = if (positive) Orange else ErrorColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black
        )
    }
}

@Composable
private fun FilterChip(text: String, selected: Boolean) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) Color.White else Color.White.copy(alpha = 0.08f))
            .padding(horizontal = 20.dp, vertical = 12.dp)
    ) {
        Text(
            text,
            color = if (selected) Color.Black else MutedText,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 3.sp
        )
    }
}

@Composable
private fun CategoryPill(text: String, selected: Boolean) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) Green else Color.White.copy(alpha = 0.10f))
            .padding(horizontal = 24.dp, vertical = 14.dp)
    ) {
        Text(text, color = if (selected) Color.Black else Color.White, fontSize = 18.sp)
    }
}

@Composable
private fun CircleButton(text: String, onClick: () -> Unit = {}) {
    Box(
        modifier = Modifier
            .size(46.dp)
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.10f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = Color.White, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CoverDisc(coverUrl: String?, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color.White, Color(0xFFDBDBDB))))
            .border(1.dp, Color.Black.copy(alpha = 0.12f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        AsyncImage(
            model = coverUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize()
        )
        if (coverUrl == null) {
            Text("SC", color = Color.Black, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun GlossCard(
    modifier: Modifier = Modifier,
    brush: Brush,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.border(
            width = 1.dp,
            brush = Brush.linearGradient(listOf(Color.White.copy(alpha = 0.20f), Color.Transparent)),
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
private val AppBackdrop = Brush.linearGradient(
    listOf(Color(0xFF070607), Color(0xFF250900), Color(0xFF050505))
)
private val PanelColor = Color(0xFF171717)
private val GlassDark = Color(0xFF2A1712).copy(alpha = 0.78f)
private val MutedText = Color(0xFFB8AEA8)
private val SoftWhite = Color(0xFFE7D8CE)
private val Orange = Color(0xFFFF7A1A)
private val OrangeDeep = Color(0xFF9A3D0A)
private val Gold = Color(0xFFFFC06A)
private val Green = Color(0xFF26E15A)
private val ErrorColor = Color(0xFFFF6B6B)
private val sampleStations = listOf("Hiphop Tamizha", "Anirudh Radio", "Local Mix", "Recently Played")
