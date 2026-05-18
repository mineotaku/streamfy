import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, 
  Volume2, VolumeX, ListMusic, Repeat, 
  Shuffle, Heart, Search, Library as LibraryIcon,
  Home, PlusCircle, Settings, Music2,
  ChevronDown, Maximize2, Plus, MoreVertical,
  CheckCircle2, Headphones, Share2, Menu,
  Download, Info, Timer, SlidersHorizontal,
  Radio, Mic2, Gauge, X, Volume1, RotateCcw,
  Clock3, Sparkles, GripVertical, Trash2, Pencil,
  Disc3, UserRound, BarChart3, Wrench, Users,
  Keyboard, Upload, FileText, ShieldCheck, Minimize2,
  AudioLines, BadgeInfo, QrCode, Clapperboard, Tv
  , Rewind, FastForward, Languages, Sun, Subtitles, PictureInPicture2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Song, PlayerState, Artist, Album, Genre, Playlist, VideoEpisode, VideoSeason, VideoSeries } from './types';

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();

  if (!contentType.includes('application/json')) {
    const htmlHint = body.trimStart().startsWith('<')
      ? 'Received the app shell instead of API JSON. Restart the Streamify server so the latest API routes are active.'
      : body.slice(0, 160);
    throw new Error(`${label} returned ${response.status} ${response.statusText || ''}. ${htmlHint}`.trim());
  }

  const data = JSON.parse(body) as T;
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error) : response.statusText;
    throw new Error(`${label} failed: ${message || response.status}`);
  }

  return data;
}

const AUDIO_PLAYBACK_KEY = 'streamify.playback.audio.v1';
const VIDEO_PLAYBACK_KEY = 'streamify.playback.video.v1';

type SavedAudioPlayback = {
  songId: number;
  currentTime: number;
  queueIds: number[];
  volume: number;
  playbackSpeed: number;
  savedAt: number;
};

type SavedVideoPlayback = {
  episodeId: number;
  currentTime: number;
  duration: number;
  volume: number;
  brightness: number;
  playbackRate: number;
  savedAt: number;
};

function readStoredJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function App() {
  const eqPresets: Record<string, Record<string, number>> = {
    Flat: { '60Hz': 0, '170Hz': 0, '310Hz': 0, '600Hz': 0, '1kHz': 0, '3kHz': 0, '6kHz': 0, '12kHz': 0, '14kHz': 0, '16kHz': 0 },
    'Bass Boost': { '60Hz': 7, '170Hz': 5, '310Hz': 3, '600Hz': 0, '1kHz': 0, '3kHz': 0, '6kHz': 1, '12kHz': 2, '14kHz': 2, '16kHz': 1 },
    'Vocal Clarity': { '60Hz': -2, '170Hz': -1, '310Hz': 1, '600Hz': 3, '1kHz': 5, '3kHz': 5, '6kHz': 3, '12kHz': 1, '14kHz': 0, '16kHz': 0 },
    'Night Mode': { '60Hz': -4, '170Hz': -2, '310Hz': 0, '600Hz': 1, '1kHz': 1, '3kHz': 1, '6kHz': -1, '12kHz': -3, '14kHz': -4, '16kHz': -4 },
    Acoustic: { '60Hz': 2, '170Hz': 2, '310Hz': 1, '600Hz': 2, '1kHz': 2, '3kHz': 3, '6kHz': 2, '12kHz': 1, '14kHz': 1, '16kHz': 0 },
    'Treble Boost': { '60Hz': -2, '170Hz': -1, '310Hz': 0, '600Hz': 0, '1kHz': 1, '3kHz': 3, '6kHz': 5, '12kHz': 6, '14kHz': 6, '16kHz': 5 },
    Podcast: { '60Hz': -5, '170Hz': -2, '310Hz': 1, '600Hz': 3, '1kHz': 5, '3kHz': 4, '6kHz': 1, '12kHz': -2, '14kHz': -3, '16kHz': -4 },
    Custom: { '60Hz': 0, '170Hz': 0, '310Hz': 0, '600Hz': 0, '1kHz': 0, '3kHz': 0, '6kHz': 0, '12kHz': 0, '14kHz': 0, '16kHz': 0 },
  };
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  
  const [activeView, setActiveView] = useState<'home' | 'library' | 'videos'>('home');
  const [libraryTab, setLibraryTab] = useState<'songs' | 'artists' | 'albums' | 'genres'>('songs');
  const [selectedFilter, setSelectedFilter] = useState<{ type: string, id: number, name: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistDraftName, setPlaylistDraftName] = useState('');
  const [smartQueue, setSmartQueue] = useState<Song[]>([]);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const [draggedPlaylistIndex, setDraggedPlaylistIndex] = useState<number | null>(null);

  const [playerState, setPlayerState] = useState<PlayerState>({
    currentSong: null,
    isPlaying: false,
    progress: 0,
    volume: 0.7,
    queue: [],
    currentIndex: -1,
    repeatMode: 'none',
    shuffle: false,
  });
  
  const [isExpandedPlayer, setIsExpandedPlayer] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null); // minutes
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showQueueSheet, setShowQueueSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [showStatsSheet, setShowStatsSheet] = useState(false);
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const [showMetadataSheet, setShowMetadataSheet] = useState(false);
  const [showSongCreditsSheet, setShowSongCreditsSheet] = useState(false);
  const [showSpotifyCodeSheet, setShowSpotifyCodeSheet] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [crossfade, setCrossfade] = useState(4);
  const [audioBoost, setAudioBoost] = useState(0);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [showVisualizer, setShowVisualizer] = useState(true);
  const [losslessMode, setLosslessMode] = useState(false);
  const [eqPreset, setEqPreset] = useState('Flat');
  const [eqBands, setEqBands] = useState<Record<string, number>>({
    '60Hz': 0, '170Hz': 0, '310Hz': 0, '600Hz': 0, '1kHz': 0,
    '3kHz': 0, '6kHz': 0, '12kHz': 0, '14kHz': 0, '16kHz': 0
  });
  const [theme, setTheme] = useState({ primary: '#1ed760', secondary: '#408da3', accent: '#ffffff', background: '#121212', text: '#ffffff' });
  const [stats, setStats] = useState<any | null>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [health, setHealth] = useState<any | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [mixes, setMixes] = useState<any[]>([]);
  const [metadataDraft, setMetadataDraft] = useState<Record<string, any>>({});
  const [videoSeries, setVideoSeries] = useState<VideoSeries[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [selectedVideoSeries, setSelectedVideoSeries] = useState<VideoSeries | null>(null);
  const [selectedVideoSeason, setSelectedVideoSeason] = useState<VideoSeason | null>(null);
  const [selectedVideoEpisode, setSelectedVideoEpisode] = useState<VideoEpisode | null>(null);
  const [audioResumeRestored, setAudioResumeRestored] = useState(false);
  const sleepTimeoutRef = useRef<number | null>(null);
  const playerStateRef = useRef<PlayerState>(playerState);
  const songsRef = useRef<Song[]>([]);
  const autoplayNextRef = useRef(autoplayNext);
  const smartQueueRef = useRef<Song[]>([]);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const playbackSpeedRef = useRef(playbackSpeed);
  const crossfadeRef = useRef(crossfade);
  const secondaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const preparedNextRef = useRef<{ songId: number, src: string } | null>(null);
  const transitionInProgressRef = useRef(false);
  const fadeFrameRef = useRef<number | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const eqFilterRefs = useRef<BiquadFilterNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);

  const saveAudioPlayback = (audio = audioRef.current, state = playerStateRef.current) => {
    if (!audio || !state.currentSong) return;
    writeStoredJson(AUDIO_PLAYBACK_KEY, {
      songId: state.currentSong.id,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      queueIds: state.queue.map(song => song.id),
      volume: volumeRef.current,
      playbackSpeed: playbackSpeedRef.current,
      savedAt: Date.now(),
    } satisfies SavedAudioPlayback);
  };

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    if (audioResumeRestored || songs.length === 0 || !audioRef.current) return;
    const saved = readStoredJson<SavedAudioPlayback>(AUDIO_PLAYBACK_KEY);
    if (!saved?.songId) {
      setAudioResumeRestored(true);
      return;
    }
    const song = songs.find(item => item.id === saved.songId);
    if (!song) {
      setAudioResumeRestored(true);
      return;
    }
    const queue = saved.queueIds
      .map(id => songs.find(item => item.id === id))
      .filter((item): item is Song => Boolean(item));
    const nextQueue = queue.length > 0 ? queue : [song];
    const currentIndex = Math.max(nextQueue.findIndex(item => item.id === song.id), 0);
    const audio = audioRef.current;
    audio.src = `/api/stream/${song.id}`;
    audio.volume = saved.volume ?? volumeRef.current;
    audio.playbackRate = saved.playbackSpeed ?? playbackSpeedRef.current;
    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = Math.min(saved.currentTime || 0, Math.max(audio.duration - 2, 0));
    }, { once: true });
    setVolume(saved.volume ?? volumeRef.current);
    setPlaybackSpeed(saved.playbackSpeed ?? playbackSpeedRef.current);
    setPlayerState(prev => ({
      ...prev,
      currentSong: song,
      queue: nextQueue,
      currentIndex,
      isPlaying: false,
      progress: song.duration ? ((saved.currentTime || 0) / song.duration) * 100 : 0,
    }));
    setAudioResumeRestored(true);
  }, [songs, audioResumeRestored]);

  useEffect(() => {
    autoplayNextRef.current = autoplayNext;
  }, [autoplayNext]);

  useEffect(() => {
    smartQueueRef.current = smartQueue;
  }, [smartQueue]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    crossfadeRef.current = crossfade;
  }, [crossfade]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      (audioRef.current as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (gainRef.current) {
      const boostGain = Math.pow(10, audioBoost / 20);
      gainRef.current.gain.value = normalizeAudio ? Math.min(boostGain, 1.5) : boostGain;
    }
  }, [audioBoost, normalizeAudio]);

  useEffect(() => {
    eqFilterRefs.current.forEach((filter, index) => {
      const key = Object.keys(eqBands)[index];
      if (key) filter.gain.setTargetAtTime(eqBands[key], audioContextRef.current?.currentTime || 0, 0.015);
    });
  }, [eqBands]);

  useEffect(() => {
    document.documentElement.style.setProperty('--dynamic-primary', theme.primary);
    document.documentElement.style.setProperty('--dynamic-secondary', theme.secondary);
    document.documentElement.style.setProperty('--dynamic-bg', theme.background);
  }, [theme]);

  useEffect(() => {
    if (playerState.currentSong?.coverArtPath) {
      extractTheme(playerState.currentSong.coverArtPath);
    }
  }, [playerState.currentSong?.coverArtPath]);

  const initAudioContext = () => {
    if (!audioContextRef.current && audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
      const filters = frequencies.map((frequency) => {
        const filter = context.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        return filter;
      });
      const boostGain = Math.pow(10, audioBoost / 20);
      gain.gain.value = normalizeAudio ? Math.min(boostGain, 1.5) : boostGain;
      analyser.fftSize = 128; // Smaller for smoother visualizer
      
      const source = context.createMediaElementSource(audioRef.current);
      source.connect(filters[0]);
      filters.forEach((filter, index) => {
        filter.gain.value = eqBands[Object.keys(eqBands)[index]] || 0;
        filter.connect(filters[index + 1] || analyser);
      });
      analyser.connect(gain);
      gain.connect(context.destination);
      
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      gainRef.current = gain;
      eqFilterRefs.current = filters;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateVisualizer = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          setVisualizerData(new Uint8Array(dataArray));
        }
        animationFrameRef.current = requestAnimationFrame(updateVisualizer);
      };
      
      updateVisualizer();
    }
    
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  useEffect(() => {
    if (playerState.currentIndex !== -1 && playerState.queue.length > 0) {
      setPlayerState(prev => ({ ...prev, currentSong: prev.queue[prev.currentIndex] }));
    }
  }, [playerState.currentIndex]);

  const getPreparedCandidate = (state = playerStateRef.current) => {
    if (!state.currentSong) return null;
    if (state.repeatMode === 'one') return state.currentSong;
    if (state.currentIndex >= 0 && state.currentIndex < state.queue.length - 1) {
      return state.queue[state.currentIndex + 1];
    }
    if (state.repeatMode === 'all' && state.queue.length > 0) {
      return state.queue[0];
    }
    if (!autoplayNextRef.current) return null;
    return smartQueueRef.current.find(song => song.id !== state.currentSong?.id) || null;
  };

  const prepareUpcomingSong = (song?: Song | null) => {
    const nextAudio = secondaryAudioRef.current;
    if (!nextAudio || !song) return;
    const src = `/api/stream/${song.id}`;
    if (preparedNextRef.current?.songId === song.id && nextAudio.src.includes(src)) return;
    nextAudio.pause();
    nextAudio.src = src;
    nextAudio.preload = 'auto';
    nextAudio.volume = 0;
    nextAudio.muted = isMutedRef.current;
    nextAudio.playbackRate = playbackSpeedRef.current;
    nextAudio.load();
    preparedNextRef.current = { songId: song.id, src };
  };

  useEffect(() => {
    if (playerState.currentSong) {
      fetchLyrics(playerState.currentSong.id);
      fetchSmartQueue(playerState.currentSong.id, 12);
      prepareUpcomingSong(getPreparedCandidate());
    }
  }, [playerState.currentSong]);

  const fetchLyrics = async (id: number) => {
    try {
      const res = await fetch(`/api/songs/${id}/lyrics`);
      const data = await res.json();
      setLyrics(data.lyrics);
    } catch (e) {
      setLyrics("Lyrics not available for this song.");
    }
  };

  const setTimer = (mins: number) => {
    if (sleepTimeoutRef.current) {
      window.clearTimeout(sleepTimeoutRef.current);
    }
    setSleepTimer(mins);
    setShowSleepModal(false);
    sleepTimeoutRef.current = window.setTimeout(() => {
      audioRef.current?.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      setSleepTimer(null);
      sleepTimeoutRef.current = null;
    }, mins * 60 * 1000);
  };

  const clearSleepTimer = () => {
    if (sleepTimeoutRef.current) {
      window.clearTimeout(sleepTimeoutRef.current);
      sleepTimeoutRef.current = null;
    }
    setSleepTimer(null);
    setShowSleepModal(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const newMute = !isMuted;
      audioRef.current.muted = newMute;
      if (secondaryAudioRef.current) secondaryAudioRef.current.muted = newMute;
      setIsMuted(newMute);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    setVolume(newVal);
    if (audioRef.current) {
      audioRef.current.volume = newVal;
      setIsMuted(newVal === 0);
    }
    if (secondaryAudioRef.current && !transitionInProgressRef.current) {
      secondaryAudioRef.current.volume = 0;
    }
    setPlayerState(prev => ({ ...prev, volume: newVal }));
  };

  const buildRecommendationUrl = (currentId?: number | null, limit = 20) => {
    const now = new Date();
    const params = new URLSearchParams({
      limit: String(limit),
      hour: String(now.getHours()),
      dayOfWeek: String(now.getDay()),
    });
    if (currentId) params.set('currentId', String(currentId));
    return `/api/recommendations?${params.toString()}`;
  };

  const fetchSmartQueue = async (currentId?: number | null, limit = 20) => {
    try {
      const res = await fetch(buildRecommendationUrl(currentId, limit));
      if (!res.ok) throw new Error(`Recommendations request failed: ${res.status}`);
      const data = await res.json();
      setSmartQueue(data);
      smartQueueRef.current = data;
      prepareUpcomingSong(getPreparedCandidate());
      return data as Song[];
    } catch (error) {
      console.error('Failed to fetch smart queue:', error);
      return [];
    }
  };

  const startSmartQueue = async () => {
    const recommendations = await fetchSmartQueue(playerState.currentSong?.id, 25);
    if (recommendations.length === 0) return;
    setPlayerState(prev => ({ ...prev, shuffle: false }));
    playSong(recommendations[0], recommendations);
  };

  const playAutoplayRecommendations = async (currentId?: number) => {
    const recommendations = await fetchSmartQueue(currentId, 20);
    if (recommendations.length === 0) {
      setPlayerState(prev => ({ ...prev, isPlaying: false, progress: 0 }));
      return;
    }
    playSong(recommendations[0], recommendations);
  };

  const shuffleQueue = () => {
    const { queue, currentIndex, shuffle } = playerState;
    if (queue.length === 0 || currentIndex < 0) return;
    if (shuffle) {
      // Unshuffle (simply keep current queue order but reset state)
      setPlayerState(prev => ({ ...prev, shuffle: false }));
    } else {
      // Fisher-Yates shuffle
      const newQueue = [...queue];
      const currentSong = queue[currentIndex];
      
      for (let i = newQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
      }
      
      // Ensure current song stays as index 0 for seamless transition
      const newIdx = newQueue.findIndex(s => s.id === currentSong.id);
      [newQueue[0], newQueue[newIdx]] = [newQueue[newIdx], newQueue[0]];
      
      setPlayerState(prev => ({ 
        ...prev, 
        shuffle: true, 
        queue: newQueue, 
        currentIndex: 0 
      }));
    }
  };

  const toggleRepeat = () => {
    setPlayerState(prev => {
      const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
      const nextMode = modes[(modes.indexOf(prev.repeatMode) + 1) % modes.length];
      return { ...prev, repeatMode: nextMode };
    });
  };

  const applyEqPreset = (name: string) => {
    const nextBands = eqPresets[name] || eqPresets.Flat;
    setEqPreset(name);
    setEqBands(nextBands);
    fetch('/api/eq-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 1, name, bands: nextBands })
    }).catch(() => {});
  };

  const extractTheme = (imageUrl: string) => {
    const cacheKey = `palette:${imageUrl}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setTheme(JSON.parse(cached));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 48;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        const alpha = pixels[i + 3];
        if (alpha < 128) continue;
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
        count++;
      }
      if (!count) return;
      const primary = rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
      const nextTheme = {
        primary,
        secondary: shiftColor(primary, 28),
        accent: contrastColor(primary),
        background: shiftColor(primary, -70),
        text: contrastColor(primary),
      };
      localStorage.setItem(cacheKey, JSON.stringify(nextTheme));
      setTheme(nextTheme);
    };
    img.src = imageUrl;
  };

  useEffect(() => {
    fetchAllData();
    
    // Setup audio listener
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    if (!secondaryAudioRef.current) {
      secondaryAudioRef.current = new Audio();
    }
    
    const primaryAudio = audioRef.current;
    const secondaryAudio = secondaryAudioRef.current;
    
    const handleTimeUpdate = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement;
      if (audio !== audioRef.current) return;
      setPlayerState(prev => ({
        ...prev,
        progress: (audio.currentTime / audio.duration) * 100 || 0
      }));
      saveAudioPlayback(audio);

      const latest = playerStateRef.current;
      const remaining = audio.duration - audio.currentTime;
      if (
        latest.isPlaying &&
        latest.repeatMode !== 'one' &&
        Number.isFinite(remaining) &&
        remaining <= Math.max(0.4, crossfadeRef.current) &&
        !transitionInProgressRef.current
      ) {
        const nextSong = getPreparedCandidate(latest);
        if (nextSong) {
          void crossfadeToSong(nextSong, { advanceQueue: true, fromAutoplay: latest.currentIndex >= latest.queue.length - 1 });
        }
      }
    };
    
    const handleEnded = (event: Event) => {
      if (event.currentTarget !== audioRef.current || transitionInProgressRef.current) return;
      const latest = playerStateRef.current;
      if (latest.repeatMode === 'one') {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        });
      } else if (latest.currentIndex < latest.queue.length - 1) {
        const nextIndex = latest.currentIndex + 1;
        playSong(latest.queue[nextIndex], latest.queue);
      } else if (latest.repeatMode === 'all' && latest.queue.length > 0) {
        playSong(latest.queue[0], latest.queue);
      } else if (autoplayNextRef.current && songsRef.current.length > 0) {
        void playAutoplayRecommendations(latest.currentSong?.id);
      } else {
        setPlayerState(prev => ({ ...prev, isPlaying: false, progress: 0 }));
      }
    };

    primaryAudio.addEventListener('timeupdate', handleTimeUpdate);
    primaryAudio.addEventListener('ended', handleEnded);
    secondaryAudio.addEventListener('timeupdate', handleTimeUpdate);
    secondaryAudio.addEventListener('ended', handleEnded);
    
    return () => {
      primaryAudio.removeEventListener('timeupdate', handleTimeUpdate);
      primaryAudio.removeEventListener('ended', handleEnded);
      secondaryAudio.removeEventListener('timeupdate', handleTimeUpdate);
      secondaryAudio.removeEventListener('ended', handleEnded);
      if (fadeFrameRef.current) cancelAnimationFrame(fadeFrameRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sleepTimeoutRef.current) window.clearTimeout(sleepTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    websocketRef.current = socket;
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'remote:command') {
          const command = message.payload?.command;
          if (command === 'toggle') togglePlay();
          if (command === 'next') playNext();
          if (command === 'previous') playPrev();
          if (command === 'volume') {
            const value = Math.min(Math.max(Number(message.payload.value), 0), 1);
            setVolume(value);
            if (audioRef.current) audioRef.current.volume = value;
          }
        }
      } catch {}
    };
    return () => socket.close();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (editing && event.key !== 'Escape') return;
      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowRight') {
        seekToProgress(Math.min(playerStateRef.current.progress + 5, 100));
      } else if (event.key === 'ArrowLeft') {
        seekToProgress(Math.max(playerStateRef.current.progress - 5, 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setVolume(prev => Math.min(prev + 0.05, 1));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setVolume(prev => Math.max(prev - 0.05, 0));
      } else if (event.key.toLowerCase() === 'f' && playerStateRef.current.currentSong) {
        toggleFavorite(playerStateRef.current.currentSong.id, !!playerStateRef.current.currentSong.isFavorite);
      } else if (event.key === '/') {
        event.preventDefault();
        document.getElementById('global-search')?.focus();
      } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        setShowLyrics(prev => !prev);
        setIsExpandedPlayer(true);
      } else if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        setShowToolsSheet(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Update Media Session when song changes
  useEffect(() => {
    if ('mediaSession' in navigator && playerState.currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: playerState.currentSong.title,
        artist: playerState.currentSong.artist,
        album: playerState.currentSong.album,
        artwork: playerState.currentSong.coverArtPath ? [
          { src: window.location.origin + playerState.currentSong.coverArtPath, sizes: '512x512', type: 'image/png' }
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [playerState.currentSong]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSongs(),
        fetchArtists(),
        fetchAlbums(),
        fetchGenres(),
        fetchPlaylists(),
        fetchDashboardData()
      ]);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
    setLoading(false);
  };

  const fetchPlaylists = async () => {
    const res = await fetch('/api/playlists');
    setPlaylists(await res.json());
  };

  const fetchDashboardData = async () => {
    try {
      const [statsRes, duplicatesRes, healthRes, profilesRes, mixesRes] = await Promise.all([
        fetch('/api/stats/overview'),
        fetch('/api/duplicates'),
        fetch('/api/library/health'),
        fetch('/api/profiles'),
        fetch('/api/mixes'),
      ]);
      setStats(await statsRes.json());
      setDuplicates((await duplicatesRes.json()).duplicates || []);
      setHealth(await healthRes.json());
      setProfiles(await profilesRes.json());
      setMixes(await mixesRes.json());
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const fetchVideoSeries = async () => {
    setVideoLoading(true);
    setVideoError(null);
    try {
      const response = await fetch('/api/videos/series?scan=false');
      const data = await readJsonResponse<VideoSeries[]>(response, 'Videos request');
      setVideoSeries(data);
      const latest = readStoredJson<{ episodeId: number }>(`${VIDEO_PLAYBACK_KEY}.latest`);
      if (latest?.episodeId && !selectedVideoEpisode) {
        for (const series of data) {
          for (const season of series.seasons) {
            const episode = season.episodes.find(item => item.id === latest.episodeId);
            if (episode) {
              setSelectedVideoSeries(series);
              setSelectedVideoSeason(season);
              setSelectedVideoEpisode(episode);
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      setVideoError(error instanceof Error ? error.message : 'Could not load videos');
    } finally {
      setVideoLoading(false);
    }
  };

  const scanVideoSeries = async () => {
    setVideoLoading(true);
    setVideoError(null);
    try {
      const scanResponse = await fetch('/api/videos/scan', { method: 'POST' });
      await readJsonResponse(scanResponse, 'Video scan');
      const response = await fetch('/api/videos/series?scan=false');
      const data = await readJsonResponse<VideoSeries[]>(response, 'Videos request');
      setVideoSeries(data);
    } catch (error) {
      console.error('Failed to scan videos:', error);
      setVideoError(error instanceof Error ? error.message : 'Could not scan videos');
    } finally {
      setVideoLoading(false);
    }
  };

  const updateVideoSeries = async (series: VideoSeries, changes: { title: string; posterPath?: string | null }) => {
    const response = await fetch(`/api/videos/series/${series.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const data = await readJsonResponse<{ series: VideoSeries }>(response, 'Rename series');
    setVideoSeries(current => current.map(item => item.id === data.series.id ? data.series : item));
    setSelectedVideoSeries(current => current?.id === data.series.id ? data.series : current);
  };

  const openVideos = async () => {
    setActiveView('videos');
    setSelectedFilter(null);
    if (videoSeries.length === 0) {
      await fetchVideoSeries();
    }
  };

  const toggleFavorite = async (songId: number, currentFavorite: boolean) => {
    try {
      const favorite = !currentFavorite;
      await fetch(`/api/songs/${songId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite })
      });
      
      // Update local state
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFavorite: favorite ? 1 : 0 } : s));
      if (playerState.currentSong?.id === songId) {
        setPlayerState(prev => ({
          ...prev, 
          currentSong: prev.currentSong ? { ...prev.currentSong, isFavorite: favorite ? 1 : 0 } : null
        }));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName })
      });
      if (res.ok) {
        setNewPlaylistName('');
        setShowPlaylistModal(false);
        fetchPlaylists();
      }
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const addSongToPlaylist = async (playlistId: number, songId: number) => {
    try {
      await fetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
      // Optionally show toast
    } catch (error) {
      console.error('Failed to add to playlist:', error);
    }
  };

  const openMetadataEditor = (song: Song) => {
    setMetadataDraft({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumArtist: song.albumArtist || '',
      genre: song.genre || '',
      year: song.year || '',
      trackNumber: song.trackNumber || '',
      discNumber: song.discNumber || '',
      composer: song.composer || '',
    });
    setShowMetadataSheet(true);
  };

  const saveMetadata = async () => {
    if (!metadataDraft.id) return;
    try {
      const res = await fetch(`/api/songs/${metadataDraft.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadataDraft)
      });
      if (!res.ok) throw new Error(`Metadata save failed: ${res.status}`);
      await fetchSongs();
      await fetchArtists();
      await fetchAlbums();
      await fetchGenres();
      setShowMetadataSheet(false);
    } catch (error) {
      console.error('Failed to save metadata:', error);
    }
  };

  const renamePlaylist = async () => {
    if (selectedFilter?.type !== 'playlist' || !playlistDraftName.trim()) return;
    try {
      const res = await fetch(`/api/playlists/${selectedFilter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playlistDraftName.trim() })
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
      setSelectedFilter(prev => prev ? { ...prev, name: playlistDraftName.trim() } : prev);
      await fetchPlaylists();
    } catch (error) {
      console.error('Failed to rename playlist:', error);
    }
  };

  const removeSongFromPlaylist = async (songId: number) => {
    if (selectedFilter?.type !== 'playlist') return;
    try {
      const res = await fetch(`/api/playlists/${selectedFilter.id}/songs/${songId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Remove failed: ${res.status}`);
      setSongs(prev => prev.filter(song => song.id !== songId));
    } catch (error) {
      console.error('Failed to remove song from playlist:', error);
    }
  };

  const persistPlaylistOrder = async (orderedSongs: Song[]) => {
    if (selectedFilter?.type !== 'playlist') return;
    try {
      await fetch(`/api/playlists/${selectedFilter.id}/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds: orderedSongs.map(song => song.id) })
      });
    } catch (error) {
      console.error('Failed to reorder playlist:', error);
    }
  };

  const movePlaylistSong = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setSongs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      void persistPlaylistOrder(next);
      return next;
    });
  };

  const moveQueueSong = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setPlayerState(prev => {
      const current = prev.currentSong;
      const next = [...prev.queue];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      const currentIndex = current ? next.findIndex(song => song.id === current.id) : prev.currentIndex;
      return { ...prev, queue: next, currentIndex };
    });
  };

  const fetchPlaylistSongs = async (playlistId: number, playlistName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`);
      const data = await res.json();
      setSongs(data);
      setSelectedFilter({ type: 'playlist', id: playlistId, name: playlistName });
      setPlaylistDraftName(playlistName);
      setLibraryTab('songs');
      setActiveView('library');
    } catch (error) {
      console.error('Failed to fetch playlist songs:', error);
    }
    setLoading(false);
  };

  const trackPlay = async (songId: number) => {
    try {
      await fetch(`/api/songs/${songId}/played`, { method: 'POST' });
    } catch (e) {}
  };

  const fetchSongs = async (filters: { artistId?: number, albumId?: number, genreId?: number, favorite?: boolean } = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.artistId) params.append('artistId', filters.artistId.toString());
      if (filters.albumId) params.append('albumId', filters.albumId.toString());
      if (filters.genreId) params.append('genreId', filters.genreId.toString());
      if (filters.favorite) params.append('favorite', 'true');

      const response = await fetch(`/api/songs?${params.toString()}`);
      if (!response.ok) throw new Error(`Songs request failed: ${response.status}`);
      const data = await response.json();
      setSongs(data);
    } catch (error) {
      console.error('Failed to fetch songs:', error);
    }
  };

  const fetchArtists = async () => {
    const res = await fetch('/api/artists');
    setArtists(await res.json());
  };

  const fetchAlbums = async () => {
    const res = await fetch('/api/albums');
    setAlbums(await res.json());
  };

  const fetchGenres = async () => {
    const res = await fetch('/api/genres');
    setGenres(await res.json());
  };

  const scanLibrary = async () => {
    setLoading(true);
    await fetch('/api/scan', { method: 'POST' });
    await fetchAllData();
  };

  const applyFilter = (type: string, id: number, name: string) => {
    setSelectedFilter({ type, id, name });
    setPlaylistDraftName('');
    const filters: any = {};
    if (type === 'artist') filters.artistId = id;
    if (type === 'album') filters.albumId = id;
    if (type === 'genre') filters.genreId = id;
    fetchSongs(filters);
    setLibraryTab('songs');
    setActiveView('library');
  };

  const clearFilter = () => {
    setSelectedFilter(null);
    setPlaylistDraftName('');
    fetchSongs();
  };

  const crossfadeToSong = async (song: Song, options: { advanceQueue?: boolean, fromAutoplay?: boolean } = {}) => {
    const currentAudio = audioRef.current;
    const nextAudio = secondaryAudioRef.current;
    const fadeSeconds = crossfadeRef.current;
    if (!currentAudio || !nextAudio || transitionInProgressRef.current || fadeSeconds <= 0 || !playerStateRef.current.currentSong) {
      return false;
    }

    transitionInProgressRef.current = true;
    const nextSrc = `/api/stream/${song.id}`;
    if (preparedNextRef.current?.songId !== song.id || !nextAudio.src.includes(nextSrc)) {
      nextAudio.src = nextSrc;
      nextAudio.load();
      preparedNextRef.current = { songId: song.id, src: nextSrc };
    }
    nextAudio.volume = 0;
    nextAudio.muted = isMutedRef.current;
    nextAudio.playbackRate = playbackSpeedRef.current;
    try {
      await nextAudio.play();
    } catch (error) {
      transitionInProgressRef.current = false;
      throw error;
    }

    const durationMs = Math.max(250, fadeSeconds * 1000);
    const startedAt = performance.now();
    const startVolume = currentAudio.volume || volumeRef.current;
    const fade = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      currentAudio.volume = startVolume * (1 - progress);
      nextAudio.volume = volumeRef.current * progress;
      if (progress < 1) {
        fadeFrameRef.current = requestAnimationFrame(fade);
      } else {
        currentAudio.pause();
        currentAudio.removeAttribute('src');
        currentAudio.load();
        nextAudio.volume = volumeRef.current;
        audioRef.current = nextAudio;
        secondaryAudioRef.current = currentAudio;
        preparedNextRef.current = null;
        transitionInProgressRef.current = false;
        fadeFrameRef.current = null;
        if (options.advanceQueue) {
          setPlayerState(prev => {
            const queueIndex = prev.queue.findIndex(item => item.id === song.id);
            const nextIndex = queueIndex >= 0 ? queueIndex : 0;
            const nextQueue = queueIndex >= 0 ? prev.queue : [song, ...smartQueueRef.current.filter(item => item.id !== song.id)];
            return {
              ...prev,
              queue: nextQueue,
              currentIndex: nextIndex,
              currentSong: song,
              isPlaying: true,
              progress: (nextAudio.currentTime / nextAudio.duration) * 100 || 0
            };
          });
          trackPlay(song.id);
        }
        prepareUpcomingSong(getPreparedCandidate({
          ...playerStateRef.current,
          currentSong: song,
          currentIndex: options.fromAutoplay ? 0 : Math.max(playerStateRef.current.queue.findIndex(item => item.id === song.id), 0),
        }));
      }
    };
    fadeFrameRef.current = requestAnimationFrame(fade);
    return true;
  };

  const playSong = (song: Song, newQueue?: Song[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Initialize audio context for visualizer on first play
    initAudioContext();

    if (newQueue) {
      setPlayerState(prev => ({
        ...prev,
        queue: newQueue,
        currentIndex: newQueue.findIndex(s => s.id === song.id),
        currentSong: song,
        isPlaying: true
      }));
    } else {
      setPlayerState(prev => ({
        ...prev,
        currentSong: song,
        isPlaying: true
      }));
    }

    trackPlay(song.id);
    const shouldCrossfade = Boolean(playerStateRef.current.currentSong && playerStateRef.current.isPlaying && audio.src);
    if (shouldCrossfade) {
      void crossfadeToSong(song).then((started) => {
        if (started) return;
        audio.src = `/api/stream/${song.id}`;
        audio.volume = volumeRef.current;
        audio.muted = isMutedRef.current;
        audio.playbackRate = playbackSpeedRef.current;
        audio.play().catch(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        });
      }).catch(() => {
        transitionInProgressRef.current = false;
        audio.src = `/api/stream/${song.id}`;
        audio.volume = volumeRef.current;
        audio.muted = isMutedRef.current;
        audio.playbackRate = playbackSpeedRef.current;
        audio.play().catch(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        });
      });
    } else {
      audio.src = `/api/stream/${song.id}`;
      audio.volume = volumeRef.current;
      audio.muted = isMutedRef.current;
      audio.playbackRate = playbackSpeedRef.current;
      audio.play().catch(() => {
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      });
    }

    window.setTimeout(() => prepareUpcomingSong(getPreparedCandidate()), 0);
    window.setTimeout(() => saveAudioPlayback(), 250);

    websocketRef.current?.send(JSON.stringify({
      type: 'playback:state',
      payload: { songId: song.id, isPlaying: true, progress: 0, volume: volumeRef.current }
    }));
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !playerState.currentSong) return;

    if (playerState.isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      });
    }

    setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    window.setTimeout(() => saveAudioPlayback(), 0);
  };

  const playNext = () => {
    const { queue, currentIndex } = playerState;
    if (queue.length === 0) {
      void startSmartQueue();
      return;
    }

    if (currentIndex >= queue.length - 1 && autoplayNext) {
      void playAutoplayRecommendations(playerState.currentSong?.id);
      return;
    }
    
    const nextIndex = (currentIndex + 1) % queue.length;
    playSong(queue[nextIndex], queue);
  };

  const playPrev = () => {
    const { queue, currentIndex } = playerState;
    if (queue.length === 0) return;
    
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    playSong(queue[prevIndex], queue);
  };

  const seekToProgress = (progress: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = (progress / 100) * audio.duration;
    setPlayerState(prev => ({ ...prev, progress }));
  };

  const showRecentlyPlayed = () => {
    const recent = [...songs].sort((a, b) => {
      const aTime = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
      const bTime = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
      return bTime - aTime || b.playCount - a.playCount;
    });
    setSongs(recent);
    setSelectedFilter({ type: 'recent', id: 0, name: 'Recently Played' });
    setLibraryTab('songs');
    setActiveView('library');
  };

  const openCurrentPlayer = () => {
    if (playerState.currentSong) {
      setIsExpandedPlayer(true);
    }
  };

  const playVisibleSongs = (shuffle = false) => {
    if (filteredSongs.length === 0) return;
    const queue = shuffle ? [...filteredSongs].sort(() => Math.random() - 0.5) : filteredSongs;
    setPlayerState(prev => ({ ...prev, shuffle }));
    playSong(queue[0], queue);
  };

  const shareSong = async (song: Song) => {
    const text = `${song.title} - ${song.artist}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Native share can be cancelled by the user; no UI state needed here.
    }
  };

  const openActionsForSong = (song: Song) => {
    setActionSong(song);
    setShowActionsSheet(true);
  };

  const addSongToQueue = (song: Song) => {
    setPlayerState(prev => {
      const currentIndex = Math.max(prev.currentIndex, 0);
      const queue = prev.queue.length > 0 ? [...prev.queue] : (prev.currentSong ? [prev.currentSong] : []);
      const insertAt = Math.min(currentIndex + 1, queue.length);
      queue.splice(insertAt, 0, song);
      return {
        ...prev,
        queue,
        currentIndex: prev.currentSong ? queue.findIndex(item => item.id === prev.currentSong?.id) : 0,
      };
    });
    prepareUpcomingSong(song);
    setShowActionsSheet(false);
  };

  const goToSongAlbum = (song: Song) => {
    const album = albums.find(item => item.title === song.album);
    if (album) {
      applyFilter('album', album.id, album.title);
      setShowActionsSheet(false);
    }
  };

  const goToSongArtist = (song: Song) => {
    const artist = artists.find(item => item.name === song.artist);
    if (artist) {
      applyFilter('artist', artist.id, artist.name);
      setShowActionsSheet(false);
    }
  };

  const startSongRadio = async (song: Song) => {
    const recommendations = await fetchSmartQueue(song.id, 25);
    const radioQueue = [song, ...recommendations.filter(item => item.id !== song.id)];
    playSong(song, radioQueue);
    setShowActionsSheet(false);
  };

  const currentSong = playerState.currentSong;
  const menuSong = actionSong || currentSong;
  const upcomingQueue = playerState.queue.slice(Math.max(playerState.currentIndex + 1, 0));
  const sourceLabel = activeView === 'home' ? 'Home' : selectedFilter?.name || 'Search';
  const cleanLyricLines = (lyrics || '')
    .split('\n')
    .map(line => line.replace(/\[.*?\]/g, '').trim())
    .filter(Boolean);

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.album || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.genre || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredArtists = normalizedSearch
    ? artists.filter(artist => artist.name.toLowerCase().includes(normalizedSearch))
    : artists;
  const filteredAlbums = normalizedSearch
    ? albums.filter(album => album.title.toLowerCase().includes(normalizedSearch) || album.artist.toLowerCase().includes(normalizedSearch))
    : albums;
  const filteredGenres = normalizedSearch
    ? genres.filter(genre => genre.name.toLowerCase().includes(normalizedSearch))
    : genres;
  const totalDuration = filteredSongsDuration(filteredSongs);
  const selectedArtist = selectedFilter?.type === 'artist' ? artists.find(artist => artist.id === selectedFilter.id) : null;
  const selectedAlbum = selectedFilter?.type === 'album' ? albums.find(album => album.id === selectedFilter.id) : null;
  const selectedCover = selectedAlbum?.coverArtPath || filteredSongs.find(song => song.coverArtPath)?.coverArtPath || null;
  const detailSubtitle = selectedFilter
    ? `${filteredSongs.length} tracks - ${formatTime(totalDuration)} total`
    : `${songs.length} tracks in your library`;

  return (
    <div id="app-root" className="flex h-screen overflow-hidden text-sm md:text-base">
      {/* Sidebar - Desktop */}
      <nav id="sidebar" className="hidden md:flex flex-col w-64 bg-black p-6 space-y-8 border-r border-white/5">
        <div id="logo" className="flex items-center space-x-3 text-brand-primary">
          <div className="p-2 bg-brand-primary rounded-lg">
            <Music2 className="text-black" size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Streamify</span>
        </div>

          <div className="space-y-4">
          <div className="text-xs uppercase text-zinc-500 font-bold tracking-wider">Menu</div>
          <div className="space-y-1">
            <div onClick={() => { setActiveView('home'); setSelectedFilter(null); fetchSongs(); }}>
              <NavItem icon={<Home size={20} />} label="Home" active={activeView === 'home'} />
            </div>
            <div onClick={() => setActiveView('library')}>
              <NavItem icon={<LibraryIcon size={20} />} label="Your Library" active={activeView === 'library'} />
            </div>
            <div onClick={openVideos}>
              <NavItem icon={<Clapperboard size={20} />} label="Videos" active={activeView === 'videos'} />
            </div>
            <div onClick={() => setShowPlaylistModal(true)}>
              <NavItem icon={<PlusCircle size={20} />} label="Create Playlist" />
            </div>
            <div onClick={() => fetchSongs({ favorite: true }).then(() => { setSelectedFilter({ type: 'genre', id: 0, name: 'Liked Songs' }); setLibraryTab('songs'); })}>
              <NavItem icon={<Heart size={20} />} label="Liked Songs" />
            </div>
            <div onClick={() => { fetchDashboardData(); setShowStatsSheet(true); }}>
              <NavItem icon={<BarChart3 size={20} />} label="Analytics" />
            </div>
            <div onClick={() => { fetchDashboardData(); setShowToolsSheet(true); }}>
              <NavItem icon={<Wrench size={20} />} label="Library Tools" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-4">
           <div className="text-xs uppercase text-zinc-500 font-bold tracking-wider mb-4">Playlists</div>
           <div className="space-y-2 text-zinc-400">
             {playlists.map(p => (
               <div 
                key={p.id} 
                onClick={() => fetchPlaylistSongs(p.id, p.name)}
                className="hover:text-white cursor-pointer transition-colors truncate"
               >
                 {p.name}
               </div>
             ))}
           </div>
        </div>

        <button 
          onClick={scanLibrary}
          className="mt-auto flex items-center justify-center space-x-2 py-3 bg-brand-primary text-black font-bold rounded-full hover:scale-105 transition-transform"
        >
          <Settings size={18} />
          <span>Scan Library</span>
        </button>
      </nav>

      {/* Main Content */}
      <main
        id="main-content"
        className="flex-1 flex flex-col overflow-hidden relative transition-colors duration-700"
        style={{ background: `linear-gradient(180deg, ${theme.secondary}55 0%, ${theme.background} 34%, #121212 100%)` }}
      >
        <header id="top-bar" className="p-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                id="global-search"
                type="text" 
                placeholder="Search songs, artists, albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/10 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all"
              />
            </div>
          </div>
          <div id="user-profile" className="flex items-center space-x-4">
             <button
              onClick={() => setShowSettingsSheet(true)}
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-200 transition-colors hover:bg-white/15 md:flex"
              aria-label="Open settings"
             >
              <SlidersHorizontal size={18} />
             </button>
             <button
              onClick={() => { fetchDashboardData(); setShowStatsSheet(true); }}
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-200 transition-colors hover:bg-white/15 md:flex"
              aria-label="Open analytics"
             >
              <BarChart3 size={18} />
             </button>
             <button
              onClick={openVideos}
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-200 transition-colors hover:bg-white/15 md:flex"
              aria-label="Open videos"
             >
              <Clapperboard size={18} />
             </button>
             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold ring-1 ring-white/10">
                SJ
             </div>
          </div>
        </header>

        <div id="scroll-area" className="flex-1 overflow-y-auto p-6 md:px-12 no-scrollbar">
          {activeView === 'home' && !selectedFilter ? (
            <>
              <h1 className="text-3xl font-bold mb-8 tracking-tight">Good afternoon</h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                 <div onClick={() => { fetchSongs({ favorite: true }).then(() => { setSelectedFilter({ type: 'genre', id: 0, name: 'Liked Songs' }); setLibraryTab('songs'); }); }}>
                  <QuickTile title="Liked Songs" icon={<Heart className="text-purple-500 fill-purple-500" size={24} />} />
                 </div>
                 <div onClick={showRecentlyPlayed}>
                  <QuickTile title="Recently Played" icon={<Clock3 className="text-blue-400" size={24} />} />
                 </div>
                 <div onClick={scanLibrary}>
                  <QuickTile title="Scan Library" icon={<Settings className="text-green-500" size={24} />} />
                 </div>
                 <div onClick={openVideos}>
                  <QuickTile title="Videos" icon={<Clapperboard className="text-orange-400" size={24} />} />
                 </div>
              </div>

              <div className="mb-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FeatureTile icon={<Maximize2 size={20} />} label="Open Player" value={currentSong ? currentSong.title : 'Start first song'} onClick={() => currentSong ? openCurrentPlayer() : playVisibleSongs(false)} />
                <FeatureTile icon={<ListMusic size={20} />} label="Queue" value={`${upcomingQueue.length} upcoming`} onClick={() => currentSong ? setShowQueueSheet(true) : playVisibleSongs(false)} />
                <FeatureTile icon={<SlidersHorizontal size={20} />} label="Settings" value={`${playbackSpeed.toFixed(playbackSpeed === 1 ? 0 : 2)}x playback`} onClick={() => setShowSettingsSheet(true)} />
                <FeatureTile icon={<Sparkles size={20} />} label="Smart Queue" value={smartQueue[0]?.reason || 'Recommendations'} onClick={startSmartQueue} />
                <FeatureTile icon={<BarChart3 size={20} />} label="Analytics" value={`${stats?.totals?.playCount || 0} plays`} onClick={() => { fetchDashboardData(); setShowStatsSheet(true); }} />
                <FeatureTile icon={<Wrench size={20} />} label="Library Tools" value={`${duplicates.length} duplicate groups`} onClick={() => { fetchDashboardData(); setShowToolsSheet(true); }} />
                <FeatureTile icon={<Minimize2 size={20} />} label="Mini Player" value={showMiniPlayer ? 'Visible' : 'Floating mode'} onClick={() => setShowMiniPlayer(prev => !prev)} />
                <FeatureTile icon={<Clapperboard size={20} />} label="Videos" value={`${videoSeries.length} series`} onClick={openVideos} />
              </div>
            </>
          ) : activeView === 'videos' ? (
            <VideoLibraryView
              series={videoSeries}
              loading={videoLoading}
              error={videoError}
              selectedSeries={selectedVideoSeries}
              selectedSeason={selectedVideoSeason}
              selectedEpisode={selectedVideoEpisode}
              onRefresh={scanVideoSeries}
              onSelectSeries={(series) => {
                setSelectedVideoSeries(series);
                setSelectedVideoSeason(series.seasons[0] || null);
                setSelectedVideoEpisode(null);
              }}
              onSelectSeason={(season) => {
                setSelectedVideoSeason(season);
                setSelectedVideoEpisode(null);
              }}
              onSelectEpisode={setSelectedVideoEpisode}
              onUpdateSeries={updateVideoSeries}
              onBack={() => {
                if (selectedVideoEpisode) setSelectedVideoEpisode(null);
                else if (selectedVideoSeries) {
                  setSelectedVideoSeries(null);
                  setSelectedVideoSeason(null);
                } else setActiveView('home');
              }}
            />
          ) : (
            <div className="mb-8">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex min-w-0 items-center space-x-4">
                 {selectedFilter && (
                   <button 
                    onClick={clearFilter}
                    className="p-2 hover:bg-white/10 rounded-full text-zinc-400"
                   >
                     <ChevronDown className="rotate-90" size={24} />
                   </button>
                 )}
                 <h1 className="truncate text-3xl font-bold tracking-tight">
                  {selectedFilter ? selectedFilter.name : 'Your Library'}
                 </h1>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => playVisibleSongs(false)} className="hidden rounded-full bg-white px-5 py-2 text-sm font-extrabold text-black active:scale-95 sm:block">Play</button>
                  <button onClick={() => playVisibleSongs(true)} className="rounded-full bg-brand-primary px-5 py-2 text-sm font-extrabold text-black active:scale-95">Shuffle</button>
                </div>
              </div>
              
              {!selectedFilter && (
                <div className="flex items-center space-x-6 border-b border-white/5 mb-8">
                  <TabItem active={libraryTab === 'songs'} onClick={() => setLibraryTab('songs')} label="Songs" />
                  <TabItem active={libraryTab === 'artists'} onClick={() => setLibraryTab('artists')} label="Artists" />
                  <TabItem active={libraryTab === 'albums'} onClick={() => setLibraryTab('albums')} label="Albums" />
                  <TabItem active={libraryTab === 'genres'} onClick={() => setLibraryTab('genres')} label="Genres" />
                </div>
              )}
              {selectedFilter && (
                <div className="mb-8 grid gap-5 rounded-xl border border-white/10 bg-white/[.04] p-5 md:grid-cols-[160px_1fr]">
                  <div className={`aspect-square overflow-hidden bg-zinc-800 ${selectedFilter.type === 'artist' ? 'rounded-full' : 'rounded-lg'}`}>
                    {selectedCover ? (
                      <img src={selectedCover} alt={selectedFilter.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-600">
                        {selectedFilter.type === 'artist' ? <UserRound size={56} /> : <Disc3 size={56} />}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col justify-end gap-4">
                    <div>
                      <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-zinc-400">
                        {selectedFilter.type === 'artist' ? 'Artist' : selectedFilter.type === 'album' ? 'Album' : selectedFilter.type === 'playlist' ? 'Playlist' : 'Collection'}
                      </div>
                      <h2 className="truncate text-4xl font-black tracking-normal text-white">{selectedFilter.name}</h2>
                      <p className="mt-2 text-sm font-semibold text-zinc-400">
                        {selectedArtist ? 'Local artist page' : selectedAlbum?.artist || detailSubtitle}
                        {selectedAlbum && ` - ${detailSubtitle}`}
                      </p>
                    </div>
                    {selectedFilter.type === 'playlist' && (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          value={playlistDraftName}
                          onChange={(e) => setPlaylistDraftName(e.target.value)}
                          onBlur={renamePlaylist}
                          onKeyDown={(e) => e.key === 'Enter' && renamePlaylist()}
                          className="min-w-0 flex-1 rounded-full bg-black/30 px-4 py-2 text-sm font-bold outline-none ring-1 ring-white/10 focus:ring-brand-primary"
                        />
                        <button onClick={renamePlaylist} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-black active:scale-95">
                          <Pencil size={16} />
                          Rename
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FeatureTile icon={<Maximize2 size={20} />} label="Now Playing" value={currentSong ? 'Expand player' : 'Start first song'} onClick={() => currentSong ? openCurrentPlayer() : playVisibleSongs(false)} />
                <FeatureTile icon={<ListMusic size={20} />} label="Queue" value={`${upcomingQueue.length} next`} onClick={() => currentSong ? setShowQueueSheet(true) : playVisibleSongs(false)} />
                <FeatureTile icon={<SlidersHorizontal size={20} />} label="Audio" value={`${Math.round(volume * 100)}% volume`} onClick={() => setShowSettingsSheet(true)} />
                <FeatureTile icon={<Timer size={20} />} label="Sleep Timer" value={sleepTimer ? `${sleepTimer}m left` : 'Off'} onClick={() => setShowSleepModal(true)} />
              </div>
            </div>
          )}

          {activeView !== 'videos' && (loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
               <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
               <p className="text-zinc-400">Loading your music library...</p>
            </div>
          ) : (
            <>
              {libraryTab === 'songs' && (
                selectedFilter?.type === 'playlist' ? (
                  <div className="space-y-2">
                    {filteredSongs.map((song, index) => (
                      <PlaylistSongRow
                        key={song.id}
                        song={song}
                        index={index}
                        isActive={playerState.currentSong?.id === song.id}
                        isPlaying={playerState.currentSong?.id === song.id && playerState.isPlaying}
                        onPlay={() => playSong(song, filteredSongs)}
                        onMoreOptions={() => openActionsForSong(song)}
                        onRemove={() => removeSongFromPlaylist(song.id)}
                        onDragStart={() => setDraggedPlaylistIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedPlaylistIndex !== null) movePlaylistSong(draggedPlaylistIndex, index);
                          setDraggedPlaylistIndex(null);
                        }}
                      />
                    ))}
                    {filteredSongs.length === 0 && (
                      <div className="py-20 text-center text-zinc-500">No songs found in this playlist.</div>
                    )}
                  </div>
                ) : (
                  <div id="song-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {filteredSongs.map(song => (
                      <SongCard 
                        key={song.id} 
                        song={song} 
                        onClick={() => playSong(song, filteredSongs)}
                        isActive={playerState.currentSong?.id === song.id}
                        isPlaying={playerState.currentSong?.id === song.id && playerState.isPlaying}
                        onMoreOptions={() => openActionsForSong(song)}
                        onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, song.id)}
                        playlists={playlists}
                      />
                    ))}
                    {filteredSongs.length === 0 && (
                      <div className="col-span-full py-20 text-center text-zinc-500">No songs found in this selection.</div>
                    )}
                  </div>
                )
              )}

              {activeView === 'library' && !selectedFilter && (
                <>
                  {libraryTab === 'artists' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {filteredArtists.map(artist => (
                        <BrowseCard 
                          key={artist.id} 
                          title={artist.name} 
                          subtitle="Artist"
                          onClick={() => applyFilter('artist', artist.id, artist.name)}
                          round
                        />
                      ))}
                    </div>
                  )}

                  {libraryTab === 'albums' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {filteredAlbums.map(album => (
                        <BrowseCard 
                          key={album.id} 
                          title={album.title} 
                          subtitle={album.artist}
                          cover={album.coverArtPath}
                          onClick={() => applyFilter('album', album.id, album.title)}
                        />
                      ))}
                    </div>
                  )}

                  {libraryTab === 'genres' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {filteredGenres.map(genre => (
                        <BrowseCard 
                          key={genre.id} 
                          title={genre.name} 
                          subtitle="Genre"
                          onClick={() => applyFilter('genre', genre.id, genre.name)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ))}
          
          <div className="h-32" /> {/* Spacer for player */}
        </div>
      </main>

      {/* Player Bar */}
      <AnimatePresence>
        {playerState.currentSong && (
          <motion.footer 
            id="player-bar"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            onClick={() => setIsExpandedPlayer(true)}
            className="fixed bottom-0 left-0 right-0 bg-brand-black/95 backdrop-blur-xl border-t border-white/5 py-3 px-4 md:px-6 flex items-center justify-between z-40 cursor-pointer"
          >
            {/* Current Song Info */}
            <div className="flex min-w-0 flex-1 items-center space-x-3 md:w-1/3 md:flex-none md:space-x-4">
              <div className="w-14 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative group">
                {playerState.currentSong.coverArtPath ? (
                  <img src={playerState.currentSong.coverArtPath} alt={playerState.currentSong.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <Music2 size={24} />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                   <Maximize2 size={16} />
                </div>
              </div>
              <div className="min-w-0 flex-1 pr-1 md:pr-4">
                <div className="font-medium truncate text-zinc-100 hover:underline cursor-pointer">
                  {playerState.currentSong.title}
                </div>
                <div className="text-sm text-zinc-400 truncate hover:underline cursor-pointer">
                  {playerState.currentSong.artist}
                </div>
              </div>
              <Heart 
                size={18} 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(playerState.currentSong!.id, !!playerState.currentSong!.isFavorite);
                }}
                className={`${playerState.currentSong.isFavorite ? 'text-brand-primary fill-brand-primary' : 'text-zinc-400'} hover:text-brand-primary active:scale-125 transition-all flex-shrink-0 cursor-pointer`} 
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white text-black md:hidden"
                aria-label={playerState.isPlaying ? 'Pause' : 'Play'}
              >
                {playerState.isPlaying ? <Pause size={25} fill="black" /> : <Play size={25} fill="black" className="ml-0.5" />}
              </button>
            </div>

            {/* Playback Controls */}
            <div className="hidden md:flex flex-col items-center w-full md:w-1/3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center space-x-6 mb-2">
                <button onClick={shuffleQueue} className={`${playerState.shuffle ? 'text-brand-primary' : 'text-zinc-400 hover:text-white'} transition-colors`}><Shuffle size={18} /></button>
                <button onClick={playPrev} className="text-zinc-200 hover:text-white transition-colors"><SkipBack size={24} fill="currentColor" /></button>
                <button 
                  onClick={togglePlay}
                  className="w-10 h-10 md:w-12 md:h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                >
                  {playerState.isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" className="ml-1" />}
                </button>
                <button onClick={playNext} className="text-zinc-200 hover:text-white transition-colors"><SkipForward size={24} fill="currentColor" /></button>
                <button onClick={toggleRepeat} className={`${playerState.repeatMode !== 'none' ? 'text-brand-primary' : 'text-zinc-400 hover:text-white'} transition-colors`}><Repeat size={18} /></button>
              </div>
              
              <div className="w-full flex items-center space-x-3 text-xs text-zinc-500">
                <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
                <div className="flex-1 h-3 group relative cursor-pointer">
                  <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-800">
                  <div 
                    className="absolute top-0 left-0 h-full bg-brand-primary transition-all duration-100 ease-linear" 
                    style={{ width: `${playerState.progress}%` }}
                  />
                  </div>
                  <input
                    aria-label="Seek"
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={playerState.progress}
                    onChange={(e) => seekToProgress(Number(e.target.value))}
                    className="absolute inset-0 h-3 w-full cursor-pointer opacity-0"
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `calc(${playerState.progress}% - 6px)` }}
                  />
                </div>
                <span>{formatTime(playerState.currentSong.duration)}</span>
              </div>
            </div>

            {/* Volume & Queue Controls */}
            <div className="hidden md:flex items-center justify-end space-x-4 w-1/3" onClick={(e) => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); setShowQueueSheet(true); }} className="text-zinc-400 hover:text-white cursor-pointer" aria-label="Open queue">
                <ListMusic size={20} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowSettingsSheet(true); }} className="text-zinc-400 hover:text-white cursor-pointer" aria-label="Open playback settings">
                <SlidersHorizontal size={20} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openActionsForSong(playerState.currentSong!); }} className="text-zinc-400 hover:text-white cursor-pointer" aria-label="More options">
                <MoreVertical size={20} />
              </button>
              <div className="flex items-center space-x-2 group">
                <button onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeX size={20} className="text-zinc-400 group-hover:text-white" /> : <Volume2 size={20} className="text-zinc-400 group-hover:text-white" />}
                </button>
                <div className="w-24 h-1 bg-zinc-800 rounded-full relative">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={volume}
                    onChange={handleVolumeChange}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                  />
                  <div 
                    className="h-full bg-zinc-400 rounded-full group-hover:bg-brand-primary transition-all" 
                    style={{ width: `${volume * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* Sleep Timer Modal */}
      <AnimatePresence>
        {showSleepModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-brand-gray w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-white/5"
            >
              <h2 className="text-2xl font-bold mb-6 text-center">Sleep Timer</h2>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[5, 15, 30, 45, 60, 90].map(mins => (
                  <button 
                    key={mins}
                    onClick={() => setTimer(mins)}
                    className="py-4 bg-white/5 hover:bg-brand-primary hover:text-black rounded-2xl font-bold transition-all"
                  >
                    {mins} Minutes
                  </button>
                ))}
              </div>
              {sleepTimer && (
                <button 
                  onClick={clearSleepTimer}
                  className="mb-3 w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all"
                >
                  Turn Off Current Timer
                </button>
              )}
              <button 
                onClick={() => setShowSleepModal(false)}
                className="w-full py-4 text-zinc-400 hover:text-white font-bold"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Player Overlay */}
      <AnimatePresence>
        {isExpandedPlayer && playerState.currentSong && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed inset-0 z-50 overflow-hidden bg-[#121212] text-white"
          >
            <div className="absolute inset-0">
              {playerState.currentSong.coverArtPath && (
                <img
                  src={playerState.currentSong.coverArtPath}
                  alt=""
                  className="absolute inset-x-0 top-0 h-1/2 w-full object-cover opacity-45 blur-3xl scale-110"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(83,154,172,.9)_0%,rgba(28,57,63,.95)_42%,#111_76%,#000_100%)]" />
            </div>

            <div className="relative z-10 mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-6 pb-7 pt-[max(18px,env(safe-area-inset-top))] no-scrollbar md:max-w-xl">
              <div className="flex items-center justify-between">
                <button onClick={() => setIsExpandedPlayer(false)} className="-ml-2 p-2 text-white/95 active:scale-95" aria-label="Close player">
                  <ChevronDown size={32} strokeWidth={2.4} />
                </button>
                <div className="min-w-0 px-4 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/90">
                    Playing from {sourceLabel}
                  </div>
                  <div className="truncate text-sm font-extrabold leading-5">{playerState.currentSong.album || 'Recent Searches'}</div>
                </div>
                <button onClick={() => openActionsForSong(playerState.currentSong!)} className="-mr-2 p-2 text-white/90 active:scale-95" aria-label="More options">
                  <MoreVertical size={27} />
                </button>
              </div>

              <div className="flex flex-1 flex-col justify-end gap-6 pb-5 pt-8">
                <motion.div 
                  layoutId={playerState.currentSong.id.toString()}
                  className="relative mx-auto aspect-square w-full max-w-[min(78vh,560px)] overflow-hidden rounded-lg bg-zinc-800 shadow-[0_22px_70px_rgba(0,0,0,.42)]"
                >
                  {playerState.currentSong.coverArtPath ? (
                    <img src={playerState.currentSong.coverArtPath} alt={playerState.currentSong.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-600">
                      <Music2 size={120} />
                    </div>
                  )}
                  {showVisualizer && visualizerData && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-end gap-1 bg-gradient-to-t from-black/50 to-transparent px-4 pb-3">
                      {Array.from(visualizerData).slice(0, 28).map((v, i) => (
                        <motion.div
                          key={i}
                          animate={{ height: `${Math.max(12, (v / 255) * 100)}%` }}
                          transition={{ type: 'spring', damping: 18, stiffness: 160 }}
                          className="flex-1 rounded-t-sm bg-brand-primary/80"
                        />
                      ))}
                    </div>
                  )}
                </motion.div>

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setShowSettingsSheet(true)} className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur active:scale-[.98]">
                    <Gauge size={15} />
                    {playbackSpeed.toFixed(playbackSpeed === 1 ? 0 : 2)}x
                  </button>
                  <button onClick={() => setShowSleepModal(true)} className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur active:scale-[.98]">
                    <Timer size={15} />
                    {sleepTimer ? `${sleepTimer}m` : 'Timer'}
                  </button>
                  <button onClick={() => setShowSettingsSheet(true)} className="flex items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur active:scale-[.98]">
                    <Radio size={15} />
                    {losslessMode ? 'HiFi' : 'Auto'}
                  </button>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-[26px] font-extrabold leading-[1.12] tracking-normal text-white md:text-4xl">
                      {playerState.currentSong.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-[17px] font-medium leading-6 text-white/68">
                      {playerState.currentSong.artist}
                    </p>
                  </div>
                  <button 
                    onClick={() => toggleFavorite(playerState.currentSong!.id, !!playerState.currentSong!.isFavorite)}
                    className="mb-2 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-black/10 active:scale-95"
                    aria-label="Toggle favorite"
                  >
                    {playerState.currentSong.isFavorite ? (
                      <CheckCircle2 size={34} className="fill-brand-primary text-brand-primary" />
                    ) : (
                      <Heart size={31} className="text-white/72" />
                    )}
                  </button>
                </div>

                <div>
                  <div className="relative h-5">
                    <div className="absolute left-0 right-0 top-2 h-1 rounded-full bg-white/18">
                      <div className="h-full rounded-full bg-white" style={{ width: `${playerState.progress}%` }} />
                    </div>
                    <input
                      aria-label="Seek"
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={playerState.progress}
                      onChange={(e) => seekToProgress(Number(e.target.value))}
                      className="absolute inset-0 h-5 w-full cursor-pointer opacity-0"
                    />
                    <div
                      className="pointer-events-none absolute top-[4px] h-3 w-3 rounded-full bg-white shadow"
                      style={{ left: `calc(${playerState.progress}% - 6px)` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[13px] font-medium tabular-nums text-white/62">
                    <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
                    <span>{formatTime(playerState.currentSong.duration)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={shuffleQueue} className={`p-1 active:scale-95 ${playerState.shuffle ? 'text-brand-primary' : 'text-white'}`} aria-label="Shuffle">
                    <Shuffle size={29} />
                  </button>
                  <button onClick={playPrev} className="p-1 text-white active:scale-95" aria-label="Previous">
                    <SkipBack size={39} fill="currentColor" />
                  </button>
                  <button 
                    onClick={togglePlay}
                    className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white text-black shadow-[0_8px_25px_rgba(0,0,0,.24)] active:scale-95"
                    aria-label={playerState.isPlaying ? 'Pause' : 'Play'}
                  >
                    {playerState.isPlaying ? <Pause size={43} fill="black" /> : <Play size={43} fill="black" className="ml-1" />}
                  </button>
                  <button onClick={playNext} className="p-1 text-white active:scale-95" aria-label="Next">
                    <SkipForward size={39} fill="currentColor" />
                  </button>
                  <button onClick={toggleRepeat} className={`p-1 active:scale-95 ${playerState.repeatMode !== 'none' ? 'text-brand-primary' : 'text-white'}`} aria-label="Repeat">
                    <Repeat size={29} />
                  </button>
                </div>

                <div className="flex items-center justify-between text-white">
                  <button onClick={() => setShowSleepModal(true)} className="flex min-w-0 items-center gap-2 pr-3 text-brand-primary active:scale-[.98]" aria-label="Audio output">
                    <Headphones size={24} />
                    <span className="truncate text-[13px] font-bold">
                      {sleepTimer ? `${sleepTimer}m Sleep Timer` : 'Local Audio Link Active'}
                    </span>
                  </button>
                  <div className="flex items-center gap-6">
                    <button onClick={() => shareSong(playerState.currentSong!)} aria-label="Share" className="active:scale-95">
                      <Share2 size={24} />
                    </button>
                    <button onClick={() => setShowQueueSheet(true)} aria-label="Queue" className="active:scale-95">
                      <Menu size={27} />
                    </button>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowLyrics(!showLyrics)}
                className={`mt-auto rounded-[22px] px-5 py-5 text-left shadow-[0_14px_35px_rgba(0,0,0,.22)] active:scale-[.99] ${showLyrics ? 'max-h-[38vh] overflow-y-auto bg-[#327b90]' : 'bg-[#408da3]'}`}
              >
                <div className="mb-7 flex items-center justify-between text-lg font-extrabold">
                  <span>{showLyrics ? 'Lyrics' : 'Lyrics preview'}</span>
                  <Mic2 size={21} />
                </div>
                <div className={`${showLyrics ? 'space-y-5 text-[24px]' : 'line-clamp-3 text-[26px]'} font-extrabold leading-tight text-white`}>
                  {showLyrics
                    ? cleanLyricLines.slice(0, 18).map((line, index) => (
                        <p key={`${line}-${index}`} className={index === 0 ? 'text-white' : 'text-white/72'}>{line}</p>
                      ))
                    : (cleanLyricLines[0] || 'Lyrics not available yet.')}
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomSheet open={showActionsSheet && !!menuSong} onClose={() => setShowActionsSheet(false)} title="Track options">
        {menuSong && (
          <>
            <div className="mb-5 flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-md bg-zinc-800">
                {menuSong.coverArtPath ? (
                  <img src={menuSong.coverArtPath} alt={menuSong.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={26} /></div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{menuSong.title}</div>
                <div className="truncate text-sm font-semibold text-zinc-400">{menuSong.artist} - {menuSong.album || 'Unknown album'}</div>
              </div>
            </div>
            <ActionRow icon={<Share2 size={22} />} label="Share" onClick={() => shareSong(menuSong)} />
            <ActionRow icon={<Heart size={22} />} label={menuSong.isFavorite ? 'Remove from Liked Songs' : 'Add to Liked Songs'} onClick={() => toggleFavorite(menuSong.id, !!menuSong.isFavorite)} />
            <ActionRow icon={<PlusCircle size={22} />} label="Add to playlist" onClick={() => { setShowActionsSheet(false); setShowPlaylistModal(true); }} />
            {playlists.slice(0, 4).map(playlist => (
              <ActionRow
                key={playlist.id}
                icon={<Plus size={22} />}
                label={`Add to ${playlist.name}`}
                onClick={() => {
                  addSongToPlaylist(playlist.id, menuSong.id);
                  setShowActionsSheet(false);
                }}
              />
            ))}
            <ActionRow icon={<ListMusic size={22} />} label="Add to Queue" onClick={() => addSongToQueue(menuSong)} />
            <ActionRow icon={<Disc3 size={22} />} label="Go to album" onClick={() => goToSongAlbum(menuSong)} />
            <ActionRow icon={<UserRound size={22} />} label="Go to artists" onClick={() => goToSongArtist(menuSong)} />
            <ActionRow icon={<Radio size={22} />} label="Go to song radio" onClick={() => startSongRadio(menuSong)} />
            <ActionRow icon={<FileText size={22} />} label="View song credits" onClick={() => { setShowActionsSheet(false); setShowSongCreditsSheet(true); }} />
            <ActionRow icon={<AudioLines size={22} />} label="Show Spotify Code" onClick={() => { setShowActionsSheet(false); setShowSpotifyCodeSheet(true); }} />
            <ActionRow icon={<Download size={22} />} label="Download track" onClick={() => window.open(`/api/download/${menuSong.id}`, '_blank')} />
            <ActionRow icon={<Pencil size={22} />} label="Edit metadata" onClick={() => { setShowActionsSheet(false); openMetadataEditor(menuSong); }} />
            <ActionRow icon={<BadgeInfo size={22} />} label={`${menuSong.format.toUpperCase()} - ${formatTime(menuSong.duration)} - ${losslessMode ? 'Lossless preferred' : 'Auto quality'}`} />
          </>
        )}
      </BottomSheet>

      <BottomSheet open={showSongCreditsSheet && !!menuSong} onClose={() => setShowSongCreditsSheet(false)} title="Song credits">
        {menuSong && (
          <div className="space-y-3">
            <CreditRow label="Song" value={menuSong.title} />
            <CreditRow label="Artist" value={menuSong.artist} />
            <CreditRow label="Album" value={menuSong.album || 'Unknown album'} />
            <CreditRow label="Album artist" value={menuSong.albumArtist || menuSong.artist} />
            <CreditRow label="Composer" value={menuSong.composer || 'Not listed'} />
            <CreditRow label="Year" value={menuSong.year || 'Not listed'} />
            <CreditRow label="Format" value={`${menuSong.format.toUpperCase()} - ${formatTime(menuSong.duration)}`} />
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={showSpotifyCodeSheet && !!menuSong} onClose={() => setShowSpotifyCodeSheet(false)} title="Spotify Code">
        {menuSong && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl bg-white/[.04] p-4">
              <div className="h-16 w-16 overflow-hidden rounded-md bg-zinc-800">
                {menuSong.coverArtPath ? (
                  <img src={menuSong.coverArtPath} alt={menuSong.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={26} /></div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-extrabold">{menuSong.title}</div>
                <div className="truncate text-sm font-semibold text-zinc-400">{menuSong.artist}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 text-black">
              <div className="mb-4 flex items-center justify-between">
                <QrCode size={34} />
                <div className="text-right text-xs font-black uppercase tracking-widest">Streamify Code</div>
              </div>
              <div className="flex h-20 items-center gap-1 overflow-hidden rounded-lg bg-black px-3">
                {Array.from({ length: 38 }).map((_, index) => (
                  <span
                    key={index}
                    className="w-1.5 rounded-full bg-white"
                    style={{ height: `${18 + ((menuSong.id * (index + 7)) % 54)}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={showQueueSheet && !!currentSong} onClose={() => setShowQueueSheet(false)} title="Queue">
        {currentSong && (
          <>
            <div className="mb-6">
              <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-zinc-500">Now Playing</div>
              <QueueItem song={currentSong} active isPlaying={playerState.isPlaying} onClick={() => setShowQueueSheet(false)} />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-500">Next Up</div>
              <div className="flex items-center gap-4">
                <button onClick={startSmartQueue} className="text-xs font-bold text-brand-primary">Smart</button>
                <button onClick={shuffleQueue} className="text-xs font-bold text-brand-primary">{playerState.shuffle ? 'Shuffle On' : 'Shuffle'}</button>
              </div>
            </div>
            <div className="space-y-2">
              {upcomingQueue.length > 0 ? upcomingQueue.map((song, index) => (
                <QueueItem
                  key={`${song.id}-${index}`}
                  song={song}
                  draggable
                  onDragStart={() => setDraggedQueueIndex(playerState.currentIndex + 1 + index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedQueueIndex !== null) moveQueueSong(draggedQueueIndex, playerState.currentIndex + 1 + index);
                    setDraggedQueueIndex(null);
                  }}
                  onClick={() => {
                    const queueIndex = playerState.queue.findIndex(item => item.id === song.id);
                    playSong(song);
                    setPlayerState(prev => ({ ...prev, currentIndex: queueIndex }));
                    setShowQueueSheet(false);
                  }}
                />
              )) : (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white/5 p-5 text-sm font-medium text-zinc-400">Nothing else queued. Smart Queue can keep the music going.</div>
                  {smartQueue.slice(0, 5).map(song => (
                    <QueueItem
                      key={`smart-${song.id}`}
                      song={song}
                      reason={song.reason}
                      onClick={() => playSong(song, [song, ...smartQueue.filter(item => item.id !== song.id)])}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </BottomSheet>

      <BottomSheet open={showSettingsSheet} onClose={() => setShowSettingsSheet(false)} title="Playback settings">
        <div className="space-y-5">
          <RangeRow icon={<Gauge size={22} />} label="Playback speed" value={`${playbackSpeed.toFixed(2)}x`} min={0.5} max={2} step={0.05} current={playbackSpeed} onChange={setPlaybackSpeed} />
          <RangeRow icon={<Volume1 size={22} />} label="Volume" value={`${Math.round(volume * 100)}%`} min={0} max={1} step={0.01} current={volume} onChange={(value) => {
            setVolume(value);
            if (audioRef.current) audioRef.current.volume = value;
            setIsMuted(value === 0);
          }} />
          <RangeRow icon={<SlidersHorizontal size={22} />} label="Audio boost" value={`${audioBoost > 0 ? '+' : ''}${audioBoost} dB`} min={0} max={12} step={1} current={audioBoost} onChange={setAudioBoost} />
          <RangeRow icon={<RotateCcw size={22} />} label="Crossfade" value={`${crossfade}s`} min={0} max={12} step={1} current={crossfade} onChange={setCrossfade} />
          <div className="rounded-2xl bg-white/[.04] p-4">
            <div className="mb-3 flex items-center gap-3">
              <SlidersHorizontal size={22} className="text-zinc-300" />
              <div className="text-[15px] font-extrabold">Equalizer</div>
              <div className="ml-auto text-xs font-bold text-brand-primary">{eqPreset}</div>
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {Object.keys(eqPresets).map(name => (
                <button
                  key={name}
                  onClick={() => applyEqPreset(name)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-extrabold ${eqPreset === name ? 'bg-brand-primary text-black' : 'bg-white/10 text-white'}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(eqBands).map(([band, value]) => (
                <label key={band} className="flex flex-col items-center gap-2 text-[10px] font-bold text-zinc-400">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={value}
                    onChange={(e) => {
                      setEqPreset('Custom');
                      setEqBands(prev => ({ ...prev, [band]: Number(e.target.value) }));
                    }}
                    className="h-24 w-6 [writing-mode:vertical-rl]"
                  />
                  <span>{band}</span>
                </label>
              ))}
            </div>
          </div>
          <ToggleRow icon={<Radio size={22} />} label="High quality local streaming" description="Prioritizes full source quality where available." enabled={losslessMode} onToggle={() => setLosslessMode(prev => !prev)} />
          <ToggleRow icon={<Volume2 size={22} />} label="Normalize audio" description="Keeps loud and quiet tracks closer together." enabled={normalizeAudio} onToggle={() => setNormalizeAudio(prev => !prev)} />
          <ToggleRow icon={<ListMusic size={22} />} label="Autoplay similar songs" description="Keeps playing when the queue ends." enabled={autoplayNext} onToggle={() => setAutoplayNext(prev => !prev)} />
          <ToggleRow icon={<Radio size={22} />} label="Album art visualizer" description="Shows animated frequency bars over cover art." enabled={showVisualizer} onToggle={() => setShowVisualizer(prev => !prev)} />
        </div>
      </BottomSheet>

      <BottomSheet open={showStatsSheet} onClose={() => setShowStatsSheet(false)} title="Analytics">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Songs" value={stats?.totals?.songCount || songs.length} />
            <StatTile label="Plays" value={stats?.totals?.playCount || 0} />
            <StatTile label="Listening Time" value={formatTime(stats?.playedSeconds?.total || 0)} />
            <StatTile label="Favorites" value={stats?.totals?.favoriteCount || 0} />
          </div>
          <MiniBars title="Listening by hour" items={(stats?.hourly || []).map((item: any) => ({ label: `${item.hour}`, value: item.plays }))} />
          <MiniBars title="Genres" items={(stats?.genreDistribution || []).map((item: any) => ({ label: item.name, value: item.tracks }))} />
          <div>
            <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-zinc-500">Top Songs</div>
            <div className="space-y-2">
              {(stats?.topSongs || []).slice(0, 6).map((song: Song) => (
                <QueueItem key={`top-${song.id}`} song={song} reason={`${song.playCount || 0} plays`} onClick={() => playSong(song, stats.topSongs)} />
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={showToolsSheet} onClose={() => setShowToolsSheet(false)} title="Library tools">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <ToolCard icon={<ShieldCheck size={22} />} label="Health" value={`${health?.missingFiles?.length || 0} missing files`} />
            <ToolCard icon={<Trash2 size={22} />} label="Duplicates" value={`${duplicates.length} groups`} />
            <ToolCard icon={<Upload size={22} />} label="Import" value="M3U / JSON ready" />
            <ToolCard icon={<FileText size={22} />} label="Export" value="Playlist export API" />
            <ToolCard icon={<Users size={22} />} label="Profiles" value={`${profiles.length || 1} local users`} />
            <ToolCard icon={<Keyboard size={22} />} label="Shortcuts" value="Space, /, F, Ctrl+K" />
          </div>
          <div>
            <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-zinc-500">Mood Mixes</div>
            <div className="grid grid-cols-2 gap-2">
              {mixes.map((mix: any) => (
                <button
                  key={mix.id}
                  onClick={() => {
                    setSongs(mix.songs || []);
                    setSelectedFilter({ type: 'mix', id: 0, name: mix.name });
                    setLibraryTab('songs');
                    setShowToolsSheet(false);
                  }}
                  className="rounded-2xl bg-white/[.05] p-4 text-left active:scale-[.99]"
                >
                  <div className="text-sm font-extrabold">{mix.name}</div>
                  <div className="mt-1 text-xs font-semibold text-zinc-400">{mix.songs?.length || 0} tracks</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-zinc-500">Duplicate groups</div>
            <div className="space-y-2">
              {duplicates.slice(0, 5).map(group => (
                <div key={group.fingerprint} className="rounded-2xl bg-white/[.04] p-4">
                  <div className="text-sm font-extrabold">{group.reason}</div>
                  <div className="mt-1 text-xs text-zinc-400">{group.items.map((item: Song) => item.title).join(' / ')}</div>
                </div>
              ))}
              {duplicates.length === 0 && <div className="rounded-2xl bg-white/[.04] p-4 text-sm text-zinc-400">No obvious duplicate groups found.</div>}
            </div>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={showMetadataSheet} onClose={() => setShowMetadataSheet(false)} title="Metadata editor">
        <div className="space-y-3">
          {['title', 'artist', 'album', 'albumArtist', 'genre', 'year', 'trackNumber', 'discNumber', 'composer'].map(field => (
            <label key={field} className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase tracking-widest text-zinc-500">{field}</span>
              <input
                value={metadataDraft[field] ?? ''}
                onChange={(e) => setMetadataDraft(prev => ({ ...prev, [field]: e.target.value }))}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-bold outline-none ring-1 ring-white/10 focus:ring-brand-primary"
              />
            </label>
          ))}
          <div className="flex gap-3 pt-3">
            <button onClick={() => fetch('/api/metadata/undo', { method: 'POST' }).then(fetchAllData)} className="flex-1 rounded-full bg-white/10 py-3 text-sm font-extrabold">Undo last</button>
            <button onClick={saveMetadata} className="flex-1 rounded-full bg-brand-primary py-3 text-sm font-extrabold text-black">Save</button>
          </div>
        </div>
      </BottomSheet>

      <AnimatePresence>
        {showMiniPlayer && currentSong && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            className="fixed bottom-24 right-4 z-[75] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-lg bg-zinc-800">
                {currentSong.coverArtPath ? <img src={currentSong.coverArtPath} alt={currentSong.title} className="h-full w-full object-cover" /> : <Music2 className="m-4 text-zinc-600" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold">{currentSong.title}</div>
                <div className="truncate text-xs font-semibold text-zinc-400">{currentSong.artist}</div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-brand-primary" style={{ width: `${playerState.progress}%` }} /></div>
              </div>
              <button onClick={togglePlay} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">
                {playerState.isPlaying ? <Pause size={20} fill="black" /> : <Play size={20} fill="black" />}
              </button>
              <button onClick={() => setShowMiniPlayer(false)} className="text-zinc-400"><X size={18} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist Creation Modal */}
      <AnimatePresence>
        {showPlaylistModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-brand-gray w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-white/5"
            >
              <h2 className="text-2xl font-bold mb-6">New Playlist</h2>
              <input 
                autoFocus
                type="text" 
                placeholder="Give your playlist a name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
                className="w-full bg-white/5 rounded-xl p-4 mb-8 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
              <div className="flex space-x-4">
                <button 
                  onClick={() => setShowPlaylistModal(false)}
                  className="flex-1 py-3 font-bold hover:bg-white/5 rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={createPlaylist}
                  className="flex-1 py-3 bg-brand-primary text-black font-bold rounded-full hover:scale-105 transition-transform"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BottomSheet({ open, onClose, title, children }: { open: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/72 px-3 pb-3 backdrop-blur-sm md:items-center md:p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 42, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 42, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="max-h-[86vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/10 bg-[#181818] p-5 text-white shadow-2xl no-scrollbar md:max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
              <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 active:scale-95" aria-label="Close">
                <X size={22} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ActionRow({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  if (!onClick) {
    return (
      <div className="flex w-full items-center gap-4 rounded-2xl px-2 py-4 text-left text-zinc-400">
        <span className="text-zinc-500">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{label}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl px-2 py-4 text-left text-zinc-100 transition-colors hover:bg-white/5 active:scale-[.99]"
    >
      <span className="text-zinc-300">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{label}</span>
    </button>
  );
}

function ToggleRow({ icon, label, description, enabled, onToggle }: { icon: React.ReactNode, label: string, description: string, enabled: boolean, onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-4 rounded-2xl bg-white/[.04] p-4 text-left active:scale-[.99]">
      <span className="text-zinc-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-white">{label}</span>
        <span className="mt-1 block text-xs font-medium leading-5 text-zinc-400">{description}</span>
      </span>
      <span className={`relative h-7 w-12 rounded-full transition-colors ${enabled ? 'bg-brand-primary' : 'bg-zinc-700'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
    </button>
  );
}

function RangeRow({ icon, label, value, min, max, step, current, onChange }: { icon: React.ReactNode, label: string, value: string, min: number, max: number, step: number, current: number, onChange: (value: number) => void }) {
  const percent = ((current - min) / (max - min)) * 100;
  return (
    <div className="rounded-2xl bg-white/[.04] p-4">
      <div className="mb-3 flex items-center gap-4">
        <span className="text-zinc-300">{icon}</span>
        <span className="min-w-0 flex-1 text-[15px] font-extrabold text-white">{label}</span>
        <span className="text-sm font-bold tabular-nums text-brand-primary">{value}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-700">
          <div className="h-full rounded-full bg-brand-primary" style={{ width: `${percent}%` }} />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-6 w-full cursor-pointer opacity-0"
        />
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${percent}% - 8px)` }} />
      </div>
    </div>
  );
}

function CreditRow({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[.04] p-4">
      <div className="text-xs font-extrabold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-base font-bold text-white">{value}</div>
    </div>
  );
}

function QueueItem({
  song,
  active = false,
  isPlaying = false,
  reason,
  draggable = false,
  onClick,
  onDragStart,
  onDragOver,
  onDrop
}: {
  song: Song,
  active?: boolean,
  isPlaying?: boolean,
  reason?: string,
  draggable?: boolean,
  onClick: () => void,
  onDragStart?: () => void,
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void,
  onDrop?: () => void
}) {
  return (
    <button
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${active ? 'bg-brand-primary/10' : 'hover:bg-white/5'}`}
    >
      {draggable && <GripVertical size={18} className="text-zinc-600" />}
      <div className="h-12 w-12 overflow-hidden rounded-md bg-zinc-800">
        {song.coverArtPath ? (
          <img src={song.coverArtPath} alt={song.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={20} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-extrabold ${active ? 'text-brand-primary' : 'text-white'}`}>{song.title}</div>
        <div className="truncate text-xs font-semibold text-zinc-400">{reason || song.artist}</div>
      </div>
      <div className="text-xs font-bold text-zinc-500">{isPlaying ? 'Playing' : formatTime(song.duration)}</div>
    </button>
  );
}

function PlaylistSongRow({
  song,
  index,
  isActive,
  isPlaying,
  onPlay,
  onMoreOptions,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop
}: {
  song: Song,
  index: number,
  isActive: boolean,
  isPlaying: boolean,
  onPlay: () => void,
  onMoreOptions: () => void,
  onRemove: () => void,
  onDragStart: () => void,
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void,
  onDrop: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`grid min-h-16 grid-cols-[34px_1fr_auto_auto_auto] items-center gap-3 rounded-xl px-3 py-2 transition-colors ${isActive ? 'bg-brand-primary/10' : 'bg-white/[.03] hover:bg-white/[.06]'}`}
    >
      <GripVertical size={18} className="cursor-grab text-zinc-600" />
      <button onClick={onPlay} className="flex min-w-0 items-center gap-3 text-left">
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-zinc-800">
          {song.coverArtPath ? (
            <img src={song.coverArtPath} alt={song.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={20} /></div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity hover:opacity-100">
            {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" />}
          </div>
        </div>
        <div className="min-w-0">
          <div className={`truncate text-sm font-extrabold ${isActive ? 'text-brand-primary' : 'text-white'}`}>{song.title}</div>
          <div className="truncate text-xs font-semibold text-zinc-400">{index + 1}. {song.artist} - {song.album || 'Unknown album'}</div>
        </div>
      </button>
      <span className="hidden text-xs font-bold text-zinc-500 sm:block">{formatTime(song.duration)}</span>
      <button onClick={onMoreOptions} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white" aria-label="More options">
        <MoreVertical size={18} />
      </button>
      <button onClick={onRemove} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white" aria-label="Remove from playlist">
        <Trash2 size={17} />
      </button>
    </div>
  );
}

function TabItem({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`pb-4 px-2 font-bold transition-all relative ${active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
    >
      {label}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-1 bg-brand-primary"
        />
      )}
    </button>
  );
}

interface BrowseCardProps {
  title: string;
  subtitle: string;
  cover?: string | null;
  onClick: () => void;
  round?: boolean;
}

function VideoLibraryView({
  series,
  loading,
  error,
  selectedSeries,
  selectedSeason,
  selectedEpisode,
  onRefresh,
  onSelectSeries,
  onSelectSeason,
  onSelectEpisode,
  onUpdateSeries,
  onBack
}: {
  series: VideoSeries[];
  loading: boolean;
  error: string | null;
  selectedSeries: VideoSeries | null;
  selectedSeason: VideoSeason | null;
  selectedEpisode: VideoEpisode | null;
  onRefresh: () => void;
  onSelectSeries: (series: VideoSeries) => void;
  onSelectSeason: (season: VideoSeason) => void;
  onSelectEpisode: (episode: VideoEpisode) => void;
  onUpdateSeries: (series: VideoSeries, changes: { title: string; posterPath?: string | null }) => Promise<void>;
  onBack: () => void;
}) {
  const seasons = selectedSeries?.seasons || [];
  const activeSeason = selectedSeason || seasons[0] || null;
  const episodes = activeSeason?.episodes || [];
  const [editingSeries, setEditingSeries] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editPosterPath, setEditPosterPath] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [savingEdit, setSavingEdit] = React.useState(false);

  React.useEffect(() => {
    if (!selectedSeries) {
      setEditingSeries(false);
      setEditError(null);
      return;
    }
    setEditTitle(selectedSeries.title);
    setEditPosterPath(selectedSeries.posterPath || '');
    setEditError(null);
  }, [selectedSeries?.id, selectedSeries?.title, selectedSeries?.posterPath]);

  const saveSeriesEdit = async () => {
    if (!selectedSeries || !editTitle.trim()) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateSeries(selectedSeries, {
        title: editTitle.trim(),
        posterPath: editPosterPath.trim() || null,
      });
      setEditingSeries(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not update series');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3 text-brand-primary">
            <Clapperboard size={24} />
            <span className="text-xs font-extrabold uppercase tracking-widest">Local Videos</span>
          </div>
          <h1 className="truncate text-3xl font-black tracking-tight">
            {selectedEpisode?.title || selectedSeries?.title || 'Videos'}
          </h1>
          <p className="mt-1 text-sm font-semibold text-zinc-400">
            {selectedEpisode
              ? `Season ${selectedEpisode.seasonNumber} - Episode ${selectedEpisode.episodeNumber}`
              : selectedSeries
                ? `${seasons.length} season${seasons.length === 1 ? '' : 's'}`
                : `${series.length} series from your server`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-white active:scale-95">
            Back
          </button>
          {selectedSeries && !selectedEpisode && (
            <button onClick={() => setEditingSeries(true)} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-white active:scale-95">
              <Pencil size={16} />
              Edit
            </button>
          )}
          <button onClick={onRefresh} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-extrabold text-black active:scale-95">
            Scan Videos
          </button>
        </div>
      </div>

      {selectedEpisode ? (
        <div className="space-y-5">
          <VideoPlayer episode={selectedEpisode} seriesTitle={selectedSeries?.title || 'Video'} />
          <div className="rounded-xl border border-white/10 bg-white/[.04] p-5">
            <div className="text-sm font-extrabold text-brand-primary">
              S{selectedEpisode.seasonNumber} E{selectedEpisode.episodeNumber}
            </div>
            <div className="mt-1 text-2xl font-black text-white">{selectedEpisode.title}</div>
            {selectedEpisode.description && (
              <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-zinc-400">{selectedEpisode.description}</p>
            )}
          </div>
        </div>
      ) : selectedSeries ? (
        <div className="space-y-6">
          <div className="grid gap-5 rounded-xl border border-white/10 bg-white/[.04] p-5 md:grid-cols-[180px_1fr]">
            <VideoPoster src={selectedSeries.posterPath} title={selectedSeries.title} />
            <div className="flex min-w-0 flex-col justify-end">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500">Series</div>
              <h2 className="truncate text-4xl font-black text-white">{selectedSeries.title}</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-zinc-400">
                {selectedSeries.description || 'Local network streaming from your Streamify server.'}
              </p>
              {editingSeries && (
                <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-black/30 p-4">
                  <input
                    value={editTitle}
                    onChange={event => setEditTitle(event.target.value)}
                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white outline-none focus:border-brand-primary"
                    placeholder="Series title"
                  />
                  <input
                    value={editPosterPath}
                    onChange={event => setEditPosterPath(event.target.value)}
                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white outline-none focus:border-brand-primary"
                    placeholder="/api/videos/local-art/Attack%20on%20Titan/poster.jpg or image URL"
                  />
                  {editError && <p className="text-xs font-bold text-red-300">{editError}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveSeriesEdit} disabled={savingEdit} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-extrabold text-black disabled:opacity-50">
                      {savingEdit ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingSeries(false)} className="rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-white">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {seasons.map(season => (
              <button
                key={season.seasonNumber}
                onClick={() => onSelectSeason(season)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-extrabold ${
                  activeSeason?.seasonNumber === season.seasonNumber ? 'bg-brand-primary text-black' : 'bg-white/10 text-white'
                }`}
              >
                {season.title || `Season ${season.seasonNumber}`}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {episodes.map(episode => (
              <button
                key={episode.id}
                onClick={() => onSelectEpisode(episode)}
                className="grid w-full grid-cols-[120px_1fr_auto] items-center gap-4 rounded-xl bg-white/[.05] p-3 text-left transition-colors hover:bg-white/[.08]"
              >
                <VideoThumb src={episode.thumbnailPath} title={episode.title} />
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-widest text-brand-primary">Episode {episode.episodeNumber}</div>
                  <div className="truncate text-base font-extrabold text-white">{episode.title}</div>
                  <div className="text-xs font-semibold text-zinc-500">{episode.duration ? formatTime(episode.duration) : 'Ready to stream'}</div>
                </div>
                <Play size={22} className="text-brand-primary" fill="currentColor" />
              </button>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
          <p className="text-zinc-400">Scanning videos...</p>
        </div>
      ) : series.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[.04] p-8 text-center">
          <Tv className="mx-auto mb-4 text-brand-primary" size={42} />
          <div className="text-2xl font-black text-white">No videos found</div>
          <p className="mt-2 text-sm font-semibold text-zinc-400">{error || 'Add files to the videos folder and scan again.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {series.map(item => (
            <button key={item.id} onClick={() => onSelectSeries(item)} className="rounded-xl bg-brand-gray/50 p-4 text-left transition-all hover:bg-brand-light">
              <VideoPoster src={item.posterPath} title={item.title} />
              <h3 className="mt-4 truncate font-bold text-white">{item.title}</h3>
              <p className="truncate text-sm text-zinc-400">{item.seasons.length} season{item.seasons.length === 1 ? '' : 's'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoPlayer({ episode, seriesTitle }: { episode: VideoEpisode; seriesTitle: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const gestureRef = React.useRef<{ x: number; y: number; time: number; volume: number; brightness: number } | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(episode.duration || 0);
  const [volume, setVolume] = React.useState(0.85);
  const [brightness, setBrightness] = React.useState(1);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [showControls, setShowControls] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [gestureHint, setGestureHint] = React.useState<string | null>(null);
  const [resumeChoice, setResumeChoice] = React.useState<SavedVideoPlayback | null>(null);
  const [audioTracks, setAudioTracks] = React.useState<Array<{ id: number; label: string; language?: string }>>([]);
  const [activeAudioTrack, setActiveAudioTrack] = React.useState(0);
  const src = episode.streamPath || `/api/videos/episodes/${episode.id}/stream`;

  const saveVideoPlayback = React.useCallback((video = videoRef.current) => {
    if (!video) return;
    if (Number.isFinite(video.duration) && video.currentTime >= video.duration - 8) {
      localStorage.removeItem(`${VIDEO_PLAYBACK_KEY}.${episode.id}`);
      return;
    }
    writeStoredJson(`${VIDEO_PLAYBACK_KEY}.${episode.id}`, {
      episodeId: episode.id,
      currentTime: video.currentTime || 0,
      duration: Number.isFinite(video.duration) ? video.duration : duration,
      volume,
      brightness,
      playbackRate,
      savedAt: Date.now(),
    } satisfies SavedVideoPlayback);
    writeStoredJson(`${VIDEO_PLAYBACK_KEY}.latest`, { episodeId: episode.id, savedAt: Date.now() });
  }, [brightness, duration, episode.id, playbackRate, volume]);

  const revealControls = React.useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowControls(false), playing ? 3200 : 9000);
  }, [playing]);

  React.useEffect(() => {
    const saved = readStoredJson<SavedVideoPlayback>(`${VIDEO_PLAYBACK_KEY}.${episode.id}`);
    setResumeChoice(saved && saved.currentTime > 12 && saved.currentTime < (saved.duration || Infinity) - 12 ? saved : null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(episode.duration || 0);
    revealControls();
  }, [episode.id, episode.duration, revealControls]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.playbackRate = playbackRate;
  }, [volume, playbackRate]);

  React.useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    revealControls();
  };

  const pause = () => {
    videoRef.current?.pause();
    setPlaying(false);
    saveVideoPlayback();
    revealControls();
  };

  const togglePlay = () => playing ? pause() : play();

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min((video.duration || duration || 0), video.currentTime + seconds));
    setCurrentTime(video.currentTime);
    saveVideoPlayback(video);
    revealControls();
  };

  const seekTo = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
    saveVideoPlayback(video);
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      try {
        await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> })?.lock?.('landscape');
      } catch {}
    } else {
      await document.exitFullscreen();
    }
    revealControls();
  };

  const loadAudioTracks = () => {
    const tracks = (videoRef.current as any)?.audioTracks;
    if (!tracks || typeof tracks.length !== 'number') {
      setAudioTracks([]);
      return;
    }
    const next = Array.from({ length: tracks.length }, (_, index) => ({
      id: index,
      label: tracks[index].label || tracks[index].language || `Track ${index + 1}`,
      language: tracks[index].language,
    }));
    setAudioTracks(next);
    setActiveAudioTrack(Math.max(0, next.find(track => tracks[track.id]?.enabled)?.id || 0));
  };

  const selectAudioTrack = (id: number) => {
    const tracks = (videoRef.current as any)?.audioTracks;
    if (tracks) {
      for (let index = 0; index < tracks.length; index++) tracks[index].enabled = index === id;
    }
    setActiveAudioTrack(id);
    revealControls();
  };

  const applyResume = (mode: 'continue' | 'start') => {
    const video = videoRef.current;
    if (!video) return;
    if (mode === 'continue' && resumeChoice) {
      setVolume(resumeChoice.volume ?? volume);
      setBrightness(resumeChoice.brightness ?? brightness);
      setPlaybackRate(resumeChoice.playbackRate ?? playbackRate);
      video.currentTime = resumeChoice.currentTime;
    } else {
      video.currentTime = 0;
      localStorage.removeItem(`${VIDEO_PLAYBACK_KEY}.${episode.id}`);
    }
    setResumeChoice(null);
    play();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    gestureRef.current = { x: event.clientX, y: event.clientY, time: videoRef.current?.currentTime || 0, volume, brightness };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    revealControls();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = gestureRef.current;
    const video = videoRef.current;
    if (!start || !video) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 24) {
      const nextTime = Math.max(0, Math.min(video.duration || duration || 0, start.time + dx * 0.18));
      video.currentTime = nextTime;
      setCurrentTime(nextTime);
      setGestureHint(`${dx > 0 ? '+' : ''}${Math.round(nextTime - start.time)}s`);
    } else if (Math.abs(dy) > 24) {
      const ratio = Math.max(0, Math.min(1, start.y - event.clientY) / Math.max(window.innerHeight * 0.45, 180));
      if (event.clientX < window.innerWidth / 2) {
        const nextBrightness = Math.max(0.35, Math.min(1.5, start.brightness + (dy < 0 ? ratio : -ratio)));
        setBrightness(nextBrightness);
        setGestureHint(`Brightness ${Math.round(nextBrightness * 100)}%`);
      } else {
        const nextVolume = Math.max(0, Math.min(1, start.volume + (dy < 0 ? ratio : -ratio)));
        setVolume(nextVolume);
        setGestureHint(`Volume ${Math.round(nextVolume * 100)}%`);
      }
    }
  };

  const handlePointerUp = () => {
    gestureRef.current = null;
    window.setTimeout(() => setGestureHint(null), 650);
    saveVideoPlayback();
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl ${isFullscreen ? 'fixed inset-0 z-[120] rounded-none border-0' : ''}`}
      onMouseMove={revealControls}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <video
        ref={videoRef}
        src={src}
        className={`w-full bg-black ${isFullscreen ? 'h-full object-contain' : 'aspect-video'}`}
        style={{ filter: `brightness(${brightness})` }}
        playsInline
        onClick={togglePlay}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration || episode.duration || 0);
          loadAudioTracks();
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          setCurrentTime(video.currentTime);
          saveVideoPlayback(video);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          localStorage.removeItem(`${VIDEO_PLAYBACK_KEY}.${episode.id}`);
          const latest = readStoredJson<{ episodeId: number }>(`${VIDEO_PLAYBACK_KEY}.latest`);
          if (latest?.episodeId === episode.id) localStorage.removeItem(`${VIDEO_PLAYBACK_KEY}.latest`);
        }}
      />

      {gestureHint && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-black/70 px-5 py-3 text-sm font-black text-white -translate-x-1/2 -translate-y-1/2">
          {gestureHint}
        </div>
      )}

      {resumeChoice && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="w-[min(420px,100%)] rounded-xl border border-white/10 bg-zinc-950 p-5 text-center">
            <div className="text-xl font-black text-white">{seriesTitle}</div>
            <div className="mt-1 text-sm font-bold text-zinc-400">{episode.title}</div>
            <div className="mt-4 text-sm font-semibold text-zinc-300">Continue from {formatTime(resumeChoice.currentTime)}?</div>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => applyResume('continue')} className="rounded-full bg-brand-primary px-5 py-2 text-sm font-black text-black">Continue</button>
              <button onClick={() => applyResume('start')} className="rounded-full bg-white/10 px-5 py-2 text-sm font-black text-white">Start Over</button>
            </div>
          </div>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 transition-opacity ${showControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-lg font-black text-white">{seriesTitle}</div>
            <div className="truncate text-sm font-bold text-zinc-300">S{episode.seasonNumber} E{episode.episodeNumber} - {episode.title}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => seekBy(-10)} className="rounded-full bg-white/10 p-2 text-white"><Rewind size={19} /></button>
            <button onClick={togglePlay} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black">
              {playing ? <Pause size={26} fill="black" /> : <Play size={26} fill="black" className="ml-1" />}
            </button>
            <button onClick={() => seekBy(10)} className="rounded-full bg-white/10 p-2 text-white"><FastForward size={19} /></button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-bold text-zinc-300">
          <span>{formatTime(currentTime)}</span>
          <input aria-label="Seek video" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || currentTime)} onChange={event => seekTo(Number(event.target.value))} className="h-1 flex-1 accent-brand-primary" />
          <span>{formatTime(duration || 0)}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Volume2 size={18} className="text-zinc-300" />
            <input aria-label="Video volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setVolume(Number(event.target.value))} className="w-24 accent-brand-primary" />
            <Sun size={18} className="text-zinc-300" />
            <input aria-label="Video brightness" type="range" min="0.35" max="1.5" step="0.01" value={brightness} onChange={event => setBrightness(Number(event.target.value))} className="w-24 accent-brand-primary" />
          </div>
          <div className="flex items-center gap-2">
            <select value={playbackRate} onChange={event => setPlaybackRate(Number(event.target.value))} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white outline-none">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}x</option>)}
            </select>
            <select value={activeAudioTrack} onChange={event => selectAudioTrack(Number(event.target.value))} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white outline-none" title="Language">
              {audioTracks.length > 0
                ? audioTracks.map(track => <option key={track.id} value={track.id}>{track.label}</option>)
                : <option value={0}>Default audio</option>}
            </select>
            <button onClick={() => videoRef.current?.requestPictureInPicture?.()} className="rounded-full bg-white/10 p-2 text-white" aria-label="Picture in picture"><PictureInPicture2 size={18} /></button>
            <button className="rounded-full bg-white/10 p-2 text-zinc-500" aria-label="Subtitles"><Subtitles size={18} /></button>
            <button className="rounded-full bg-white/10 p-2 text-zinc-300" aria-label="Audio language"><Languages size={18} /></button>
            <button onClick={toggleFullscreen} className="rounded-full bg-white/10 p-2 text-white" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoPoster({ src, title }: { src?: string | null; title: string }) {
  return (
    <div className="aspect-[2/3] overflow-hidden rounded-lg bg-zinc-800">
      {src ? (
        <img src={src} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <Clapperboard size={46} />
        </div>
      )}
    </div>
  );
}

function VideoThumb({ src, title }: { src?: string | null; title: string }) {
  return (
    <div className="aspect-video overflow-hidden rounded-md bg-zinc-800">
      {src ? (
        <img src={src} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-600">
          <Play size={24} />
        </div>
      )}
    </div>
  );
}

function BrowseCard({ title, subtitle, cover, onClick, round = false }: BrowseCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-brand-gray/50 p-4 rounded-xl hover:bg-brand-light transition-all cursor-pointer group shadow-lg border border-white/5"
    >
      <div className={`aspect-square mb-4 bg-zinc-800 shadow-2xl overflow-hidden ${round ? 'rounded-full' : 'rounded-lg'}`}>
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            {round ? <Music2 size={48} /> : <Music2 size={48} />}
          </div>
        )}
      </div>
      <h3 className="font-bold truncate text-white">{title}</h3>
      <p className="text-sm text-zinc-400 truncate">{subtitle}</p>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center space-x-4 py-2 cursor-pointer transition-colors ${active ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
      {icon}
      <span className="font-semibold">{label}</span>
    </div>
  );
}

function QuickTile({ title, icon }: { title: string, icon: React.ReactNode }) {
  return (
    <div className="flex items-center space-x-4 bg-white/5 rounded-md overflow-hidden hover:bg-white/10 transition-colors cursor-pointer group pr-4 shadow-sm border border-white/5">
      <div className="w-16 h-16 bg-white/5 p-4 flex items-center justify-center flex-shrink-0 group-hover:bg-white/5 transition-colors">
        {icon}
      </div>
      <span className="font-bold tracking-tight line-clamp-1">{title}</span>
    </div>
  );
}

function FeatureTile({ icon, label, value, onClick }: { icon: React.ReactNode, label: string, value: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-24 flex-col justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4 text-left shadow-lg transition-colors hover:bg-white/[.09] active:scale-[.99]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-brand-primary">{icon}</span>
        <span className="h-2 w-2 rounded-full bg-brand-primary/80" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-extrabold text-white">{label}</div>
        <div className="mt-1 truncate text-xs font-semibold text-zinc-400">{value}</div>
      </div>
    </button>
  );
}

function StatTile({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/[.05] p-4">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs font-extrabold uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

function ToolCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="rounded-2xl bg-white/[.05] p-4">
      <div className="mb-3 text-brand-primary">{icon}</div>
      <div className="text-sm font-extrabold">{label}</div>
      <div className="mt-1 text-xs font-semibold text-zinc-400">{value}</div>
    </div>
  );
}

function MiniBars({ title, items }: { title: string, items: Array<{ label: string, value: number }> }) {
  const max = Math.max(...items.map(item => item.value), 1);
  return (
    <div>
      <div className="mb-3 text-xs font-extrabold uppercase tracking-widest text-zinc-500">{title}</div>
      <div className="flex h-28 items-end gap-1 rounded-2xl bg-white/[.04] p-3">
        {items.slice(0, 24).map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t bg-brand-primary/80" style={{ height: `${Math.max(8, (item.value / max) * 88)}px` }} />
            <div className="max-w-full truncate text-[9px] font-bold text-zinc-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SongCardProps {
  song: Song;
  onClick: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onMoreOptions: () => void;
  onAddToPlaylist: (playlistId: number) => void;
  playlists: Playlist[];
}

function SongCard({ song, onClick, isActive, isPlaying, onMoreOptions, onAddToPlaylist, playlists }: SongCardProps) {
  const [showPlaylists, setShowPlaylists] = React.useState(false);

  return (
    <div 
      className={`group p-4 rounded-xl transition-all duration-300 relative cursor-pointer overflow-hidden ${isActive ? 'bg-brand-light ring-1 ring-white/10' : 'bg-brand-gray/50 hover:bg-brand-light shadow-lg'}`}
    >
      <div className="relative aspect-square mb-4 rounded-lg overflow-hidden shadow-2xl" onClick={onClick}>
        {song.coverArtPath ? (
          <img src={song.coverArtPath} alt={song.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
            <Music2 size={48} />
          </div>
        )}
        <div className={`absolute bottom-3 right-3 w-12 h-12 bg-brand-primary rounded-full shadow-2xl flex items-center justify-center transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110`}>
          {isPlaying ? <Pause size={24} fill="black" /> : <Play size={24} fill="black" className="ml-1" />}
        </div>
        
        {isActive && !isPlaying && (
           <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Play size={32} fill="white" className="text-white opacity-80" />
           </div>
        )}
      </div>
      <div className="min-w-0 flex items-start justify-between">
        <div className="min-w-0 flex-1" onClick={onClick}>
          <h3 className={`font-bold truncate mb-1 text-[15px] ${isActive ? 'text-brand-primary' : 'text-white'}`}>{song.title}</h3>
          <p className="text-sm text-zinc-400 truncate">{song.artist}</p>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={(e) => { e.stopPropagation(); onMoreOptions(); }}
            className="p-1 text-zinc-500 transition-colors hover:text-white"
            aria-label="More options"
          >
            <MoreVertical size={17} />
          </button>
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowPlaylists(!showPlaylists); }}
              className="p-1 text-zinc-500 hover:text-white transition-colors"
            >
              <Plus size={16} />
            </button>
            
            {showPlaylists && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-zinc-800 border border-white/5 rounded-lg shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 text-[10px] uppercase font-bold text-zinc-500 border-b border-white/5">Add to Playlist</div>
                <div className="max-h-40 overflow-y-auto no-scrollbar">
                  {playlists.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-zinc-500">No playlists found</div>
                  ) : (
                    playlists.map(p => (
                      <div 
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); onAddToPlaylist(p.id); setShowPlaylists(false); }}
                        className="px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                      >
                        {p.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {isActive && (
            <Heart size={16} className={`${song.isFavorite ? 'text-brand-primary fill-brand-primary' : 'text-zinc-500'}`} />
          )}
        </div>
      </div>
    </div>
  );
}

function filteredSongsDuration(items: Song[]) {
  return items.reduce((total, song) => total + (Number(song.duration) || 0), 0);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function shiftColor(hex: string, amount: number) {
  const raw = hex.replace('#', '');
  const next = [0, 2, 4].map(index => {
    const value = parseInt(raw.slice(index, index + 2), 16);
    return Math.max(0, Math.min(255, value + amount));
  });
  return rgbToHex(next[0], next[1], next[2]);
}

function contrastColor(hex: string) {
  const raw = hex.replace('#', '');
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#111111' : '#ffffff';
}

function formatTime(seconds: number) {
  if (isNaN(seconds)) return '0:00';
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${min}m`;
  }
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
