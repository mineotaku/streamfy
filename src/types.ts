export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  isFavorite: number;
  playCount: number;
  lastPlayed: string | null;
  duration: number;
  path: string;
  coverArtPath: string | null;
  format: string;
  dateAdded: string;
}

export interface Playlist {
  id: number;
  name: string;
  createdAt: string;
}

export interface Artist {
  id: number;
  name: string;
}

export interface Album {
  id: number;
  title: string;
  artist: string;
  coverArtPath: string | null;
}

export interface Genre {
  id: number;
  name: string;
}

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
  queue: Song[];
  currentIndex: number;
  repeatMode: 'none' | 'all' | 'one';
  shuffle: boolean;
}
