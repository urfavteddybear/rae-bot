import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
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
import { Login, Servers, LAST_GUILD_KEY } from './views/Servers.jsx';

function readLyricsPref() {
  // On narrow screens the panel is an overlay, so it starts closed.
  if (window.matchMedia('(max-width: 1100px)').matches) return false;
  try { return localStorage.getItem('rae:lyrics') !== '0'; } catch { return true; }
}

function Shell({ me }) {
  const { guildId } = useParams();
  const guildBase = `/g/${guildId}`;
  return (
    <PlayerProvider guildId={guildId}>
      <ShellInner me={me} guildId={guildId} guildBase={guildBase} />
    </PlayerProvider>
  );
}

function ShellInner({ me, guildId, guildBase }) {
  const { state, status } = usePlayer();
  const [lyricsOpen, setLyricsOpen] = useState(readLyricsPref);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const { mounted: lyricsMounted, exiting: lyricsExiting } = usePresence(lyricsOpen, 450);
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), []);
  const location = useLocation();
  const mainRef = useRef(null);

  // Must run inside the click so the browser allows it; the view leaves fullscreen when it closes.
  const openNowPlaying = () => {
    Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => {});
    setNowPlayingOpen(true);
  };

  // New page, start at the top.
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [location.pathname]);
  const track = state?.current ?? null;
  const lyrics = useLyrics(track);
  useArtworkTheme(track?.artwork ?? null);

  useEffect(() => {
    try { localStorage.setItem(LAST_GUILD_KEY, guildId); } catch { /* storage unavailable */ }
  }, [guildId]);

  const toggleLyrics = () => setLyricsOpen((open) => {
    try { localStorage.setItem('rae:lyrics', open ? '0' : '1'); } catch { /* storage unavailable */ }
    return !open;
  });

  if (!me.guilds.some((g) => g.id === guildId)) return <Navigate to="/" replace />;

  return (
    <div className={`app ${lyricsOpen ? 'with-lyrics' : ''}`}>
      <div className="bg" aria-hidden="true" />
      <TopBar me={me} guildId={guildId} guildBase={guildBase} />
      <main className="main" data-scroll ref={mainRef}>
        {state ? (
          <div key={location.pathname} className="route-fade">
          <Routes>
            <Route index element={<Home lyrics={lyrics} onToggleLyrics={toggleLyrics} guildBase={guildBase} />} />
            <Route path="search" element={<Search guildBase={guildBase} />} />
            <Route path="album/:id" element={<Collection kind="album" />} />
            <Route path="artist/:id" element={<Collection kind="artist" />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to={guildBase} replace />} />
          </Routes>
          </div>
        ) : (
          <div className="page"><p className="empty-note">Connecting…</p></div>
        )}
        {status === 'reconnecting' ? <div className="notice floating">Connection lost. Reconnecting…</div> : null}
      </main>
      {lyricsMounted ? <LyricsPanel lyrics={lyrics} onClose={toggleLyrics} exiting={lyricsExiting} /> : null}
      <PlayerBar lyricsOpen={lyricsOpen} onToggleLyrics={toggleLyrics} onOpenNowPlaying={openNowPlaying} guildBase={guildBase} />
      {nowPlayingOpen && state ? <NowPlaying lyrics={lyrics} onClose={closeNowPlaying} /> : null}
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
    <Routes>
      <Route path="/" element={<Servers me={me} auto />} />
      <Route path="/servers" element={<Servers me={me} />} />
      <Route path="/g/:guildId/*" element={<Shell me={me} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
