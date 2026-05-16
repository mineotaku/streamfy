import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import * as mm from 'music-metadata';
import fg from 'fast-glob';
import cors from 'cors';

const AUDIO_MIME_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
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

function getImageMime(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return IMAGE_MIME_TYPES[extension] || 'application/octet-stream';
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

const SONG_SELECT = `
  SELECT 
    s.id, s.title, s.duration, s.path, s.format, s.dateAdded,
    s.isFavorite, s.playCount, s.lastPlayed,
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
  const ART_DIR = path.join(process.cwd(), 'art');
  const ARTIST_PHOTOS_DIR = path.join(process.cwd(), 'artist-photos');

  // Ensure music directory exists
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    // Add a placeholder or instructions if empty?
  }

  if (!fs.existsSync(ARTIST_PHOTOS_DIR)) {
    fs.mkdirSync(ARTIST_PHOTOS_DIR, { recursive: true });
  }

  const db = new Database('streamify.db');
  db.pragma('journal_mode = WAL');

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
  `);

  ensureColumn(db, 'songs', 'isFavorite', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'songs', 'playCount', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'songs', 'lastPlayed', 'DATETIME');

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

  // Helper to get or create artist
  const getOrCreateArtist = (name: string) => {
    const row = db.prepare('SELECT id FROM artists WHERE name = ?').get(name) as any;
    if (row) return row.id;
    const result = db.prepare('INSERT INTO artists (name) VALUES (?)').run(name);
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
              INSERT INTO songs (title, artistId, albumId, genreId, duration, path, format)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              common.title || path.basename(file),
              artistId,
              albumId,
              genreId,
              format.duration || 0,
              relativePath,
              format.container || 'unknown'
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

  // Get all songs with joined data
  app.get('/api/songs', (req, res) => {
    const { artistId, albumId, genreId } = req.query;
    let query = SONG_SELECT;
    const params: any[] = [];
    const conditions: string[] = [];

    if (artistId) {
      conditions.push('s.artistId = ?');
      params.push(artistId);
    }
    if (albumId) {
      conditions.push('s.albumId = ?');
      params.push(albumId);
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
    
    query += ' ORDER BY s.dateAdded DESC';
    
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
    const artists = db.prepare('SELECT * FROM artists ORDER BY name ASC').all();
    res.json(artists);
  });

  // Get all albums
  app.get('/api/albums', (req, res) => {
    const albums = db.prepare(`
      SELECT al.*, a.name as artist 
      FROM albums al 
      JOIN artists a ON al.artistId = a.id 
      ORDER BY al.title ASC
    `).all();
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
