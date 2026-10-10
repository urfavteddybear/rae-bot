import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelRightClose } from 'lucide-react';
import { api } from '../api.js';
import { usePlayer, usePosition } from '../player.jsx';

/** Fetches lyrics for the current track. Returns { status, synced, plain }. */
export function useLyrics(track) {
  const [data, setData] = useState({ status: 'idle', synced: null, plain: null });
  const key = track ? `${track.title}|${track.author}|${track.duration}` : null;

  useEffect(() => {
    if (!track) {
      setData({ status: 'idle', synced: null, plain: null });
      return;
    }
    let cancelled = false;
    setData({ status: 'loading', synced: null, plain: null });
    api.lyrics(track)
      .then((r) => { if (!cancelled) setData({ status: 'done', synced: r.synced, plain: r.plain }); })
      .catch(() => { if (!cancelled) setData({ status: 'error', synced: null, plain: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

/** Index of the last line whose timestamp has passed, or -1 before the first line. */
export function activeLineIndex(lines, position) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position + 150) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function LyricsPanel({ lyrics, onClose }) {
  const { state, seek } = usePlayer();
  const position = usePosition(150);
  const scroller = useRef(null);
  const lineRefs = useRef([]);
  const lines = lyrics.synced;
  const active = useMemo(() => (lines ? activeLineIndex(lines, position) : -1), [lines, position]);

  useEffect(() => {
    const el = lineRefs.current[Math.max(active, 0)];
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.28, behavior: 'smooth' });
  }, [active, lines]);

  let body;
  if (state?.restricted) body = <p className="lyrics-note">Join the bot’s voice channel to see lyrics.</p>;
  else if (!state?.current) body = <p className="lyrics-note">Play a song to see its lyrics.</p>;
  else if (lyrics.status === 'loading') body = <p className="lyrics-note">Looking for lyrics…</p>;
  else if (lines?.length) {
    body = (
      <div className="lyrics-lines">
        {lines.map((line, i) => {
          const dist = active < 0 ? i + 1 : i - active;
          const cls = dist === 0 ? 'now' : dist < 0 ? 'past' : 'next';
          return (
            <button
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              className={`lyric ${cls}`}
              style={dist !== 0 ? { '--blur': `${Math.min(Math.abs(dist), 4) * 0.9}px` } : undefined}
              onClick={() => state.me.canControl && seek(line.time)}
            >
              {line.text || '♪'}
            </button>
          );
        })}
        <div className="lyrics-pad" />
      </div>
    );
  } else if (lyrics.plain) body = <pre className="lyrics-plain">{lyrics.plain}</pre>;
  else body = <p className="lyrics-note">No lyrics found for this song.</p>;

  return (
    <aside className="lyrics">
      <header className="lyrics-head">
        <h2>Lyrics</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Hide lyrics"><PanelRightClose size={18} /></button>
      </header>
      <div className="lyrics-scroll" ref={scroller}>{body}</div>
    </aside>
  );
}
