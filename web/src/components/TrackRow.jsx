import { fmtTime } from '../api.js';
import { useSingleDoubleClick } from '../hooks.js';

export function Art({ src, size, round, className = '' }) {
  return (
    <div className={`art ${round ? 'round' : ''} ${className}`} style={size ? { width: size, height: size } : undefined}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : null}
    </div>
  );
}

/**
 * One row in a song list: artwork, title/subtitle, duration and trailing actions.
 * With `onPlay`, clicking the artwork or double-clicking the row plays the song.
 * With `onAdd` / `onPlayNow` instead, a click on the row adds the song and a double-click plays it now.
 */
export function TrackRow({ art, title, subtitle, explicit, badge, duration, onPlay, onAdd, onPlayNow, actions, dragProps, dim, active }) {
  const clickMode = !!(onAdd || onPlayNow);
  const clicks = useSingleDoubleClick(onAdd, clickMode ? onPlayNow : onPlay);
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className={`row ${dim ? 'dim' : ''} ${active ? 'active' : ''}`}
      {...clicks}
      {...dragProps}
    >
      <button className="row-art" onClick={clickMode ? undefined : onPlay} disabled={!(onPlay || onAdd)} aria-label={`${clickMode ? 'Add' : 'Play'} ${title}`}>
        <Art src={art} size={42} />
      </button>
      <div className="row-text">
        <div className="row-title">
          <span>{title}</span>
          {explicit ? <span className="tag-e" title="Explicit">E</span> : null}
          {badge ? <span className="badge">{badge}</span> : null}
        </div>
        <div className="row-sub">{subtitle}</div>
      </div>
      <div className="row-actions" onClick={stop} onDoubleClick={stop}>{actions}</div>
      <div className="row-time">{duration ? fmtTime(duration) : ''}</div>
    </div>
  );
}
