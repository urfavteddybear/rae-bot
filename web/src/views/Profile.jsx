import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { usePlayer } from '../player.jsx';
import { useToast } from '../toast.jsx';
import { Art } from '../components/TrackRow.jsx';

const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago", "2 weeks ago", ... */
function ago(ms) {
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

function Shelf({ title, items, showPlays }) {
  const navigate = useNavigate();
  if (!items.length) return null;
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <div className="shelf">
        {items.map((t) => (
          <button
            key={t.key}
            className="shelf-card"
            onClick={() => navigate(`/search?q=${encodeURIComponent(`${t.title} ${(t.author ?? '').split(',')[0]}`.trim())}`)}
            title="Search for this song"
          >
            <Art src={t.artwork} className="shelf-art" />
            <div className="card-title">{t.title}</div>
            <div className="card-sub">{t.author}</div>
            {showPlays ? <div className="card-sub plays">{t.plays} plays</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Profile({ me }) {
  const { guildId } = usePlayer();
  const toast = useToast();
  const [data, setData] = useState({ loading: true, error: null, profile: null });

  const load = () => {
    setData((d) => ({ ...d, loading: true }));
    return api.profile()
      .then((profile) => setData({ loading: false, error: null, profile }))
      .catch((error) => setData({ loading: false, error, profile: null }));
  };

  useEffect(() => { load(); }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = async () => {
    if (!window.confirm('Delete your play history in this server? This cannot be undone.')) return;
    try {
      await api.resetProfile();
      toast('Your stats were reset');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const p = data.profile;
  return (
    <div className="page">
      <section className="profile-card">
        <img className="profile-avatar" src={me.user.avatar} alt="" />
        <div className="profile-body">
          <h1>{me.user.name}</h1>
          <p className="hero-sub">{p?.lastPlayed ? `In this server · last played ${ago(p.lastPlayed)}` : 'In this server'}</p>
        </div>
        <div className="profile-stats">
          <div className="pstat"><strong>{p?.plays ?? 0}</strong><span>Plays</span></div>
          <div className="pstat"><strong>{p?.songs ?? 0}</strong><span>Different songs</span></div>
          <div className="pstat"><strong>{ago(p?.firstPlayed)}</strong><span>First played</span></div>
        </div>
      </section>

      {data.error ? <p className="empty-note">{data.error.message}</p> : null}
      {p && !p.plays ? <p className="empty-note">No plays yet. Songs you queue will show up here.</p> : null}

      {p ? <Shelf title="On repeat" items={p.onRepeat} showPlays /> : null}
      {p ? <Shelf title="Played lately" items={p.lately} /> : null}

      {p?.plays ? <button className="text-btn" onClick={reset}>Reset my stats in this server</button> : null}
    </div>
  );
}
