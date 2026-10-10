import { fmtTime } from '../api.js';

export function Art({ src, size, round, className = '' }) {
  return (
    <div className={`art ${round ? 'round' : ''} ${className}`} style={size ? { width: size, height: size } : undefined}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : null}
    </div>
  );
}

/** One row in a song list: artwork, title/subtitle, duration and trailing actions. */
export function TrackRow({ art, title, subtitle, explicit, badge, duration, onPlay, actions, dragProps, dim, active }) {
  return (
    <div
      className={`row ${dim ? 'dim' : ''} ${active ? 'active' : ''}`}
      onDoubleClick={onPlay}
      {...dragProps}
    >
      <button className="row-art" onClick={onPlay} disabled={!onPlay} aria-label={`Play ${title}`}>
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
      <div className="row-actions">{actions}</div>
      <div className="row-time">{duration ? fmtTime(duration) : ''}</div>
    </div>
  );
}
