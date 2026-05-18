import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import * as mm from 'music-metadata';
import fg from 'fast-glob';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

const AUDIO_MIME_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

const VIDEO_MIME_TYPES: Record<string, string> = {
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

const SUBTITLE_MIME_TYPES: Record<string, string> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
};

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((existing) => existing.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function resolveInside(baseDir: string, relativePath: string) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativePath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedTarget;
}

function getAudioMime(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return AUDIO_MIME_TYPES[extension] || 'application/octet-stream';
}

function getVideoMime(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return VIDEO_MIME_TYPES[extension] || 'application/octet-stream';
}

function getSubtitleMime(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return SUBTITLE_MIME_TYPES[extension] || 'text/plain';
}

function getImageMime(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return IMAGE_MIME_TYPES[extension] || 'application/octet-stream';
}

function sendRangeFile(req: express.Request, res: express.Response, filePath: string, contentType: string) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }
    const chunkSize = (end - start) + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': fileSize,
    'Content-Type': contentType,
  });
  fs.createReadStream(filePath).pipe(res);
}

function artistPhotoStem(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-artist';
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function safeText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function displayArtistName(value: unknown) {
  return safeText(value, 240)
    .replace(/\s*-\s*MassTamilan(?:\.[a-z]+)?$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown Artist';
}

function normalizedName(value: unknown) {
  return displayArtistName(value).toLowerCase();
}

function normalizedAlbumTitle(value: unknown) {
  return safeText(value, 240)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || 'unknown album';
}

function songFingerprint(song: any) {
  return `${String(song.artist || '').toLowerCase()}::${String(song.title || '').toLowerCase()}::${Math.round(Number(song.duration || 0))}`;
}

function cleanVideoText(value: string) {
  return value
    .replace(/\[[^\]]+]/g, ' ')
    .replace(/\([^)]*(1080p|720p|480p|x264|x265|hevc|aac|bluray|webrip|web-dl|hdtv)[^)]*\)/gi, ' ')
    .replace(/^@\S+\s+/g, ' ')
    .replace(/\s+@\S+\b/g, ' ')
    .replace(/\b(1080p|720p|480p|2160p|x264|x265|h264|h265|hevc|aac|dual audio|multi audio|webrip|web-dl|bluray|hdtv)\b/gi, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseVideo(value: string) {
  const cleaned = cleanVideoText(value);
  if (!cleaned) return 'Unknown Series';
  const smallWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to']);
  return cleaned
    .split(' ')
    .map((part, index) => {
      if (/^(ova|tv|iii?|iv|vi{0,3}|s\d+|e\d+)$/i.test(part)) return part.toUpperCase();
      if (index > 0 && smallWords.has(part.toLowerCase())) return part.toLowerCase();
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function videoSortTitle(value: string) {
  return cleanVideoText(value)
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() || 'unknown series';
}

function encodePathForUrl(relativePath: string) {
  return relativePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
}

function generatedVideoPosterPath(title: string) {
  return `/api/videos/poster/${encodeURIComponent(title)}`;
}

function parseVideoFile(relativePath: string) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const filename = parts.at(-1) || relativePath;
  const extension = path.extname(filename).slice(1).toLowerCase();
  const basename = path.basename(filename, path.extname(filename));
  const folders = parts.slice(0, -1);
  const nonSeasonFolders = folders.filter(folder => !/\b(season|s)\s*\d+\b/i.test(folder));
  const folderSeason = folders.map(folder => folder.match(/\b(?:season|s)\s*(\d{1,2})\b/i)).find(Boolean)?.[1];

  const patterns = [
    /^(.*?)[\s._-]+S(\d{1,2})E(\d{1,3})(?:[\s._-]+(.+))?$/i,
    /^(.*?)[\s._-]+S(\d{1,2})[\s._-]*(?:Episode|Ep|E)[\s._-]*(\d{1,3})(?:[\s._-]+(.+))?$/i,
    /^(.*?)[\s._-]+Season[\s._-]*(\d{1,2})[\s._-]+(?:Episode|Ep|E)[\s._-]*(\d{1,3})(?:[\s._-]+(.+))?$/i,
    /^(.*?)[\s._-]+(\d{1,2})x(\d{1,3})(?:[\s._-]+(.+))?$/i,
    /^(.*?)[\s._-]+(?:Episode|Ep|E)[\s._-]*(\d{1,3})(?:[\s._-]+(.+))?$/i,
  ];

  let seriesTitle = nonSeasonFolders[0] || '';
  let seasonNumber = folderSeason ? Number(folderSeason) : 1;
  let episodeNumber = 1;
  let episodeTitle = '';

  const sxe = basename.match(patterns[0]);
  const spacedSeasonEpisode = basename.match(patterns[1]);
  const seasonEpisode = basename.match(patterns[2]);
  const oneX = basename.match(patterns[3]);
  const episodeOnly = basename.match(patterns[4]);

  if (sxe) {
    if (!seriesTitle) seriesTitle = sxe[1];
    seasonNumber = Number(sxe[2]);
    episodeNumber = Number(sxe[3]);
    episodeTitle = sxe[4] || '';
  } else if (spacedSeasonEpisode) {
    if (!seriesTitle) seriesTitle = spacedSeasonEpisode[1];
    seasonNumber = Number(spacedSeasonEpisode[2]);
    episodeNumber = Number(spacedSeasonEpisode[3]);
    episodeTitle = spacedSeasonEpisode[4] || '';
  } else if (seasonEpisode) {
    if (!seriesTitle) seriesTitle = seasonEpisode[1];
    seasonNumber = Number(seasonEpisode[2]);
    episodeNumber = Number(seasonEpisode[3]);
    episodeTitle = seasonEpisode[4] || '';
  } else if (oneX) {
    if (!seriesTitle) seriesTitle = oneX[1];
    seasonNumber = Number(oneX[2]);
    episodeNumber = Number(oneX[3]);
    episodeTitle = oneX[4] || '';
  } else if (episodeOnly) {
    if (!seriesTitle) seriesTitle = nonSeasonFolders[0] || basename.replace(episodeOnly[0], '');
    episodeNumber = Number(episodeOnly[2] || episodeOnly[1]);
    episodeTitle = episodeOnly[3] || episodeOnly[2] || '';
  } else {
    const trailingNumber = basename.match(/^(.*?)[\s._-]+(\d{1,3})(?:[\s._-]+(.+))?$/);
    if (trailingNumber) {
      if (!seriesTitle) seriesTitle = trailingNumber[1];
      episodeNumber = Number(trailingNumber[2]);
      episodeTitle = trailingNumber[3] || '';
    } else {
      if (!seriesTitle) seriesTitle = basename;
      episodeTitle = basename;
    }
  }

  const title = titleCaseVideo(seriesTitle);
  const cleanedEpisodeTitle = cleanVideoText(episodeTitle);
  return {
    seriesTitle: title,
    sortTitle: videoSortTitle(title),
    seasonNumber: Number.isFinite(seasonNumber) && seasonNumber > 0 ? seasonNumber : 1,
    episodeNumber: Number.isFinite(episodeNumber) && episodeNumber > 0 ? episodeNumber : 1,
    episodeTitle: cleanedEpisodeTitle || `Episode ${String(episodeNumber).padStart(2, '0')}`,
    extension,
    relativePath,
  };
}

const SONG_SELECT = `
  SELECT 
    s.id, s.title, s.duration, s.path, s.format, s.dateAdded,
    s.isFavorite, s.playCount, s.lastPlayed,
    s.year, s.trackNumber, s.discNumber, s.composer, s.albumArtist,
    a.name as artist,
    al.title as album,
    al.coverArtPath,
    g.name as genre
  FROM songs s
  LEFT JOIN artists a ON s.artistId = a.id
  LEFT JOIN albums al ON s.albumId = al.id
  LEFT JOIN genres g ON s.genreId = g.id
`;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const MUSIC_DIR = path.join(process.cwd(), 'music');
  const VIDEO_DIR = path.join(process.cwd(), 'videos');
  const ART_DIR = path.join(process.cwd(), 'art');
  const VIDEO_ART_DIR = path.join(process.cwd(), 'video-art');
  const ARTIST_PHOTOS_DIR = path.join(process.cwd(), 'artist-photos');

  // Ensure music directory exists
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    // Add a placeholder or instructions if empty?
  }

  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
  }

  if (!fs.existsSync(VIDEO_ART_DIR)) {
    fs.mkdirSync(VIDEO_ART_DIR, { recursive: true });
  }

  if (!fs.existsSync(ARTIST_PHOTOS_DIR)) {
    fs.mkdirSync(ARTIST_PHOTOS_DIR, { recursive: true });
  }

  const db = new Database('streamify.db');
  db.pragma('journal_mode = WAL');
  const videoDb = new Database('streamify-videos.db');
  videoDb.pragma('journal_mode = WAL');
  const realtimeState = {
    playback: {
      songId: null as number | null,
      isPlaying: false,
      progress: 0,
      volume: 0.7,
      updatedAt: new Date().toISOString(),
    },
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      artistId INTEGER,
      coverArtPath TEXT,
      FOREIGN KEY(artistId) REFERENCES artists(id),
      UNIQUE(title, artistId)
    );

    CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      artistId INTEGER,
      albumId INTEGER,
      genreId INTEGER,
      duration REAL,
      path TEXT UNIQUE,
      format TEXT,
      dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(artistId) REFERENCES artists(id),
      FOREIGN KEY(albumId) REFERENCES albums(id),
      FOREIGN KEY(genreId) REFERENCES genres(id)
    );
    
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlistId INTEGER,
      songId INTEGER,
      position INTEGER,
      PRIMARY KEY(playlistId, songId),
      FOREIGN KEY(playlistId) REFERENCES playlists(id),
      FOREIGN KEY(songId) REFERENCES songs(id)
    );

    CREATE TABLE IF NOT EXISTS listening_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      songId INTEGER,
      artistId INTEGER,
      albumId INTEGER,
      genreId INTEGER,
      hour INTEGER,
      dayOfWeek INTEGER,
      source TEXT,
      playedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(songId) REFERENCES songs(id),
      FOREIGN KEY(artistId) REFERENCES artists(id),
      FOREIGN KEY(albumId) REFERENCES albums(id),
      FOREIGN KEY(genreId) REFERENCES genres(id)
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      pin TEXT,
      isGuest INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastActive DATETIME
    );

    CREATE TABLE IF NOT EXISTS eq_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileId INTEGER,
      name TEXT,
      bands TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profileId, name),
      FOREIGN KEY(profileId) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS metadata_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      songId INTEGER,
      beforeJson TEXT,
      afterJson TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(songId) REFERENCES songs(id)
    );

    CREATE TABLE IF NOT EXISTS duplicate_ignores (
      fingerprint TEXT PRIMARY KEY,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT,
      message TEXT,
      details TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, 'songs', 'isFavorite', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'songs', 'playCount', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'songs', 'lastPlayed', 'DATETIME');
  ensureColumn(db, 'songs', 'year', 'INTEGER');
  ensureColumn(db, 'songs', 'trackNumber', 'INTEGER');
  ensureColumn(db, 'songs', 'discNumber', 'INTEGER');
  ensureColumn(db, 'songs', 'composer', 'TEXT');
  ensureColumn(db, 'songs', 'albumArtist', 'TEXT');
  ensureColumn(db, 'songs', 'skipCount', 'INTEGER DEFAULT 0');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artistId);
    CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(albumId);
    CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genreId);
    CREATE INDEX IF NOT EXISTS idx_songs_path ON songs(path);
    CREATE INDEX IF NOT EXISTS idx_listening_played ON listening_events(playedAt);
    CREATE INDEX IF NOT EXISTS idx_listening_song ON listening_events(songId);
    CREATE INDEX IF NOT EXISTS idx_playlist_position ON playlist_songs(playlistId, position);
  `);
  db.prepare('INSERT OR IGNORE INTO profiles (id, name, isGuest, lastActive) VALUES (1, ?, 0, CURRENT_TIMESTAMP)').run('Owner');

  videoDb.exec(`
    CREATE TABLE IF NOT EXISTS video_library_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sortTitle TEXT NOT NULL UNIQUE,
      description TEXT,
      posterPath TEXT,
      backdropPath TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seriesId INTEGER NOT NULL,
      seasonNumber INTEGER NOT NULL,
      title TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(seriesId, seasonNumber),
      FOREIGN KEY(seriesId) REFERENCES video_series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seriesId INTEGER NOT NULL,
      seasonId INTEGER NOT NULL,
      seasonNumber INTEGER NOT NULL,
      episodeNumber INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      duration REAL,
      path TEXT NOT NULL UNIQUE,
      format TEXT,
      fileSize INTEGER,
      thumbnailPath TEXT,
      dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(seriesId) REFERENCES video_series(id) ON DELETE CASCADE,
      FOREIGN KEY(seasonId) REFERENCES video_seasons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_watch_progress (
      episodeId INTEGER PRIMARY KEY,
      positionMs INTEGER DEFAULT 0,
      durationMs INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(episodeId) REFERENCES video_episodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_video_series_sort ON video_series(sortTitle);
    CREATE INDEX IF NOT EXISTS idx_video_seasons_series ON video_seasons(seriesId, seasonNumber);
    CREATE INDEX IF NOT EXISTS idx_video_episodes_series ON video_episodes(seriesId, seasonNumber, episodeNumber);
    CREATE INDEX IF NOT EXISTS idx_video_episodes_path ON video_episodes(path);
    CREATE INDEX IF NOT EXISTS idx_video_watch_updated ON video_watch_progress(updatedAt);
  `);

  const allClients = new Set<WebSocket>();
  const broadcast = (type: string, payload: unknown) => {
    const message = JSON.stringify({ type, payload, sentAt: new Date().toISOString() });
    allClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  };

  const songById = (id: unknown) => db.prepare(`${SONG_SELECT} WHERE s.id = ?`).get(id) as any;

  app.use(cors());
  app.use(express.json());
  const isProduction = process.env.NODE_ENV === 'production' || process.argv[1]?.endsWith(path.join('dist', 'server.mjs'));

  // API Routes
  
  // Toggle favorite
  app.post('/api/songs/:id/favorite', (req, res) => {
    const { favorite } = req.body;
    const result = db.prepare('UPDATE songs SET isFavorite = ? WHERE id = ?').run(favorite ? 1 : 0, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Song not found' });
    res.json({ success: true });
  });

  // Track play
  app.post('/api/songs/:id/played', (req, res) => {
    const song = db.prepare('SELECT id, artistId, albumId, genreId FROM songs WHERE id = ?').get(req.params.id) as any;
    if (!song) return res.status(404).json({ error: 'Song not found' });

    const now = new Date();
    const hour = Number.isInteger(req.body?.hour) ? Number(req.body.hour) : now.getHours();
    const dayOfWeek = Number.isInteger(req.body?.dayOfWeek) ? Number(req.body.dayOfWeek) : now.getDay();
    const source = String(req.body?.source || 'android').slice(0, 40);

    const result = db.prepare('UPDATE songs SET playCount = playCount + 1, lastPlayed = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Song not found' });

    db.prepare(`
      INSERT INTO listening_events (songId, artistId, albumId, genreId, hour, dayOfWeek, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(song.id, song.artistId, song.albumId, song.genreId, hour, dayOfWeek, source);

    res.json({ success: true });
  });

  // Get all playlists
  app.get('/api/playlists', (req, res) => {
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY createdAt DESC').all();
    res.json(playlists);
  });

  // Create playlist
  app.post('/api/playlists', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Playlist name is required' });
    try {
      const result = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
      res.json({ id: result.lastInsertRowid, name });
    } catch (e) {
      res.status(400).json({ error: 'Playlist already exists' });
    }
  });

  // Rename playlist
  app.put('/api/playlists/:id', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Playlist name is required' });
    try {
      const result = db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Playlist not found' });
      res.json({ id: Number(req.params.id), name });
    } catch (e) {
      res.status(400).json({ error: 'Playlist name already exists' });
    }
  });

  // Add song to playlist
  app.post('/api/playlists/:id/songs', (req, res) => {
    const { songId } = req.body;
    const playlistId = req.params.id;
    const playlist = db.prepare('SELECT id FROM playlists WHERE id = ?').get(playlistId);
    const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(songId);
    if (!playlist || !song) return res.status(404).json({ error: 'Playlist or song not found' });
    try {
      const maxPos = db.prepare('SELECT MAX(position) as m FROM playlist_songs WHERE playlistId = ?').get(playlistId) as any;
      const position = (maxPos?.m || 0) + 1;
      db.prepare('INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)').run(playlistId, songId, position);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Song already in playlist' });
    }
  });

  // Get songs in playlist
  app.get('/api/playlists/:id/songs', (req, res) => {
    const query = `
      SELECT 
        s.id, s.title, s.duration, s.path, s.format, s.dateAdded,
        s.isFavorite, s.playCount, s.lastPlayed,
        a.name as artist, 
        al.title as album, 
        al.coverArtPath,
        g.name as genre
      FROM playlist_songs ps
      JOIN songs s ON ps.songId = s.id
      LEFT JOIN artists a ON s.artistId = a.id
      LEFT JOIN albums al ON s.albumId = al.id
      LEFT JOIN genres g ON s.genreId = g.id
      WHERE ps.playlistId = ?
      ORDER BY ps.position ASC
    `;
    const songs = db.prepare(query).all(req.params.id);
    res.json(songs);
  });

  // Remove song from playlist
  app.delete('/api/playlists/:id/songs/:songId', (req, res) => {
    const result = db.prepare('DELETE FROM playlist_songs WHERE playlistId = ? AND songId = ?').run(req.params.id, req.params.songId);
    if (result.changes === 0) return res.status(404).json({ error: 'Song not found in playlist' });

    const rows = db.prepare('SELECT songId FROM playlist_songs WHERE playlistId = ? ORDER BY position ASC').all(req.params.id) as Array<{ songId: number }>;
    const updatePosition = db.prepare('UPDATE playlist_songs SET position = ? WHERE playlistId = ? AND songId = ?');
    const reorder = db.transaction(() => {
      rows.forEach((row, index) => updatePosition.run(index + 1, req.params.id, row.songId));
    });
    reorder();

    res.json({ success: true });
  });

  // Reorder playlist songs
  app.put('/api/playlists/:id/reorder', (req, res) => {
    const songIds = Array.isArray(req.body?.songIds) ? req.body.songIds.map(Number).filter(Number.isInteger) : [];
    if (songIds.length === 0) return res.status(400).json({ error: 'songIds are required' });

    const existing = db.prepare('SELECT songId FROM playlist_songs WHERE playlistId = ?').all(req.params.id) as Array<{ songId: number }>;
    const existingIds = new Set(existing.map(row => row.songId));
    const orderedIds = songIds.filter((songId, index, arr) => existingIds.has(songId) && arr.indexOf(songId) === index);
    existing.forEach(row => {
      if (!orderedIds.includes(row.songId)) orderedIds.push(row.songId);
    });

    const updatePosition = db.prepare('UPDATE playlist_songs SET position = ? WHERE playlistId = ? AND songId = ?');
    const reorder = db.transaction(() => {
      orderedIds.forEach((songId, index) => updatePosition.run(index + 1, req.params.id, songId));
    });
    reorder();

    res.json({ success: true });
  });

  // Helper to get or create artist
  const getOrCreateArtist = (name: string) => {
    const cleanName = displayArtistName(name);
    const row = (db.prepare('SELECT id, name FROM artists ORDER BY id ASC').all() as Array<{ id: number; name: string }>)
      .find((item) => normalizedName(item.name) === normalizedName(cleanName));
    if (row) return row.id;
    const result = db.prepare('INSERT INTO artists (name) VALUES (?)').run(cleanName);
    return result.lastInsertRowid;
  };

  // Helper to get or create genre
  const getOrCreateGenre = (name: string) => {
    if (!name) return null;
    const row = db.prepare('SELECT id FROM genres WHERE name = ?').get(name) as any;
    if (row) return row.id;
    const result = db.prepare('INSERT INTO genres (name) VALUES (?)').run(name);
    return result.lastInsertRowid;
  };

  // Helper to get or create album
  const getOrCreateAlbum = (title: string, artistId: number, coverArtPath: string | null) => {
    const row = db.prepare('SELECT id FROM albums WHERE title = ? AND artistId = ?').get(title, artistId) as any;
    if (row) {
      if (coverArtPath && !row.coverArtPath) {
        db.prepare('UPDATE albums SET coverArtPath = ? WHERE id = ?').run(coverArtPath, row.id);
      }
      return row.id;
    }
    const result = db.prepare('INSERT INTO albums (title, artistId, coverArtPath) VALUES (?, ?, ?)').run(title, artistId, coverArtPath);
    return result.lastInsertRowid;
  };

  const findVideoArtwork = (seriesTitle: string, kind: 'poster' | 'backdrop', relativeVideoPath?: string) => {
    const stem = artistPhotoStem(seriesTitle);
    const candidates = [
      `${stem}-${kind}`,
      `${stem}`,
      `${seriesTitle}`,
    ];
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    for (const candidate of candidates) {
      for (const extension of extensions) {
        const filename = `${artistPhotoStem(candidate)}.${extension}`;
        const filePath = resolveInside(VIDEO_ART_DIR, filename);
        if (filePath && fs.existsSync(filePath)) return `/api/videos/art/${filename}`;
      }
    }

    const localNames = kind === 'poster'
      ? ['poster', 'cover', 'folder', stem]
      : ['backdrop', 'fanart', 'background', `${stem}-backdrop`];
    const folders = [
      relativeVideoPath ? path.dirname(relativeVideoPath) : '',
      '',
    ].filter((folder, index, list) => list.indexOf(folder) === index);

    for (const folder of folders) {
      for (const name of localNames) {
        for (const extension of extensions) {
          const localRelativePath = folder && folder !== '.'
            ? path.join(folder, `${name}.${extension}`)
            : `${name}.${extension}`;
          const filePath = resolveInside(VIDEO_DIR, localRelativePath);
          if (filePath && fs.existsSync(filePath)) return `/api/videos/local-art/${encodePathForUrl(localRelativePath)}`;
        }
      }
    }

    return kind === 'poster' ? generatedVideoPosterPath(seriesTitle) : null;
  };

  const findVideoSubtitle = (relativeVideoPath: string) => {
    const parsed = path.parse(relativeVideoPath);
    const candidates = [
      `${path.join(parsed.dir, parsed.name)}.srt`,
      `${path.join(parsed.dir, parsed.name)}.vtt`,
      path.join(parsed.dir, 'subtitle.srt'),
      path.join(parsed.dir, 'subtitles.srt'),
      path.join(parsed.dir, 'subtitle.vtt'),
      path.join(parsed.dir, 'subtitles.vtt'),
    ];
    for (const candidate of candidates) {
      const filePath = resolveInside(VIDEO_DIR, candidate);
      if (filePath && fs.existsSync(filePath)) return `/api/videos/episodes/subtitle/${encodePathForUrl(candidate)}`;
    }
    return null;
  };

  const getOrCreateVideoSeries = (title: string, sortTitle: string, relativeVideoPath?: string) => {
    const existing = videoDb.prepare('SELECT id, posterPath, backdropPath FROM video_series WHERE sortTitle = ?').get(sortTitle) as any;
    if (existing) {
      const posterPath = existing.posterPath || findVideoArtwork(title, 'poster', relativeVideoPath);
      const backdropPath = existing.backdropPath || findVideoArtwork(title, 'backdrop', relativeVideoPath);
      if (posterPath !== existing.posterPath || backdropPath !== existing.backdropPath) {
        videoDb.prepare('UPDATE video_series SET posterPath = ?, backdropPath = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
          .run(posterPath, backdropPath, existing.id);
      }
      return existing.id as number;
    }
    const posterPath = findVideoArtwork(title, 'poster', relativeVideoPath);
    const backdropPath = findVideoArtwork(title, 'backdrop', relativeVideoPath);
    const result = videoDb.prepare(`
      INSERT INTO video_series (title, sortTitle, posterPath, backdropPath)
      VALUES (?, ?, ?, ?)
    `).run(title, sortTitle, posterPath, backdropPath);
    return Number(result.lastInsertRowid);
  };

  const getOrCreateVideoSeason = (seriesId: number, seasonNumber: number) => {
    const existing = videoDb.prepare('SELECT id FROM video_seasons WHERE seriesId = ? AND seasonNumber = ?').get(seriesId, seasonNumber) as any;
    if (existing) return existing.id as number;
    const result = videoDb.prepare(`
      INSERT INTO video_seasons (seriesId, seasonNumber, title)
      VALUES (?, ?, ?)
    `).run(seriesId, seasonNumber, `Season ${seasonNumber}`);
    return Number(result.lastInsertRowid);
  };

  let videoSeriesPayloadCache: any[] | null = null;

  const getVideoSeriesPayload = () => {
    if (videoSeriesPayloadCache) return videoSeriesPayloadCache;
    const seriesRows = videoDb.prepare('SELECT * FROM video_series ORDER BY sortTitle ASC').all() as any[];
    const seasonRows = videoDb.prepare('SELECT * FROM video_seasons ORDER BY seasonNumber ASC').all() as any[];
    const episodeRows = videoDb.prepare(`
      SELECT *, '/api/videos/episodes/' || id || '/stream' AS streamPath
      FROM video_episodes
      ORDER BY seasonNumber ASC, episodeNumber ASC, title ASC
    `).all() as any[];
    const seasonsBySeries = new Map<number, any[]>();
    const episodesBySeason = new Map<number, any[]>();

    episodeRows.forEach(episode => {
      episode.subtitlePath = findVideoSubtitle(episode.path);
      const list = episodesBySeason.get(episode.seasonId) || [];
      list.push(episode);
      episodesBySeason.set(episode.seasonId, list);
    });

    seasonRows.forEach(season => {
      const list = seasonsBySeries.get(season.seriesId) || [];
      list.push({
        seasonNumber: season.seasonNumber,
        title: season.title || `Season ${season.seasonNumber}`,
        episodes: episodesBySeason.get(season.id) || [],
      });
      seasonsBySeries.set(season.seriesId, list);
    });

    videoSeriesPayloadCache = seriesRows.map(series => ({
      id: series.id,
      title: series.title,
      sortTitle: series.sortTitle,
      description: series.description,
      posterPath: series.posterPath || generatedVideoPosterPath(series.title),
      backdropPath: series.backdropPath,
      seasons: seasonsBySeries.get(series.id) || [],
    }));
    return videoSeriesPayloadCache;
  };

  const setVideoState = (key: string, value: unknown) => {
    videoDb.prepare(`
      INSERT INTO video_library_state (key, value, updatedAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(value));
  };

  const getVideoState = (key: string) => {
    const row = videoDb.prepare('SELECT value, updatedAt FROM video_library_state WHERE key = ?').get(key) as { value: string; updatedAt: string } | undefined;
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value), updatedAt: row.updatedAt };
    } catch {
      return { value: row.value, updatedAt: row.updatedAt };
    }
  };

  const scanVideoLibrary = async () => {
    setVideoState('scan', { running: true, startedAt: new Date().toISOString() });
    const files = await fg(['**/*.{mp4,mkv,webm,m4v,mov}'], { cwd: VIDEO_DIR, absolute: true, onlyFiles: true });
    const seenPaths = new Set<string>();
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const relativePath = path.relative(VIDEO_DIR, file);
      const stat = fs.statSync(file);
      if (stat.size === 0) {
        skippedCount++;
        continue;
      }

      seenPaths.add(relativePath);
      const parsed = parseVideoFile(relativePath);

      const existing = videoDb.prepare(`
        SELECT e.id, e.seriesId, e.duration, e.fileSize, s.title AS seriesTitle
        FROM video_episodes e
        JOIN video_series s ON s.id = e.seriesId
        WHERE e.path = ?
      `).get(relativePath) as any;
      const shouldReparseSeries = !existing
        || normalizedName(existing.seriesTitle) === normalizedName('Unknown Series')
        || String(existing.seriesTitle || '').trim().startsWith('@');
      const seriesId = shouldReparseSeries
        ? getOrCreateVideoSeries(parsed.seriesTitle, parsed.sortTitle, relativePath)
        : existing.seriesId;
      const seasonId = getOrCreateVideoSeason(seriesId, parsed.seasonNumber);
      const fileUnchanged = existing && Number(existing.fileSize || 0) === stat.size;
      const duration = fileUnchanged ? Number(existing.duration || 0) : await (async () => {
        try {
          const metadata = await mm.parseFile(file, { duration: true });
          return metadata.format.duration || 0;
        } catch {
          return 0;
        }
      })();

      if (existing) {
        videoDb.prepare(`
          UPDATE video_episodes
          SET seriesId = ?, seasonId = ?, seasonNumber = ?, episodeNumber = ?, title = ?,
              duration = ?, format = ?, fileSize = ?, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          seriesId,
          seasonId,
          parsed.seasonNumber,
          parsed.episodeNumber,
          parsed.episodeTitle,
          duration,
          parsed.extension,
          stat.size,
          existing.id
        );
        updatedCount++;
      } else {
        videoDb.prepare(`
          INSERT INTO video_episodes
            (seriesId, seasonId, seasonNumber, episodeNumber, title, duration, path, format, fileSize)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          seriesId,
          seasonId,
          parsed.seasonNumber,
          parsed.episodeNumber,
          parsed.episodeTitle,
          duration,
          relativePath,
          parsed.extension,
          stat.size
        );
        newCount++;
      }

      videoDb.prepare('UPDATE video_series SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(seriesId);
      videoDb.prepare('UPDATE video_seasons SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?').run(seasonId);
    }

    const existingEpisodes = videoDb.prepare('SELECT id, path FROM video_episodes').all() as Array<{ id: number; path: string }>;
    const missingIds = existingEpisodes
      .filter(episode => !seenPaths.has(episode.path))
      .map(episode => episode.id);
    if (missingIds.length > 0) {
      videoDb.prepare(`DELETE FROM video_episodes WHERE id IN (${missingIds.map(() => '?').join(', ')})`).run(...missingIds);
    }
    videoDb.prepare('DELETE FROM video_seasons WHERE id NOT IN (SELECT DISTINCT seasonId FROM video_episodes)').run();
    videoDb.prepare('DELETE FROM video_series WHERE id NOT IN (SELECT DISTINCT seriesId FROM video_episodes)').run();
    const seriesNeedingArtwork = videoDb.prepare(`
      SELECT s.id, s.title, s.posterPath, s.backdropPath, MIN(e.path) AS samplePath
      FROM video_series s
      JOIN video_episodes e ON e.seriesId = s.id
      GROUP BY s.id
    `).all() as Array<{ id: number; title: string; posterPath: string | null; backdropPath: string | null; samplePath: string }>;
    seriesNeedingArtwork.forEach(series => {
      const shouldRefreshPoster = !series.posterPath || series.posterPath.startsWith('/api/videos/poster/');
      const posterPath = shouldRefreshPoster ? findVideoArtwork(series.title, 'poster', series.samplePath) : series.posterPath;
      const backdropPath = series.backdropPath || findVideoArtwork(series.title, 'backdrop', series.samplePath);
      if (posterPath !== series.posterPath || backdropPath !== series.backdropPath) {
        videoDb.prepare('UPDATE video_series SET posterPath = ?, backdropPath = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
          .run(posterPath, backdropPath, series.id);
      }
    });

    const seriesCount = (videoDb.prepare('SELECT COUNT(*) AS count FROM video_series').get() as { count: number }).count;
    const episodeCount = (videoDb.prepare('SELECT COUNT(*) AS count FROM video_episodes').get() as { count: number }).count;

    const result = {
      success: true,
      newCount,
      updatedCount,
      skippedCount,
      removedCount: missingIds.length,
      seriesCount,
      episodeCount,
    };
    const completedAt = new Date().toISOString();
    videoSeriesPayloadCache = null;
    setVideoState('scan', { running: false, completedAt, ...result });
    return result;
  };

  // Scan music directory
  app.post('/api/scan', async (req, res) => {
    try {
      const files = await fg(['**/*.{mp3,flac,m4a,wav,aac}'], { cwd: MUSIC_DIR, absolute: true });
      let newCount = 0;

      for (const file of files) {
        const relativePath = path.relative(MUSIC_DIR, file);
        const existing = db.prepare('SELECT id FROM songs WHERE path = ?').get(relativePath);
        
        if (!existing) {
          try {
            const metadata = await mm.parseFile(file);
            const { common, format } = metadata;

            // Extract artwork if exists
            let coverArtPath = null;
            if (common.picture && common.picture.length > 0) {
              const pic = common.picture[0];
              if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR);
              
              const artFilename = `${Buffer.from(relativePath).toString('hex').slice(0, 16)}.${pic.format.split('/')[1] || 'jpg'}`;
              const artPath = path.join(ART_DIR, artFilename);
              fs.writeFileSync(artPath, pic.data);
              coverArtPath = `/api/art/${artFilename}`;
            }

            const artistId = getOrCreateArtist(common.artist || 'Unknown Artist');
            const genreId = common.genre && common.genre.length > 0 ? getOrCreateGenre(common.genre[0]) : null;
            const albumId = getOrCreateAlbum(common.album || 'Unknown Album', artistId, coverArtPath);

            db.prepare(`
              INSERT INTO songs (title, artistId, albumId, genreId, duration, path, format, year, trackNumber, discNumber, composer, albumArtist)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              common.title || path.basename(file),
              artistId,
              albumId,
              genreId,
              format.duration || 0,
              relativePath,
              format.container || 'unknown',
              common.year || null,
              common.track?.no || null,
              common.disk?.no || null,
              common.composer?.join(', ') || null,
              common.albumartist || null
            );
            newCount++;
          } catch (err) {
            console.error(`Error parsing ${file}:`, err);
          }
        }
      }
      res.json({ success: true, newCount });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/videos/scan', async (req, res) => {
    try {
      res.json(await scanVideoLibrary());
    } catch (error) {
      setVideoState('scan', { running: false, error: (error as Error).message, completedAt: new Date().toISOString() });
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/videos/series', async (req, res) => {
    try {
      if (req.query.scan === 'true') {
        await scanVideoLibrary();
      }
      res.json(getVideoSeriesPayload());
    } catch (error) {
      setVideoState('scan', { running: false, error: (error as Error).message, completedAt: new Date().toISOString() });
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/videos/series/:id', (req, res) => {
    try {
      const title = safeText(req.body?.title, 240);
      const posterPath = safeText(req.body?.posterPath, 1000) || null;
      if (!title) return res.status(400).json({ error: 'Series title is required' });

      const existing = videoDb.prepare('SELECT * FROM video_series WHERE id = ?').get(req.params.id) as any;
      if (!existing) return res.status(404).json({ error: 'Series not found' });

      let sortTitle = videoSortTitle(title);
      const duplicate = videoDb.prepare('SELECT id FROM video_series WHERE sortTitle = ? AND id != ?').get(sortTitle, req.params.id) as any;
      if (duplicate) sortTitle = `${sortTitle} ${req.params.id}`;

      videoDb.prepare(`
        UPDATE video_series
        SET title = ?, sortTitle = ?, posterPath = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        title,
        sortTitle,
        !posterPath || posterPath.startsWith('/api/videos/poster/') ? generatedVideoPosterPath(title) : posterPath,
        req.params.id
      );

      videoSeriesPayloadCache = null;
      const updated = getVideoSeriesPayload().find(series => series.id === Number(req.params.id));
      res.json({ success: true, series: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/videos/status', async (req, res) => {
    try {
      const scan = req.query.scan === 'true' ? await scanVideoLibrary() : null;
      const seriesCount = (videoDb.prepare('SELECT COUNT(*) AS count FROM video_series').get() as { count: number }).count;
      const seasonCount = (videoDb.prepare('SELECT COUNT(*) AS count FROM video_seasons').get() as { count: number }).count;
      const episodeCount = (videoDb.prepare('SELECT COUNT(*) AS count FROM video_episodes').get() as { count: number }).count;
      const scanState = getVideoState('scan');
      res.json({
        videoDir: VIDEO_DIR,
        seriesCount,
        seasonCount,
        episodeCount,
        lastScan: scanState?.value || null,
        lastScanUpdatedAt: scanState?.updatedAt || null,
        scan,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/videos/episodes/:id', (req, res) => {
    const episode = videoDb.prepare(`
      SELECT e.*, s.title AS seriesTitle, '/api/videos/episodes/' || e.id || '/stream' AS streamPath
      FROM video_episodes e
      JOIN video_series s ON s.id = e.seriesId
      WHERE e.id = ?
    `).get(req.params.id) as any;
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    episode.subtitlePath = findVideoSubtitle(episode.path);
    res.json(episode);
  });

  app.get('/api/videos/episodes/subtitle/*', (req, res) => {
    const requestedPath = req.params[0] || '';
    const filePath = resolveInside(VIDEO_DIR, requestedPath);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Subtitle not found');
    res.type(getSubtitleMime(filePath));
    res.sendFile(filePath);
  });

  app.get('/api/videos/episodes/:id/stream', (req, res) => {
    const episode = videoDb.prepare('SELECT * FROM video_episodes WHERE id = ?').get(req.params.id) as any;
    if (!episode) return res.status(404).send('Episode not found');
    const filePath = resolveInside(VIDEO_DIR, episode.path);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('File not found');
    sendRangeFile(req, res, filePath, getVideoMime(filePath));
  });

  app.get('/api/videos/progress', (req, res) => {
    const rows = videoDb.prepare(`
      SELECT
        e.*, s.title AS seriesTitle, s.posterPath, s.backdropPath,
        '/api/videos/episodes/' || e.id || '/stream' AS streamPath,
        p.positionMs, p.durationMs, p.completed, p.updatedAt AS progressUpdatedAt
      FROM video_watch_progress p
      JOIN video_episodes e ON e.id = p.episodeId
      JOIN video_series s ON s.id = e.seriesId
      WHERE p.completed = 0 AND p.positionMs > 5000
      ORDER BY p.updatedAt DESC
      LIMIT 20
    `).all() as any[];
    rows.forEach(row => {
      row.subtitlePath = findVideoSubtitle(row.path);
    });
    res.json({ items: rows });
  });

  app.get('/api/videos/episodes/:id/progress', (req, res) => {
    const progress = videoDb.prepare('SELECT * FROM video_watch_progress WHERE episodeId = ?').get(req.params.id) as any;
    res.json(progress || { episodeId: Number(req.params.id), positionMs: 0, durationMs: 0, completed: 0 });
  });

  app.post('/api/videos/episodes/:id/progress', (req, res) => {
    const episode = videoDb.prepare('SELECT id FROM video_episodes WHERE id = ?').get(req.params.id) as any;
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    const positionMs = boundedInteger(req.body?.positionMs, 0, 0, Number.MAX_SAFE_INTEGER);
    const durationMs = boundedInteger(req.body?.durationMs, 0, 0, Number.MAX_SAFE_INTEGER);
    const completed = req.body?.completed || (durationMs > 0 && positionMs >= durationMs - 15000) ? 1 : 0;
    videoDb.prepare(`
      INSERT INTO video_watch_progress (episodeId, positionMs, durationMs, completed, updatedAt)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(episodeId) DO UPDATE SET
        positionMs = excluded.positionMs,
        durationMs = excluded.durationMs,
        completed = excluded.completed,
        updatedAt = CURRENT_TIMESTAMP
    `).run(req.params.id, positionMs, durationMs, completed);
    res.json({ success: true, episodeId: Number(req.params.id), positionMs, durationMs, completed });
  });

  app.get('/api/videos/art/:filename', (req, res) => {
    const filePath = resolveInside(VIDEO_ART_DIR, req.params.filename);
    if (filePath && fs.existsSync(filePath)) {
      res.type(getImageMime(filePath));
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/videos/local-art/*', (req, res) => {
    const requestedPath = req.params[0] || '';
    const filePath = resolveInside(VIDEO_DIR, requestedPath);
    if (filePath && fs.existsSync(filePath)) {
      res.type(getImageMime(filePath));
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/videos/poster/:title', (req, res) => {
    const title = safeText(decodeURIComponent(req.params.title), 120) || 'Video';
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(part => part[0]?.toUpperCase())
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#0f3a3d"/><stop offset="0.58" stop-color="#151515"/><stop offset="1" stop-color="#1ed760"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><rect x="42" y="42" width="516" height="816" rx="34" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.18)" stroke-width="3"/><text x="300" y="390" text-anchor="middle" font-family="Arial, sans-serif" font-size="112" font-weight="800" fill="#ffffff">${initials}</text><text x="300" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="800" fill="#ffffff">${title.replace(/[&<>"]/g, '')}</text><text x="300" y="585" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#b8c4c2">LOCAL VIDEO</text></svg>`;
    res.type('image/svg+xml').send(svg);
  });

  // Get all songs with joined data
  app.get('/api/songs', (req, res) => {
    const { artistId, albumId, genreId } = req.query;
    let query = SONG_SELECT;
    const params: any[] = [];
    const conditions: string[] = [];

    if (artistId) {
      const artist = db.prepare('SELECT name FROM artists WHERE id = ?').get(artistId) as any;
      if (artist?.name) {
        const matchingIds = (db.prepare('SELECT id, name FROM artists').all() as Array<{ id: number; name: string }>)
          .filter((item) => normalizedName(item.name) === normalizedName(artist.name))
          .map((item) => item.id);
        if (matchingIds.length > 0) {
          conditions.push(`s.artistId IN (${matchingIds.map(() => '?').join(', ')})`);
          params.push(...matchingIds);
        } else {
          conditions.push('s.artistId = ?');
          params.push(artistId);
        }
      } else {
        conditions.push('s.artistId = ?');
        params.push(artistId);
      }
    }
    if (albumId) {
      const album = db.prepare('SELECT title FROM albums WHERE id = ?').get(albumId) as any;
      if (album?.title) {
        conditions.push('LOWER(TRIM(al.title)) = LOWER(TRIM(?))');
        params.push(album.title);
      } else {
        conditions.push('s.albumId = ?');
        params.push(albumId);
      }
    }
    if (genreId) {
      conditions.push('s.genreId = ?');
      params.push(genreId);
    }
    if (req.query.favorite === 'true') {
      conditions.push('s.isFavorite = 1');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    if (albumId) {
      query += ' ORDER BY COALESCE(s.discNumber, 1) ASC, COALESCE(s.trackNumber, 9999) ASC, s.title ASC';
    } else {
      query += ' ORDER BY s.dateAdded DESC';
    }
    
    const songs = db.prepare(query).all(...params);
    res.json(songs);
  });

  app.get('/api/recommendations', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const parsedCurrentId = Number(req.query.currentId);
    const currentId = Number.isInteger(parsedCurrentId) && parsedCurrentId > 0 ? parsedCurrentId : null;
    const now = new Date();
    const hour = boundedInteger(req.query.hour, now.getHours(), 0, 23);
    const dayOfWeek = boundedInteger(req.query.dayOfWeek, now.getDay(), 0, 6);

    const timeStart = (hour + 22) % 24;
    const timeEnd = (hour + 2) % 24;
    const timeCondition = timeStart <= timeEnd
      ? 'le.hour BETWEEN ? AND ?'
      : '(le.hour >= ? OR le.hour <= ?)';

    const query = `
      WITH current_track AS (
        SELECT artistId, albumId, genreId
        FROM songs
        WHERE id = ?
      ),
      recent_artist AS (
        SELECT artistId, COUNT(*) * 6.0 AS score
        FROM listening_events
        WHERE playedAt >= datetime('now', '-14 days') AND artistId IS NOT NULL
        GROUP BY artistId
      ),
      time_artist AS (
        SELECT artistId, COUNT(*) * 4.0 AS score
        FROM listening_events le
        WHERE ${timeCondition} AND artistId IS NOT NULL
        GROUP BY artistId
      ),
      time_genre AS (
        SELECT genreId, COUNT(*) * 3.0 AS score
        FROM listening_events le
        WHERE ${timeCondition} AND genreId IS NOT NULL
        GROUP BY genreId
      ),
      same_day AS (
        SELECT artistId, COUNT(*) * 2.0 AS score
        FROM listening_events
        WHERE dayOfWeek = ? AND artistId IS NOT NULL
        GROUP BY artistId
      )
      SELECT
        s.id, s.title, s.duration, s.path, s.format, s.dateAdded,
        s.isFavorite, s.playCount, s.lastPlayed,
        a.name as artist,
        al.title as album,
        al.coverArtPath,
        g.name as genre,
        (
          COALESCE(ra.score, 0) +
          COALESCE(ta.score, 0) +
          COALESCE(tg.score, 0) +
          COALESCE(sd.score, 0) +
          (s.playCount * 0.8) +
          (CASE WHEN ct.artistId IS NOT NULL AND s.artistId = ct.artistId THEN 7 ELSE 0 END) +
          (CASE WHEN ct.albumId IS NOT NULL AND s.albumId = ct.albumId THEN 5 ELSE 0 END) +
          (CASE WHEN ct.genreId IS NOT NULL AND s.genreId = ct.genreId THEN 4 ELSE 0 END) +
          (CASE WHEN s.isFavorite = 1 THEN 8 ELSE 0 END) +
          (CASE WHEN s.lastPlayed IS NULL THEN 3 ELSE 0 END) +
          (CASE WHEN s.lastPlayed >= datetime('now', '-18 hours') THEN -9 ELSE 0 END)
        ) AS recommendationScore,
        CASE
          WHEN ct.artistId IS NOT NULL AND s.artistId = ct.artistId THEN 'More from this artist'
          WHEN ct.albumId IS NOT NULL AND s.albumId = ct.albumId THEN 'From the same album'
          WHEN ct.genreId IS NOT NULL AND s.genreId = ct.genreId THEN 'Similar sound'
          WHEN COALESCE(ta.score, 0) > 0 THEN 'Matches this time of day'
          WHEN COALESCE(ra.score, 0) > 0 THEN 'Based on your recent artist plays'
          WHEN COALESCE(tg.score, 0) > 0 THEN 'Similar genre for now'
          WHEN s.isFavorite = 1 THEN 'From your liked tracks'
          WHEN s.playCount > 0 THEN 'One you return to'
          ELSE 'Fresh from your library'
        END AS reason
      FROM songs s
      LEFT JOIN artists a ON s.artistId = a.id
      LEFT JOIN albums al ON s.albumId = al.id
      LEFT JOIN genres g ON s.genreId = g.id
      LEFT JOIN recent_artist ra ON ra.artistId = s.artistId
      LEFT JOIN time_artist ta ON ta.artistId = s.artistId
      LEFT JOIN time_genre tg ON tg.genreId = s.genreId
      LEFT JOIN same_day sd ON sd.artistId = s.artistId
      LEFT JOIN current_track ct ON 1 = 1
      WHERE (? IS NULL OR s.id != ?)
      ORDER BY recommendationScore DESC, s.lastPlayed IS NULL DESC, RANDOM()
      LIMIT ?
    `;

    const params = [
      currentId,
      timeStart,
      timeEnd,
      timeStart,
      timeEnd,
      dayOfWeek,
      currentId,
      currentId,
      limit,
    ];
    const songs = db.prepare(query).all(...params);
    res.json(songs);
  });

  app.post('/api/songs/:id/skipped', (req, res) => {
    const result = db.prepare('UPDATE songs SET skipCount = COALESCE(skipCount, 0) + 1 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Song not found' });
    broadcast('library:stats', { songId: Number(req.params.id), skipped: true });
    res.json({ success: true });
  });

  app.patch('/api/songs/:id/metadata', (req, res) => {
    const song = songById(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    const title = safeText(req.body?.title || song.title, 240) || song.title;
    const artistName = safeText(req.body?.artist || song.artist, 240) || song.artist;
    const albumTitle = safeText(req.body?.album || song.album, 240) || song.album;
    const genreName = safeText(req.body?.genre || song.genre, 120);
    const albumArtist = safeText(req.body?.albumArtist || song.albumArtist, 240);
    const composer = safeText(req.body?.composer || song.composer, 240);
    const year = req.body?.year ? boundedInteger(req.body.year, Number(song.year || 0), 0, 3000) : song.year;
    const trackNumber = req.body?.trackNumber ? boundedInteger(req.body.trackNumber, Number(song.trackNumber || 0), 0, 999) : song.trackNumber;
    const discNumber = req.body?.discNumber ? boundedInteger(req.body.discNumber, Number(song.discNumber || 0), 0, 99) : song.discNumber;

    const artistId = getOrCreateArtist(artistName);
    const genreId = genreName ? getOrCreateGenre(genreName) : null;
    const albumId = getOrCreateAlbum(albumTitle || 'Unknown Album', Number(artistId), song.coverArtPath);
    const beforeJson = JSON.stringify(song);

    db.prepare(`
      UPDATE songs
      SET title = ?, artistId = ?, albumId = ?, genreId = ?, year = ?, trackNumber = ?, discNumber = ?, composer = ?, albumArtist = ?
      WHERE id = ?
    `).run(title, artistId, albumId, genreId, year || null, trackNumber || null, discNumber || null, composer || null, albumArtist || null, req.params.id);

    const updated = songById(req.params.id);
    db.prepare('INSERT INTO metadata_edits (songId, beforeJson, afterJson) VALUES (?, ?, ?)').run(req.params.id, beforeJson, JSON.stringify(updated));
    broadcast('library:metadata', updated);
    res.json({ success: true, song: updated, fileWrite: 'database-updated-file-tag-write-not-enabled' });
  });

  app.post('/api/metadata/undo', (req, res) => {
    const edit = db.prepare('SELECT * FROM metadata_edits ORDER BY id DESC LIMIT 1').get() as any;
    if (!edit) return res.status(404).json({ error: 'No metadata edit to undo' });
    const before = JSON.parse(edit.beforeJson);
    const artistId = getOrCreateArtist(before.artist || 'Unknown Artist');
    const genreId = before.genre ? getOrCreateGenre(before.genre) : null;
    const albumId = getOrCreateAlbum(before.album || 'Unknown Album', Number(artistId), before.coverArtPath || null);
    db.prepare(`
      UPDATE songs
      SET title = ?, artistId = ?, albumId = ?, genreId = ?, year = ?, trackNumber = ?, discNumber = ?, composer = ?, albumArtist = ?
      WHERE id = ?
    `).run(before.title, artistId, albumId, genreId, before.year || null, before.trackNumber || null, before.discNumber || null, before.composer || null, before.albumArtist || null, before.id);
    db.prepare('DELETE FROM metadata_edits WHERE id = ?').run(edit.id);
    const updated = songById(before.id);
    broadcast('library:metadata', updated);
    res.json({ success: true, song: updated });
  });

  app.get('/api/stats/overview', (req, res) => {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS songCount,
        COALESCE(SUM(duration), 0) AS libraryDuration,
        COALESCE(SUM(playCount), 0) AS playCount,
        COALESCE(SUM(skipCount), 0) AS skipCount,
        COALESCE(SUM(CASE WHEN isFavorite = 1 THEN 1 ELSE 0 END), 0) AS favoriteCount
      FROM songs
    `).get();
    const playedSeconds = db.prepare(`
      SELECT COALESCE(SUM(s.duration), 0) AS total
      FROM listening_events le
      JOIN songs s ON s.id = le.songId
    `).get();
    const topSongs = db.prepare(`${SONG_SELECT} ORDER BY s.playCount DESC, s.lastPlayed DESC LIMIT 10`).all();
    const topArtists = db.prepare(`
      SELECT a.id, a.name, COUNT(le.id) AS plays, COALESCE(SUM(s.duration), 0) AS seconds
      FROM artists a
      JOIN songs s ON s.artistId = a.id
      LEFT JOIN listening_events le ON le.songId = s.id
      GROUP BY a.id
      ORDER BY plays DESC, seconds DESC
      LIMIT 10
    `).all();
    const topAlbums = db.prepare(`
      SELECT al.id, al.title, al.coverArtPath, a.name AS artist, COUNT(le.id) AS plays
      FROM albums al
      JOIN artists a ON a.id = al.artistId
      JOIN songs s ON s.albumId = al.id
      LEFT JOIN listening_events le ON le.songId = s.id
      GROUP BY al.id
      ORDER BY plays DESC
      LIMIT 10
    `).all();
    const genreDistribution = db.prepare(`
      SELECT COALESCE(g.name, 'Unknown') AS name, COUNT(s.id) AS tracks, COALESCE(SUM(s.playCount), 0) AS plays
      FROM songs s
      LEFT JOIN genres g ON g.id = s.genreId
      GROUP BY g.name
      ORDER BY tracks DESC
      LIMIT 12
    `).all();
    const hourly = db.prepare('SELECT hour, COUNT(*) AS plays FROM listening_events GROUP BY hour ORDER BY hour').all();
    const daily = db.prepare('SELECT dayOfWeek, COUNT(*) AS plays FROM listening_events GROUP BY dayOfWeek ORDER BY dayOfWeek').all();
    const recent = db.prepare(`${SONG_SELECT} WHERE s.lastPlayed IS NOT NULL ORDER BY s.lastPlayed DESC LIMIT 20`).all();
    res.json({ totals, playedSeconds, topSongs, topArtists, topAlbums, genreDistribution, hourly, daily, recent });
  });

  app.get('/api/mixes', (req, res) => {
    const mixQueries: Record<string, string> = {
      focus: `${SONG_SELECT} WHERE COALESCE(g.name, '') NOT LIKE '%metal%' ORDER BY s.playCount DESC, s.duration DESC LIMIT 40`,
      chill: `${SONG_SELECT} WHERE COALESCE(g.name, '') LIKE '%chill%' OR COALESCE(g.name, '') LIKE '%ambient%' OR s.playCount > 0 ORDER BY s.lastPlayed DESC LIMIT 40`,
      workout: `${SONG_SELECT} WHERE COALESCE(g.name, '') LIKE '%dance%' OR COALESCE(g.name, '') LIKE '%rock%' OR COALESCE(g.name, '') LIKE '%pop%' ORDER BY s.playCount DESC LIMIT 40`,
      lateNight: `${SONG_SELECT} LEFT JOIN listening_events le ON le.songId = s.id WHERE le.hour >= 21 OR le.hour <= 4 GROUP BY s.id ORDER BY COUNT(le.id) DESC LIMIT 40`,
      recentlyForgotten: `${SONG_SELECT} WHERE s.lastPlayed IS NULL OR s.lastPlayed < datetime('now', '-30 days') ORDER BY s.isFavorite DESC, s.dateAdded ASC LIMIT 40`,
      heavyRotation: `${SONG_SELECT} ORDER BY s.playCount DESC, s.lastPlayed DESC LIMIT 40`,
    };
    const mixes = Object.entries(mixQueries).map(([id, query]) => ({
      id,
      name: id.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase()),
      songs: db.prepare(query).all(),
    }));
    res.json(mixes);
  });

  app.get('/api/duplicates', (req, res) => {
    const rows = db.prepare(`${SONG_SELECT} ORDER BY a.name, s.title`).all() as any[];
    const groups = new Map<string, any[]>();
    rows.forEach(song => {
      const key = songFingerprint(song);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(song);
    });
    const ignored = new Set((db.prepare('SELECT fingerprint FROM duplicate_ignores').all() as any[]).map(row => row.fingerprint));
    const duplicates = [...groups.entries()]
      .filter(([fingerprint, items]) => items.length > 1 && !ignored.has(fingerprint))
      .map(([fingerprint, items]) => ({ fingerprint, reason: 'Similar title, artist, and duration', items }));
    res.json({ duplicates });
  });

  app.post('/api/duplicates/ignore', (req, res) => {
    const fingerprint = safeText(req.body?.fingerprint, 500);
    if (!fingerprint) return res.status(400).json({ error: 'fingerprint is required' });
    db.prepare('INSERT OR IGNORE INTO duplicate_ignores (fingerprint) VALUES (?)').run(fingerprint);
    res.json({ success: true });
  });

  app.get('/api/library/health', async (req, res) => {
    const rows = db.prepare(`${SONG_SELECT}`).all() as any[];
    const missingFiles: any[] = [];
    const missingArtwork: any[] = [];
    const unknownArtists: any[] = [];
    const unknownAlbums: any[] = [];
    const unsupportedFormats: any[] = [];
    rows.forEach(song => {
      const filePath = resolveInside(MUSIC_DIR, song.path);
      if (!filePath || !fs.existsSync(filePath)) missingFiles.push(song);
      if (!song.coverArtPath) missingArtwork.push(song);
      if (!song.artist || song.artist === 'Unknown Artist') unknownArtists.push(song);
      if (!song.album || song.album === 'Unknown Album') unknownAlbums.push(song);
      if (!AUDIO_MIME_TYPES[path.extname(song.path).slice(1).toLowerCase()]) unsupportedFormats.push(song);
    });
    const emptyFolders = (await fg(['**/'], { cwd: MUSIC_DIR, onlyDirectories: true }))
      .filter(folder => fs.readdirSync(path.join(MUSIC_DIR, folder)).length === 0);
    res.json({ missingFiles, missingArtwork, unknownArtists, unknownAlbums, unsupportedFormats, emptyFolders });
  });

  app.get('/api/playlists/:id/export', (req, res) => {
    const format = String(req.query.format || 'm3u').toLowerCase();
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(req.params.id) as any;
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    const songs = db.prepare(`
      SELECT s.path, s.title, s.duration, a.name AS artist
      FROM playlist_songs ps
      JOIN songs s ON s.id = ps.songId
      LEFT JOIN artists a ON a.id = s.artistId
      WHERE ps.playlistId = ?
      ORDER BY ps.position ASC
    `).all(req.params.id) as any[];
    if (format === 'json') return res.json({ playlist, songs });
    const body = ['#EXTM3U', ...songs.flatMap(song => [`#EXTINF:${Math.round(song.duration || 0)},${song.artist || ''} - ${song.title}`, song.path])].join('\n');
    res.type('audio/x-mpegurl').send(body);
  });

  app.post('/api/playlists/import', express.text({ type: ['text/*', 'application/x-mpegurl', 'audio/x-mpegurl'] }), (req, res) => {
    const name = safeText(req.query.name || req.body?.name || `Imported ${new Date().toLocaleString()}`, 180);
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const result = db.prepare('INSERT OR IGNORE INTO playlists (name) VALUES (?)').run(name);
    const playlist = db.prepare('SELECT id FROM playlists WHERE name = ?').get(name) as any;
    const paths = raw.trim().startsWith('{')
      ? (JSON.parse(raw).songs || []).map((song: any) => String(song.path || song))
      : raw.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    let added = 0;
    paths.forEach((playlistPath: string) => {
      const song = db.prepare('SELECT id FROM songs WHERE path = ? OR path LIKE ?').get(playlistPath, `%${playlistPath}`) as any;
      if (song) {
        const maxPos = db.prepare('SELECT MAX(position) as m FROM playlist_songs WHERE playlistId = ?').get(playlist.id) as any;
        try {
          db.prepare('INSERT INTO playlist_songs (playlistId, songId, position) VALUES (?, ?, ?)').run(playlist.id, song.id, (maxPos?.m || 0) + 1);
          added++;
        } catch {}
      }
    });
    res.json({ id: playlist.id, created: result.changes > 0, added, missing: paths.length - added });
  });

  app.get('/api/profiles', (req, res) => {
    res.json(db.prepare('SELECT id, name, isGuest, createdAt, lastActive FROM profiles ORDER BY id').all());
  });

  app.post('/api/profiles', (req, res) => {
    const name = safeText(req.body?.name, 80);
    if (!name) return res.status(400).json({ error: 'Profile name is required' });
    const result = db.prepare('INSERT INTO profiles (name, pin, isGuest, lastActive) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(name, safeText(req.body?.pin, 20) || null, req.body?.isGuest ? 1 : 0);
    res.json({ id: result.lastInsertRowid, name });
  });

  app.get('/api/eq-presets', (req, res) => {
    const profileId = Number(req.query.profileId || 1);
    res.json(db.prepare('SELECT * FROM eq_presets WHERE profileId = ? ORDER BY updatedAt DESC').all(profileId));
  });

  app.post('/api/eq-presets', (req, res) => {
    const profileId = Number(req.body?.profileId || 1);
    const name = safeText(req.body?.name, 80) || 'Custom';
    const bands = JSON.stringify(req.body?.bands || {});
    db.prepare(`
      INSERT INTO eq_presets (profileId, name, bands, updatedAt)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(profileId, name) DO UPDATE SET bands = excluded.bands, updatedAt = CURRENT_TIMESTAMP
    `).run(profileId, name, bands);
    broadcast('settings:eq', { profileId, name, bands: JSON.parse(bands) });
    res.json({ success: true });
  });

  app.get('/api/discovery', (req, res) => {
    res.json({ name: 'Streamify Local', port: PORT, websocket: `/ws`, offline: true, version: 'local-premium' });
  });

  app.get('/api/realtime/state', (req, res) => {
    res.json(realtimeState);
  });

  app.post('/api/realtime/state', (req, res) => {
    realtimeState.playback = {
      ...realtimeState.playback,
      songId: req.body?.songId ?? realtimeState.playback.songId,
      isPlaying: Boolean(req.body?.isPlaying),
      progress: Number(req.body?.progress || 0),
      volume: Number(req.body?.volume ?? realtimeState.playback.volume),
      updatedAt: new Date().toISOString(),
    };
    broadcast('playback:state', realtimeState.playback);
    res.json(realtimeState.playback);
  });

  // Get lyrics
  app.get('/api/songs/:id/lyrics', (req, res) => {
    // In a real system, we would look for .lrc or .txt files
    // For this MVP, we return a nice placeholder or simulated lyrics based on metadata
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id) as any;
    if (!song) return res.status(404).json({ error: 'Song not found' });
    
    // Simulate finding lyrics
    res.json({
      lyrics: `[00:00.00] Enjoying ${song.title}...\n[00:05.00] This is a local stream from Streamify\n[00:10.00] High fidelity audio playback active\n[00:15.00] No internet required for this experience.\n\n[Chorus]\nStreaming locally via Wi-Fi\nYour music, your space, your server.\n\n[Bridge]\nMinimal delay, maximum quality.\n`
    });
  });

  // Download song
  app.get('/api/download/:id', (req, res) => {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id) as any;
    if (!song) return res.status(404).send('Song not found');
    const filePath = resolveInside(MUSIC_DIR, song.path);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('File not found');
    const extension = path.extname(filePath) || `.${song.format || 'audio'}`;
    const safeTitle = String(song.title || 'song').replace(/[\\/:*?"<>|]/g, '_');
    res.download(filePath, `${safeTitle}${extension}`);
  });

  // Get all artists
  app.get('/api/artists', (req, res) => {
    const rows = db.prepare(`
      SELECT a.id, a.name, COUNT(s.id) AS trackCount
      FROM artists a
      LEFT JOIN songs s ON s.artistId = a.id
      GROUP BY a.id
      ORDER BY a.id ASC
    `).all() as Array<{ id: number; name: string; trackCount: number }>;
    const artists = Array.from(rows.reduce((groups, row) => {
      const key = normalizedName(row.name);
      const existing = groups.get(key);
      if (existing) {
        existing.trackCount += row.trackCount || 0;
      } else {
        groups.set(key, { id: row.id, name: displayArtistName(row.name), trackCount: row.trackCount || 0 });
      }
      return groups;
    }, new Map<string, { id: number; name: string; trackCount: number }>()).values())
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(artists);
  });

  // Get all albums
  app.get('/api/albums', (req, res) => {
    const rows = db.prepare(`
      SELECT
        al.id,
        al.title,
        al.coverArtPath,
        a.name as artist,
        COUNT(s.id) AS trackCount,
        COALESCE(SUM(s.duration), 0) AS duration
      FROM albums al
      JOIN artists a ON al.artistId = a.id
      LEFT JOIN songs s ON s.albumId = al.id
      GROUP BY al.id
      ORDER BY al.id ASC
    `).all() as Array<{ id: number; title: string; coverArtPath: string | null; artist: string; trackCount: number; duration: number }>;
    const albums = Array.from(rows.reduce((groups, row) => {
      const key = normalizedAlbumTitle(row.title);
      const existing = groups.get(key);
      if (existing) {
        existing.trackCount += row.trackCount || 0;
        existing.duration += row.duration || 0;
        if (!existing.coverArtPath && row.coverArtPath) existing.coverArtPath = row.coverArtPath;
      } else {
        groups.set(key, {
          id: row.id,
          title: safeText(row.title, 240) || 'Unknown Album',
          artist: displayArtistName(row.artist),
          coverArtPath: row.coverArtPath,
          trackCount: row.trackCount || 0,
          duration: row.duration || 0,
        });
      }
      return groups;
    }, new Map<string, { id: number; title: string; artist: string; coverArtPath: string | null; trackCount: number; duration: number }>()).values())
      .sort((a, b) => a.title.localeCompare(b.title));
    res.json(albums);
  });

  // Get all genres
  app.get('/api/genres', (req, res) => {
    const genres = db.prepare('SELECT * FROM genres ORDER BY name ASC').all();
    res.json(genres);
  });

  // Stream a song
  app.get('/api/stream/:id', (req, res) => {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id) as any;
    if (!song) return res.status(404).send('Song not found');

    const filePath = resolveInside(MUSIC_DIR, song.path);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('File not found');

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = getAudioMime(filePath);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
      }
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // Serve artwork
  app.get('/api/art/:filename', (req, res) => {
    const filePath = resolveInside(ART_DIR, req.params.filename);
    if (filePath && fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not found');
    }
  });

  app.get('/api/artist-photo/:artist', (req, res) => {
    const stem = artistPhotoStem(decodeURIComponent(req.params.artist));
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    const filePath = extensions
      .map((extension) => resolveInside(ARTIST_PHOTOS_DIR, `${stem}.${extension}`))
      .find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));

    if (!filePath) {
      res.status(404).send('Not found');
      return;
    }

    res.type(getImageMime(filePath));
    res.sendFile(filePath);
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite Integration
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  const server = createHttpServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    allClients.add(socket);
    socket.send(JSON.stringify({ type: 'hello', payload: { ...realtimeState, client: req.socket.remoteAddress }, sentAt: new Date().toISOString() }));
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(String(data));
        if (message.type === 'playback:state') {
          realtimeState.playback = { ...realtimeState.playback, ...message.payload, updatedAt: new Date().toISOString() };
          broadcast('playback:state', realtimeState.playback);
        } else if (message.type === 'remote:command') {
          broadcast('remote:command', message.payload);
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid realtime message' }, sentAt: new Date().toISOString() }));
      }
    });
    socket.on('close', () => allClients.delete(socket));
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
