import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSingleDoubleClick } from '../hooks.js';
import { usePlayer } from '../player.jsx';
import { useToast } from '../toast.jsx';
import { Art } from './TrackRow.jsx';

const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago", "2 weeks ago", ... */
export function ago(ms) {
  if (!ms) return '—';
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((startOfToday - ms) / DAY));
  if (ms >= startOfToday) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/** Your own play history (all servers). Reloads when `refreshKey` changes. */
export function useProfile(refreshKey) {
  const [state, setState] = useState({ profile: null, error: null });

  const reload = useCallback(() => api.profile()
    .then((profile) => setState({ profile, error: null }))
    .catch((error) => setState({ profile: null, error })), []);

  useEffect(() => {
    // A new song has just been recorded; give the bot a moment, then refresh.
    const id = setTimeout(reload, 800);
    return () => clearTimeout(id);
  }, [refreshKey, reload]);

  return { ...state, reload };
}

function ShelfCard({ song, showPlays }) {
  const { act, state } = usePlayer();
  const toast = useToast();
  const can = !!state?.me.canControl;

  // Stored songs may have come from any source, so the bot finds them on Deezer by title and artist.
  const send = async (now) => {
    const ok = await act('addSong', { title: song.title, author: song.author, uri: song.uri, now });
    if (ok) toast(now ? `Playing ${song.title}` : `Added ${song.title} to the queue`);
  };
  const clicks = useSingleDoubleClick(can ? () => send(false) : undefined, can ? () => send(true) : undefined);

  return (
    <button
      className="shelf-card"
      disabled={!can}
      title={can ? 'Click to add to the queue, double-click to play now' : 'Join the bot’s voice channel to play this'}
      {...clicks}
    >
      <Art src={song.artwork} className="shelf-art" />
      <div className="card-title">{song.title}</div>
      <div className="card-sub">{song.author}</div>
      {showPlays ? <div className="card-sub plays">{song.plays} plays</div> : null}
    </button>
  );
}

/** A horizontal row of song cards. Click adds a song to the queue; double-click plays it now. */
export function Shelf({ title, items, showPlays }) {
  if (!items?.length) return null;
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="shelf">
        {items.map((t) => <ShelfCard key={t.key} song={t} showPlays={showPlays} />)}
      </div>
    </section>
  );
}
