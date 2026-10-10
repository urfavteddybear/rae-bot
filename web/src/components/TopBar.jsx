import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, House, Server, Search, X, LogOut, Check } from 'lucide-react';
import { api } from '../api.js';

function AccountMenu({ me, guildId }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="popwrap" ref={wrap}>
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-label="Account and servers" aria-expanded={open}>
        <img src={me.user.avatar} alt="" />
      </button>
      {open ? (
        <div className="popover menu">
          <div className="menu-user"><img src={me.user.avatar} alt="" /><strong>{me.user.name}</strong></div>
          <div className="menu-label">Servers</div>
          <div className="menu-list">
            {me.guilds.map((g) => (
              <button key={g.id} className="menu-item" onClick={() => { setOpen(false); navigate(`/g/${g.id}`); }}>
                {g.icon ? <img src={g.icon} alt="" /> : <span className="guild-fallback">{g.name[0]}</span>}
                <span>{g.name}</span>
                {g.id === guildId ? <Check size={15} /> : null}
              </button>
            ))}
          </div>
          <button
            className="menu-item danger"
            onClick={async () => { await api.logout(); location.assign('/'); }}
          >
            <LogOut size={16} /><span>Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ me, guildId, guildBase }) {
  const navigate = useNavigate();
  const location = useLocation();
  const urlQuery = location.pathname.endsWith('/search') ? new URLSearchParams(location.search).get('q') ?? '' : '';
  const [text, setText] = useState(urlQuery);
  const input = useRef(null);

  useEffect(() => setText(urlQuery), [urlQuery]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounce so typing doesn't fire a search per keystroke.
  useEffect(() => {
    const q = text.trim();
    if (q === urlQuery.trim()) return;
    const id = setTimeout(() => {
      if (q) navigate(`${guildBase}/search?q=${encodeURIComponent(q)}`, { replace: location.pathname.endsWith('/search') });
    }, 350);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <header className="topbar">
      <div className="nav-pill">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft size={18} /></button>
        <button className="icon-btn" onClick={() => navigate(1)} aria-label="Forward"><ChevronRight size={18} /></button>
      </div>
      <nav className="nav-pill tabs-pill">
        <NavLink to={guildBase} end className={({ isActive }) => `pill-link ${isActive ? 'active' : ''}`}><House size={16} />Home</NavLink>
        <NavLink to="/servers" end className={({ isActive }) => `pill-link ${isActive ? 'active' : ''}`}><Server size={16} />Servers</NavLink>
      </nav>

      <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); if (text.trim()) navigate(`${guildBase}/search?q=${encodeURIComponent(text.trim())}`); }}>
        <Search size={16} />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search songs, albums, artists   ( / )"
          aria-label="Search"
        />
        {text ? <button type="button" className="icon-btn small" onClick={() => { setText(''); navigate(guildBase); }} aria-label="Clear search"><X size={15} /></button> : null}
      </form>

      <div className="topbar-right"><AccountMenu me={me} guildId={guildId} /></div>
    </header>
  );
}
