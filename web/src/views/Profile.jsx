import { api } from '../api.js';
import { usePlayer } from '../player.jsx';
import { useToast } from '../toast.jsx';
import { Shelf, ago, useProfile } from '../components/Shelf.jsx';

export function Profile({ me }) {
  const { state } = usePlayer();
  const toast = useToast();
  const { profile: p, error, reload } = useProfile(state?.current?.id);

  const reset = async () => {
    if (!window.confirm('Delete your play history across all servers? This cannot be undone.')) return;
    try {
      await api.resetProfile();
      toast('Your stats were reset');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <section className="profile-card">
        <img className="profile-avatar" src={me.user.avatar} alt="" />
        <div className="profile-body">
          <h1>{me.user.name}</h1>
          <p className="hero-sub">{p?.lastPlayed ? `All servers · last played ${ago(p.lastPlayed)}` : 'All servers'}</p>
        </div>
        <div className="profile-stats">
          <div className="pstat"><strong>{p?.plays ?? 0}</strong><span>Plays</span></div>
          <div className="pstat"><strong>{p?.songs ?? 0}</strong><span>Different songs</span></div>
          <div className="pstat"><strong>{ago(p?.firstPlayed)}</strong><span>First played</span></div>
        </div>
      </section>

      {error ? <p className="empty-note">{error.message}</p> : null}
      {p && !p.plays ? <p className="empty-note">No plays yet. Songs you queue will show up here.</p> : null}

      {p ? <Shelf title="On repeat" items={p.onRepeat} showPlays /> : null}
      {p ? <Shelf title="Played lately" items={p.lately} /> : null}

      {p?.plays ? <button className="text-btn" onClick={reset}>Reset my stats</button> : null}
    </div>
  );
}
