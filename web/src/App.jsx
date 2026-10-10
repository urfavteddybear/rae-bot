import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { PlayerProvider, usePlayer } from './player.jsx';
import { useArtworkTheme } from './theme.js';
import { TopBar } from './components/TopBar.jsx';
import { PlayerBar } from './components/PlayerBar.jsx';
import { LyricsPanel, useLyrics } from './components/Lyrics.jsx';
import { NowPlaying } from './components/NowPlaying.jsx';
import { usePresence } from './hooks.js';
import { Home, QueuePage, HistoryPage } from './views/Home.jsx';
import { Search, Collection } from './views/Search.jsx';
import { Profile } from './views/Profile.jsx';
import { Login } from './views/Login.jsx';
import { NotInCall } from './views/NotInCall.jsx';

function readLyricsPref() {
  // On narrow screens the panel is an overlay, so it starts closed.
  if (window.matchMedia('(max-width: 1100px)').matches) return false;
  try { return localStorage.getItem('rae:lyrics') !== '0'; } catch { return true; }
}

// The dashboard follows the voice channel you're in, so routes carry no server id.
const BASE = '';

function Shell({ me }) {
  const { state, idle, status, act } = usePlayer();
  const [lyricsOpen, setLyricsOpen] = useState(readLyricsPref);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const { mounted: lyricsMounted, exiting: lyricsExiting } = usePresence(lyricsOpen, 450);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);
  const location = useLocation();
  const mainRef = useRef(null);
  const track = state?.current ?? null;
  const lyrics = useLyrics(track);
  useArtworkTheme(track?.artwork ?? null);

  // Must run inside the click so the browser allows it; the view leaves fullscreen when it closes.
  const openNowPlaying = () => {
    Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => {});
    setNowPlayingOpen(true);
  };

  // New page, start at the top.
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);

  // Leaving voice closes the full-screen view too.
  useEffect(() => { if (!state) setNowPlayingOpen(false); }, [state]);

  const toggleLyrics = () => setLyricsOpen((open) => {
    try { localStorage.setItem('rae:lyrics', open ? '0' : '1'); } catch { /* storage unavailable */ }
    return !open;
  });

  const bringBot = async () => {
    setJoining(true);
    await act('join');
    setJoining(false);
  };

  if (idle) return <NotInCall me={me} />;
  if (!state) return <main className="splash"><p className="empty-note">Connecting…</p></main>;
  // In voice, but the bot isn't in any call here (a restricted view means it is, in another channel).
  if (!state.restricted && !state.voiceChannelId) return <NotInCall me={me} onJoin={bringBot} joining={joining} />;

  return (
    <div className={`app ${lyricsOpen ? 'with-lyrics' : ''}`}>
      <div className="bg" aria-hidden="true" />
      <TopBar me={me} guildBase={BASE} />
      <main className="main" data-scroll ref={mainRef}>
        <div key={location.pathname} className="route-fade">
          <Routes>
            <Route index element={<Home lyrics={lyrics} onToggleLyrics={toggleLyrics} guildBase={BASE} />} />
            <Route path="search" element={<Search guildBase={BASE} />} />
            <Route path="album/:id" element={<Collection kind="album" />} />
            <Route path="artist/:id" element={<Collection kind="artist" />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="profile" element={<Profile me={me} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        {status === 'reconnecting' ? <div className="notice floating">Connection lost. Reconnecting…</div> : null}
      </main>
      {lyricsMounted ? <LyricsPanel lyrics={lyrics} onClose={toggleLyrics} exiting={lyricsExiting} /> : null}
      <PlayerBar lyricsOpen={lyricsOpen} onToggleLyrics={toggleLyrics} onOpenNowPlaying={openNowPlaying} guildBase={BASE} />
      {nowPlayingOpen ? <NowPlaying lyrics={lyrics} onClose={closeNowPlaying} /> : null}
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(undefined);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) return <main className="splash"><p className="empty-note">Loading…</p></main>;
  if (me === null) return <Login />;

  return (
    <PlayerProvider>
      <Routes>
        {/* Old bookmarks from when the dashboard had a server picker. */}
        <Route path="/g/*" element={<Navigate to="/" replace />} />
        <Route path="/servers" element={<Navigate to="/" replace />} />
        <Route path="/*" element={<Shell me={me} />} />
      </Routes>
    </PlayerProvider>
  );
}
