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
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  composer?: string | null;
  albumArtist?: string | null;
  skipCount?: number;
  reason?: string;
  recommendationScore?: number;
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
  trackCount?: number;
  duration?: number;
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

export interface VideoEpisode {
  id: number;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  duration?: number | null;
  thumbnailPath?: string | null;
  streamPath?: string | null;
  description?: string | null;
}

export interface VideoSeason {
  seasonNumber: number;
  title?: string | null;
  episodes: VideoEpisode[];
}

export interface VideoSeries {
  id: number;
  title: string;
  sortTitle?: string | null;
  description?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  seasons: VideoSeason[];
}
