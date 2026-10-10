import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Headphones, House, Search, X, LogOut } from 'lucide-react';
import { api } from '../api.js';
import { usePresence } from '../hooks.js';
import { Segmented } from './Segmented.jsx';

export function AccountMenu({ me }) {
  const [open, setOpen] = useState(false);
  const { mounted, exiting } = usePresence(open, 180);
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
      {mounted ? (
        <div className={`popover menu ${exiting ? 'exit' : ''}`}>
          <div className="menu-user"><img src={me.user.avatar} alt="" /><strong>{me.user.name}</strong></div>
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

export function TopBar({ me, guildBase }) {
  const navigate = useNavigate();
  const location = useLocation();
  const urlQuery = location.pathname.endsWith('/search') ? new URLSearchParams(location.search).get('q') ?? '' : '';
  const [text, setText] = useState(urlQuery);
  const input = useRef(null);

  const path = location.pathname.replace(/\/$/, '');
  const home = guildBase || '/';
  const navValue = path === guildBase ? 'home' : path === `${guildBase}/profile` ? 'profile' : null;
  const navItems = [
    { id: 'home', label: 'Home', icon: House, to: home },
    { id: 'profile', label: 'Profile', icon: Headphones, to: `${guildBase}/profile` },
  ];

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
        <button className="icon-btn lens" onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft size={18} /></button>
        <button className="icon-btn lens" onClick={() => navigate(1)} aria-label="Forward"><ChevronRight size={18} /></button>
      </div>
      <Segmented items={navItems} value={navValue} className="tabs-pill" ariaLabel="Main navigation" />

      <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); if (text.trim()) navigate(`${guildBase}/search?q=${encodeURIComponent(text.trim())}`); }}>
        <Search size={16} />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search songs, albums, artists   ( / )"
          aria-label="Search"
        />
        {text ? <button type="button" className="icon-btn small" onClick={() => { setText(''); navigate(home); }} aria-label="Clear search"><X size={15} /></button> : null}
      </form>

      <div className="topbar-right"><AccountMenu me={me} /></div>
    </header>
  );
}
