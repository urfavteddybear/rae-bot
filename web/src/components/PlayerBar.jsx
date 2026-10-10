import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Repeat, Repeat1, SkipBack, SkipForward, Play, Pause, Square, Mic2, ListMusic, Shuffle, Infinity as InfinityIcon, Clock,
  Volume1, Volume2, VolumeX, Maximize2,
} from 'lucide-react';
import { fmtTime } from '../api.js';
import { usePlayer, usePosition } from '../player.jsx';
import { Art } from './TrackRow.jsx';
import { usePresence } from '../hooks.js';
import { useToast } from '../toast.jsx';

export function ProgressBar({ duration, disabled }) {
  const { seek } = usePlayer();
  const position = usePosition(100);
  const [drag, setDrag] = useState(null);
  const bar = useRef(null);

  const fromEvent = (e) => {
    const rect = bar.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
  };

  const shown = drag ?? Math.min(position, duration || 0);
  const pct = duration ? (shown / duration) * 100 : 0;

  return (
    <div className="progress">
      <div
        ref={bar}
        className={`track ${disabled ? 'disabled' : ''} ${drag !== null ? 'dragging' : ''}`}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration / 1000)}
        aria-valuenow={Math.round(shown / 1000)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(fromEvent(e));
        }}
        onPointerMove={(e) => { if (drag !== null) setDrag(fromEvent(e)); }}
        onPointerUp={(e) => {
          if (drag === null) return;
          seek(fromEvent(e));
          setDrag(null);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowLeft') seek(Math.max(0, position - 5000));
          if (e.key === 'ArrowRight') seek(Math.min(duration, position + 5000));
        }}
      >
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="thumb" style={{ left: `${pct}%` }} />
      </div>
      <div className="times"><span>{fmtTime(shown)}</span><span>{fmtTime(duration)}</span></div>
    </div>
  );
}

export function VolumeControl({ volume, disabled }) {
  const { act } = usePlayer();
  const [open, setOpen] = useState(false);
  const { mounted, exiting } = usePresence(open, 180);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const Icon = volume === 0 ? VolumeX : volume < 60 ? Volume1 : Volume2;
  return (
    <div className="popwrap" ref={wrap}>
      <button className="icon-btn" aria-label="Volume" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon size={19} /></button>
      {mounted ? (
        <div className={`popover volume ${exiting ? 'exit' : ''}`}>
          <input
            type="range"
            min={0}
            max={150}
            value={volume}
            disabled={disabled}
            aria-label="Volume"
            onChange={(e) => act('volume', { volume: Math.max(1, Number(e.target.value)) })}
          />
          <span>{volume}%</span>
        </div>
      ) : null}
    </div>
  );
}

/** Loop, previous, play/pause, next and stop. Shared by the player bar and the Now Playing view. */
export function Controls() {
  const { state, act } = usePlayer();
  const track = state?.current;
  const can = !!state?.me.canControl && !!track;
  const loop = state?.repeatMode ?? 'off';
  const nextLoop = { off: 'queue', queue: 'track', track: 'off' }[loop];
  const LoopIcon = loop === 'track' ? Repeat1 : Repeat;

  return (
  <div className="controls">
    <button className={`icon-btn ${loop !== 'off' ? 'on' : ''}`} disabled={!can} onClick={() => act('loop', { mode: nextLoop })} aria-label={`Loop: ${loop}`} title={`Loop: ${loop}`}><LoopIcon size={20} /></button>
    <button className="icon-btn" disabled={!can || !state.historyTotal} onClick={() => act('previous')} aria-label="Previous"><SkipBack size={22} fill="currentColor" /></button>
    <button className="play-btn" disabled={!can} onClick={() => act('toggle')} aria-label={state?.paused ? 'Play' : 'Pause'}>
      {state?.paused || !track ? <Play size={26} fill="currentColor" /> : <Pause size={26} fill="currentColor" />}
    </button>
    <button className="icon-btn" disabled={!can} onClick={() => act('skip')} aria-label="Next"><SkipForward size={22} fill="currentColor" /></button>
    <button className="icon-btn" disabled={!can} onClick={() => act('stop')} aria-label="Stop"><Square size={17} fill="currentColor" /></button>
  </div>
  );
}

export function PlayerBar({ lyricsOpen, onToggleLyrics, onOpenNowPlaying, guildBase }) {
  const { state, act } = usePlayer();
  const toast = useToast();
  const navigate = useNavigate();
  const track = state?.current;
  const can = !!state?.me.canControl && !!track;

  return (
    <footer className="playerbar">
      <div className="pb-left">
        {track ? (
          <>
            <Art src={track.artwork} size={64} className="pb-art" />
            <div className="pb-meta">
              <div className="pb-title">{track.title}{track.explicit ? <span className="tag-e">E</span> : null}</div>
              <div className="pb-artist">{track.author}</div>
            </div>
          </>
        ) : (
          <div className="pb-meta"><div className="pb-title muted">Nothing playing</div></div>
        )}
      </div>

      <div className="pb-center">
        <Controls />
        <ProgressBar duration={track?.duration ?? 0} disabled={!can || track?.isStream} />
      </div>

      <div className="pb-right">
        <div className="pill-group">
          <button className={`icon-btn ${lyricsOpen ? 'on' : ''}`} onClick={onToggleLyrics} aria-label="Lyrics" aria-pressed={lyricsOpen}><Mic2 size={18} /></button>
          <button className="icon-btn" onClick={() => navigate(`${guildBase}/queue`)} aria-label="Queue"><ListMusic size={18} /></button>
          <button className="icon-btn" disabled={!can || (state?.queueTotal ?? 0) < 2} onClick={() => act('shuffle')} aria-label="Shuffle queue"><Shuffle size={18} /></button>
          <button className={`icon-btn ${state?.autoplay ? 'on' : ''}`} disabled={!state?.me.canControl || !state?.connected} onClick={() => act('autoplay')} aria-label="Autoplay" aria-pressed={!!state?.autoplay} title="Autoplay"><InfinityIcon size={19} /></button>
          <button
            className={`icon-btn ${state?.stay247 ? 'on' : ''}`}
            disabled={!state?.me.canControl || !state?.connected}
            onClick={async () => { if (await act('stay247')) toast(state.stay247 ? '24/7 mode off' : '24/7 mode on: the bot stays even when nothing is playing'); }}
            aria-label="24/7 mode"
            aria-pressed={!!state?.stay247}
            title={state?.stay247 ? '24/7 mode is on: the bot stays even when nothing is playing. Click to turn it off' : '24/7 mode: stay in the voice channel even when nothing is playing'}
          ><Clock size={18} /></button>
        </div>
        <VolumeControl volume={state?.volume ?? 100} disabled={!can} />
        <button className="icon-btn" aria-label="Open now playing" onClick={onOpenNowPlaying}><Maximize2 size={18} /></button>
      </div>
    </footer>
  );
}
