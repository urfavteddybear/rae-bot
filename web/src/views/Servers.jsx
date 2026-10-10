import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Music2 } from 'lucide-react';
import { Art } from '../components/TrackRow.jsx';

export const LAST_GUILD_KEY = 'rae:lastGuild';

export function Login() {
  return (
    <main className="splash">
      <div className="splash-card">
        <div className="logo"><Music2 size={30} /></div>
        <h1>Rae</h1>
        <p>Control your server's music from the browser. Log in with Discord to get started.</p>
        <a className="chip solid big" href="/auth/login">Continue with Discord</a>
      </div>
    </main>
  );
}

export function Servers({ me, auto }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!auto) return;
    let last = null;
    try { last = localStorage.getItem(LAST_GUILD_KEY); } catch { /* storage unavailable */ }
    const target = me.guilds.find((g) => g.id === last) ?? (me.guilds.length === 1 ? me.guilds[0] : null);
    if (target) navigate(`/g/${target.id}`, { replace: true });
  }, [auto, me, navigate]);

  return (
    <main className="splash left">
      <div className="servers">
        <h1>Choose a server</h1>
        <p className="hero-sub">Servers you share with the bot.</p>
        {me.guilds.length ? (
          <div className="grid">
            {me.guilds.map((g) => (
              <Link key={g.id} to={`/g/${g.id}`} className="card">
                <Art src={g.icon} className="card-art" />
                <div className="card-title">{g.name}</div>
                <div className="card-sub">
                  {g.nowPlaying ? `Playing: ${g.nowPlaying.title}` : g.inVoice ? 'You’re in voice' : 'Idle'}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="empty-note">You don't share any servers with the bot. Invite it to one and come back.</p>
        )}
      </div>
    </main>
  );
}
