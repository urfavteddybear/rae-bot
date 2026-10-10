import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from './api.js';
import { PlayerProvider, usePlayer } from './player.jsx';
import { useArtworkTheme } from './theme.js';
import { TopBar } from './components/TopBar.jsx';
import { PlayerBar } from './components/PlayerBar.jsx';
import { LyricsPanel, useLyrics } from './components/Lyrics.jsx';
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
      <main className="main">
        {state ? (
          <Routes>
            <Route index element={<Home lyrics={lyrics} onToggleLyrics={toggleLyrics} guildBase={guildBase} />} />
            <Route path="search" element={<Search guildBase={guildBase} />} />
            <Route path="album/:id" element={<Collection kind="album" />} />
            <Route path="artist/:id" element={<Collection kind="artist" />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<Navigate to={guildBase} replace />} />
          </Routes>
        ) : (
          <div className="page"><p className="empty-note">Connecting…</p></div>
        )}
        {status === 'reconnecting' ? <div className="notice floating">Connection lost. Reconnecting…</div> : null}
      </main>
      {lyricsOpen ? <LyricsPanel lyrics={lyrics} onClose={toggleLyrics} /> : null}
      <PlayerBar lyricsOpen={lyricsOpen} onToggleLyrics={toggleLyrics} guildBase={guildBase} />
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
