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
  Clock3, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Song, PlayerState, Artist, Album, Genre, Playlist } from './types';

export default function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  
  const [activeView, setActiveView] = useState<'home' | 'library'>('home');
  const [libraryTab, setLibraryTab] = useState<'songs' | 'artists' | 'albums' | 'genres'>('songs');
  const [selectedFilter, setSelectedFilter] = useState<{ type: string, id: number, name: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

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
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [crossfade, setCrossfade] = useState(4);
  const [audioBoost, setAudioBoost] = useState(0);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [showVisualizer, setShowVisualizer] = useState(true);
  const [losslessMode, setLosslessMode] = useState(false);
  const sleepTimeoutRef = useRef<number | null>(null);
  const playerStateRef = useRef<PlayerState>(playerState);
  const songsRef = useRef<Song[]>([]);
  const autoplayNextRef = useRef(autoplayNext);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [visualizerData, setVisualizerData] = useState<Uint8Array | null>(null);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    autoplayNextRef.current = autoplayNext;
  }, [autoplayNext]);

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

  const initAudioContext = () => {
    if (!audioContextRef.current && audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const boostGain = Math.pow(10, audioBoost / 20);
      gain.gain.value = normalizeAudio ? Math.min(boostGain, 1.5) : boostGain;
      analyser.fftSize = 128; // Smaller for smoother visualizer
      
      const source = context.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(context.destination);
      
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      gainRef.current = gain;
      
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

  useEffect(() => {
    if (playerState.currentSong) {
      fetchLyrics(playerState.currentSong.id);
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
    setPlayerState(prev => ({ ...prev, volume: newVal }));
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

  useEffect(() => {
    fetchAllData();
    
    // Setup audio listener
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    
    const audio = audioRef.current;
    
    const handleTimeUpdate = () => {
      setPlayerState(prev => ({
        ...prev,
        progress: (audio.currentTime / audio.duration) * 100 || 0
      }));
    };
    
    const handleEnded = () => {
      const latest = playerStateRef.current;
      if (latest.repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        });
      } else if (latest.currentIndex < latest.queue.length - 1) {
        const nextIndex = latest.currentIndex + 1;
        playSong(latest.queue[nextIndex]);
        setPlayerState(prev => ({ ...prev, currentIndex: nextIndex }));
      } else if (latest.repeatMode === 'all' && latest.queue.length > 0) {
        playSong(latest.queue[0]);
        setPlayerState(prev => ({ ...prev, currentIndex: 0 }));
      } else if (autoplayNextRef.current && songsRef.current.length > 0) {
        const randomSong = songsRef.current[Math.floor(Math.random() * songsRef.current.length)];
        playSong(randomSong, songsRef.current);
      } else {
        setPlayerState(prev => ({ ...prev, isPlaying: false, progress: 0 }));
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sleepTimeoutRef.current) window.clearTimeout(sleepTimeoutRef.current);
    };
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
        fetchPlaylists()
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

  const fetchPlaylistSongs = async (playlistId: number, playlistName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`);
      const data = await res.json();
      setSongs(data);
      setSelectedFilter({ type: 'playlist', id: playlistId, name: playlistName });
      setLibraryTab('songs');
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
    const filters: any = {};
    if (type === 'artist') filters.artistId = id;
    if (type === 'album') filters.albumId = id;
    if (type === 'genre') filters.genreId = id;
    fetchSongs(filters);
    setLibraryTab('songs');
  };

  const clearFilter = () => {
    setSelectedFilter(null);
    fetchSongs();
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
    audio.src = `/api/stream/${song.id}`;
    audio.volume = volume;
    audio.muted = isMuted;
    audio.playbackRate = playbackSpeed;
    audio.play().catch(() => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    });
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
  };

  const playNext = () => {
    const { queue, currentIndex } = playerState;
    if (queue.length === 0) return;
    
    const nextIndex = (currentIndex + 1) % queue.length;
    playSong(queue[nextIndex]);
    setPlayerState(prev => ({ ...prev, currentIndex: nextIndex }));
  };

  const playPrev = () => {
    const { queue, currentIndex } = playerState;
    if (queue.length === 0) return;
    
    const prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    playSong(queue[prevIndex]);
    setPlayerState(prev => ({ ...prev, currentIndex: prevIndex }));
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

  const currentSong = playerState.currentSong;
  const upcomingQueue = playerState.queue.slice(Math.max(playerState.currentIndex + 1, 0));
  const sourceLabel = activeView === 'home' ? 'Home' : selectedFilter?.name || 'Search';
  const cleanLyricLines = (lyrics || '')
    .split('\n')
    .map(line => line.replace(/\[.*?\]/g, '').trim())
    .filter(Boolean);

  const filteredSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <div onClick={() => setShowPlaylistModal(true)}>
              <NavItem icon={<PlusCircle size={20} />} label="Create Playlist" />
            </div>
            <div onClick={() => fetchSongs({ favorite: true }).then(() => { setSelectedFilter({ type: 'genre', id: 0, name: 'Liked Songs' }); setLibraryTab('songs'); })}>
              <NavItem icon={<Heart size={20} />} label="Liked Songs" />
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
      <main id="main-content" className="flex-1 flex flex-col bg-gradient-to-b from-brand-light to-brand-black overflow-hidden relative">
        <header id="top-bar" className="p-6 flex items-center justify-between z-10">
          <div className="flex items-center space-x-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
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
              </div>

              <div className="mb-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FeatureTile icon={<Maximize2 size={20} />} label="Open Player" value={currentSong ? currentSong.title : 'Start first song'} onClick={() => currentSong ? openCurrentPlayer() : playVisibleSongs(false)} />
                <FeatureTile icon={<ListMusic size={20} />} label="Queue" value={`${upcomingQueue.length} upcoming`} onClick={() => currentSong ? setShowQueueSheet(true) : playVisibleSongs(false)} />
                <FeatureTile icon={<SlidersHorizontal size={20} />} label="Settings" value={`${playbackSpeed.toFixed(playbackSpeed === 1 ? 0 : 2)}x playback`} onClick={() => setShowSettingsSheet(true)} />
                <FeatureTile icon={<Sparkles size={20} />} label="Smart Shuffle" value={playerState.shuffle ? 'Enabled' : 'Tap to start'} onClick={() => playVisibleSongs(true)} />
              </div>
            </>
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
              <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FeatureTile icon={<Maximize2 size={20} />} label="Now Playing" value={currentSong ? 'Expand player' : 'Start first song'} onClick={() => currentSong ? openCurrentPlayer() : playVisibleSongs(false)} />
                <FeatureTile icon={<ListMusic size={20} />} label="Queue" value={`${upcomingQueue.length} next`} onClick={() => currentSong ? setShowQueueSheet(true) : playVisibleSongs(false)} />
                <FeatureTile icon={<SlidersHorizontal size={20} />} label="Audio" value={`${Math.round(volume * 100)}% volume`} onClick={() => setShowSettingsSheet(true)} />
                <FeatureTile icon={<Timer size={20} />} label="Sleep Timer" value={sleepTimer ? `${sleepTimer}m left` : 'Off'} onClick={() => setShowSleepModal(true)} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
               <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
               <p className="text-zinc-400">Loading your music library...</p>
            </div>
          ) : (
            <>
              {libraryTab === 'songs' && (
                <div id="song-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {filteredSongs.map(song => (
                    <SongCard 
                      key={song.id} 
                      song={song} 
                      onClick={() => playSong(song, filteredSongs)}
                      isActive={playerState.currentSong?.id === song.id}
                      isPlaying={playerState.currentSong?.id === song.id && playerState.isPlaying}
                      onAddToPlaylist={(playlistId) => addSongToPlaylist(playlistId, song.id)}
                      playlists={playlists}
                    />
                  ))}
                  {filteredSongs.length === 0 && (
                    <div className="col-span-full py-20 text-center text-zinc-500">No songs found in this selection.</div>
                  )}
                </div>
              )}

              {activeView === 'library' && !selectedFilter && (
                <>
                  {libraryTab === 'artists' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {artists.map(artist => (
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
                      {albums.map(album => (
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
                      {genres.map(genre => (
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
          )}
          
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
                <button onClick={() => setShowActionsSheet(true)} className="-mr-2 p-2 text-white/90 active:scale-95" aria-label="More options">
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

      <BottomSheet open={showActionsSheet && !!currentSong} onClose={() => setShowActionsSheet(false)} title="Track options">
        {currentSong && (
          <>
            <div className="mb-5 flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-md bg-zinc-800">
                {currentSong.coverArtPath ? (
                  <img src={currentSong.coverArtPath} alt={currentSong.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={26} /></div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold">{currentSong.title}</div>
                <div className="truncate text-sm font-semibold text-zinc-400">{currentSong.artist}</div>
              </div>
            </div>
            <ActionRow icon={<Heart size={22} />} label={currentSong.isFavorite ? 'Remove from Liked Songs' : 'Save to Liked Songs'} onClick={() => toggleFavorite(currentSong.id, !!currentSong.isFavorite)} />
            <ActionRow icon={<PlusCircle size={22} />} label="Create playlist" onClick={() => { setShowActionsSheet(false); setShowPlaylistModal(true); }} />
            {playlists.slice(0, 4).map(playlist => (
              <ActionRow
                key={playlist.id}
                icon={<Plus size={22} />}
                label={`Add to ${playlist.name}`}
                onClick={() => {
                  addSongToPlaylist(playlist.id, currentSong.id);
                  setShowActionsSheet(false);
                }}
              />
            ))}
            <ActionRow icon={<Download size={22} />} label="Download track" onClick={() => window.open(`/api/download/${currentSong.id}`, '_blank')} />
            <ActionRow icon={<Share2 size={22} />} label="Share song" onClick={() => shareSong(currentSong)} />
            <ActionRow icon={<ListMusic size={22} />} label="Open queue" onClick={() => { setShowActionsSheet(false); setShowQueueSheet(true); }} />
            <ActionRow icon={<Info size={22} />} label={`${currentSong.album || 'Unknown album'} - ${currentSong.format.toUpperCase()} - ${formatTime(currentSong.duration)}`} />
          </>
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
              <button onClick={shuffleQueue} className="text-xs font-bold text-brand-primary">{playerState.shuffle ? 'Shuffle On' : 'Shuffle'}</button>
            </div>
            <div className="space-y-2">
              {upcomingQueue.length > 0 ? upcomingQueue.map((song, index) => (
                <QueueItem
                  key={`${song.id}-${index}`}
                  song={song}
                  onClick={() => {
                    const queueIndex = playerState.queue.findIndex(item => item.id === song.id);
                    playSong(song);
                    setPlayerState(prev => ({ ...prev, currentIndex: queueIndex }));
                    setShowQueueSheet(false);
                  }}
                />
              )) : (
                <div className="rounded-2xl bg-white/5 p-5 text-sm font-medium text-zinc-400">Nothing else queued. Autoplay can keep the music going from Settings.</div>
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
          <ToggleRow icon={<Radio size={22} />} label="High quality local streaming" description="Prioritizes full source quality where available." enabled={losslessMode} onToggle={() => setLosslessMode(prev => !prev)} />
          <ToggleRow icon={<Volume2 size={22} />} label="Normalize audio" description="Keeps loud and quiet tracks closer together." enabled={normalizeAudio} onToggle={() => setNormalizeAudio(prev => !prev)} />
          <ToggleRow icon={<ListMusic size={22} />} label="Autoplay similar songs" description="Keeps playing when the queue ends." enabled={autoplayNext} onToggle={() => setAutoplayNext(prev => !prev)} />
          <ToggleRow icon={<Radio size={22} />} label="Album art visualizer" description="Shows animated frequency bars over cover art." enabled={showVisualizer} onToggle={() => setShowVisualizer(prev => !prev)} />
        </div>
      </BottomSheet>

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

function QueueItem({ song, active = false, isPlaying = false, onClick }: { song: Song, active?: boolean, isPlaying?: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors ${active ? 'bg-brand-primary/10' : 'hover:bg-white/5'}`}>
      <div className="h-12 w-12 overflow-hidden rounded-md bg-zinc-800">
        {song.coverArtPath ? (
          <img src={song.coverArtPath} alt={song.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music2 size={20} /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-extrabold ${active ? 'text-brand-primary' : 'text-white'}`}>{song.title}</div>
        <div className="truncate text-xs font-semibold text-zinc-400">{song.artist}</div>
      </div>
      <div className="text-xs font-bold text-zinc-500">{isPlaying ? 'Playing' : formatTime(song.duration)}</div>
    </button>
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

interface SongCardProps {
  song: Song;
  onClick: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onAddToPlaylist: (playlistId: number) => void;
  playlists: Playlist[];
}

function SongCard({ song, onClick, isActive, isPlaying, onAddToPlaylist, playlists }: SongCardProps) {
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

function formatTime(seconds: number) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
