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

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const MUSIC_DIR = path.join(process.cwd(), 'music');
  const ART_DIR = path.join(process.cwd(), 'art');

  // Ensure music directory exists
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    // Add a placeholder or instructions if empty?
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
    const result = db.prepare('UPDATE songs SET playCount = playCount + 1, lastPlayed = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Song not found' });
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
    let query = `
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
