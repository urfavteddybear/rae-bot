import { useEffect, useRef, useState } from 'react';
import { Disc3, Headphones, ListMusic, Minimize2, Mic2, PanelRight, Users } from 'lucide-react';
import { fmtLong } from '../api.js';
import { usePlayer } from '../player.jsx';
import { UpNext } from '../views/Home.jsx';
import { Controls, ProgressBar, VolumeControl } from './PlayerBar.jsx';
import { Segmented } from './Segmented.jsx';
import { LyricsView } from './Lyrics.jsx';

/** Deezer serves covers at any size; ask for a big one since this view shows the art at full height. */
function hiRes(url) {
  return url ? url.replace(/\/\d+x\d+(-[^/]*)?\.(jpg|png)$/, '/1000x1000$1.$2') : url;
}

function Cover({ src }) {
  const [url, setUrl] = useState(hiRes(src));
  useEffect(() => setUrl(hiRes(src)), [src]);
  return url ? <img src={url} alt="" draggable={false} onError={() => setUrl((u) => (u !== src ? src : null))} /> : null;
}

function Credits({ track }) {
  const artists = (track.author ?? '').split(/\s*[,&]\s*/).filter(Boolean);
  const rows = [
    ['Artists', artists.join(', ')],
    ['Album', track.album],
    ['Length', track.isStream ? 'Live' : fmtLong(track.duration)],
    ['Source', track.source ? track.source[0].toUpperCase() + track.source.slice(1) : null],
  ].filter(([, v]) => v);
  return (
    <div className="credits">
      <h2>{track.title}</h2>
      <dl>
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        {track.requester ? (
          <div>
            <dt>Queued by</dt>
            <dd className="credit-user">{track.requester.avatar ? <img src={track.requester.avatar} alt="" /> : null}{track.requester.name}</dd>
          </div>
        ) : null}
      </dl>
      {track.uri ? <a className="chip" href={track.uri} target="_blank" rel="noreferrer"><Disc3 size={15} />Open track</a> : null}
    </div>
  );
}

const TABS = [['lyrics', 'Lyrics', Mic2], ['credits', 'Credits', Users], ['queue', 'Queue', ListMusic]];

/** Immersive full-window player: big artwork on the left, lyrics / credits / queue on the right. */
export function NowPlaying({ lyrics, onClose }) {
  const { state } = usePlayer();
  const track = state.current;
  const [tab, setTab] = useState('lyrics');
  const [panel, setPanel] = useState(() => !window.matchMedia('(max-width: 900px)').matches);
  const [showTop, setShowTop] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    root.current?.focus();
    let entered = false;
    // In browser fullscreen, Esc is taken by the browser: it leaves fullscreen, and so does this view.
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    const onFs = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const can = !!state.me.canControl && !!track;

  let content;
  if (state.restricted) content = <p className="lyrics-note">Join the bot’s voice channel to see what’s playing.</p>;
  else if (tab === 'lyrics') content = <LyricsView lyrics={lyrics} />;
  else if (tab === 'credits') content = track ? <div className="np-scroll" data-scroll><Credits track={track} /></div> : <p className="lyrics-note">Nothing is playing.</p>;
  else content = <div className="np-scroll" data-scroll><UpNext /></div>;

  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`np ${panel ? '' : 'no-panel'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      onMouseMove={(e) => setShowTop(e.clientY < 100)}
      onMouseLeave={() => setShowTop(false)}
    >
      <div className="np-bg" aria-hidden="true" />

      <div className="np-art">
        {track ? <Cover src={track.artwork} /> : (
          <div className="np-art-empty"><Headphones size={64} /><span>{state.restricted ? 'Join the voice channel to listen along' : 'Nothing playing'}</span></div>
        )}
      </div>

      <header className={`np-top ${showTop ? 'show' : ''}`}>
        <div className="nav-pill">
          <button className="icon-btn" onClick={onClose} aria-label="Close now playing"><Minimize2 size={18} /></button>
        </div>
        <Segmented tabs items={TABS.map(([id, label, icon]) => ({ id, label, icon }))} value={tab} onSelect={(id) => { setTab(id); setPanel(true); }} ariaLabel="Now playing sections" />
        <div className="nav-pill">
          <button className={`icon-btn ${panel ? 'on' : ''}`} onClick={() => setPanel((p) => !p)} aria-label="Toggle side panel" aria-pressed={panel}><PanelRight size={18} /></button>
        </div>
      </header>

      <section className="np-info">
        {track ? (
          <div className="np-title-row">
            <div className="np-meta">
              <div className="np-title">{track.title}{track.explicit ? <span className="tag-e">E</span> : null}</div>
              <div className="np-artist">{[track.author, track.album].filter(Boolean).join(' · ')}</div>
            </div>
            <VolumeControl volume={state.volume} disabled={!can} />
          </div>
        ) : null}
        <ProgressBar duration={track?.duration ?? 0} disabled={!can || track?.isStream} />
        <Controls />
      </section>

      {panel ? <section className="np-panel">{content}</section> : null}
    </div>
  );
}
