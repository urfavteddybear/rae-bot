import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Disc3, Mic2, X, Headphones } from 'lucide-react';
import { fmtLong } from '../api.js';
import { usePlayer, usePosition } from '../player.jsx';
import { activeLineIndex } from '../components/Lyrics.jsx';
import { Art, TrackRow } from '../components/TrackRow.jsx';
import { useList, VirtualRows } from '../lists.jsx';

const sub = (t) => [t.author, t.requester ? `Added by ${t.requester.name}` : null].filter(Boolean).join(' · ');

function CurrentLine({ lyrics }) {
  const position = usePosition(250);
  const lines = lyrics.synced;
  if (!lines?.length) return null;
  const i = activeLineIndex(lines, position);
  const text = i >= 0 ? lines[i].text : '';
  return text ? <p className="hero-line">{text}</p> : <p className="hero-line">&nbsp;</p>;
}

function Hero({ track, state, lyrics, onToggleLyrics, guildBase }) {
  if (!track) {
    return (
      <section className="hero empty">
        <div className="hero-empty-art"><Headphones size={44} /></div>
        <div className="hero-body">
          <h1>Nothing playing</h1>
          <p className="hero-sub">
            {state.me.voiceChannelName
              ? `You're in ${state.me.voiceChannelName}. Search for a song to start playing.`
              : 'Join a voice channel in Discord, then search for a song to start playing.'}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="hero">
      <Art src={track.artwork} className="hero-art" />
      <div className="hero-body">
        <h1>{track.title}</h1>
        <p className="hero-sub">{[track.author, track.album, track.isStream ? 'Live' : fmtLong(track.duration)].filter(Boolean).join(' · ')}</p>
        {track.requester ? (
          <p className="hero-by">
            {track.requester.avatar ? <img src={track.requester.avatar} alt="" /> : null}
            Queued by <strong>{track.requester.name}</strong>
          </p>
        ) : null}
        <CurrentLine lyrics={lyrics} />
        <div className="hero-actions">
          {track.uri ? <a className="chip" href={track.uri} target="_blank" rel="noreferrer"><Disc3 size={15} />Open track</a> : null}
          <button className="chip" onClick={onToggleLyrics}><Mic2 size={15} />Lyrics</button>
        </div>
      </div>
    </section>
  );
}

function listenerNames(names) {
  if (names.length <= 2) return names.join(' and ');
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

function Listeners({ listeners }) {
  if (!listeners.length) return null;
  return (
    <div className="stat listeners">
      <div className="avatar-stack">
        {listeners.slice(0, 4).map((l) => <img key={l.id} src={l.avatar} alt="" title={l.name} />)}
      </div>
      <div className="listeners-text">
        <strong>{listenerNames(listeners.map((l) => l.name))}</strong>
        <span>{listeners.length} listening</span>
      </div>
    </div>
  );
}

function Stats({ stats, listeners }) {
  return (
    <section>
      <h2 className="section-title">In the room</h2>
      <Listeners listeners={listeners} />
      <div className="stats">
        <div className="stat"><strong>{stats.tracks}</strong><span>Tracks played</span></div>
        <div className="stat"><strong>{stats.listeningMs ? fmtLong(stats.listeningMs) : '0 min'}</strong><span>Listening time</span></div>
        <div className="stat">
          <strong>{stats.topArtist?.name ?? '—'}</strong>
          <span>{stats.topArtist ? `Most played · ${stats.topArtist.count} ${stats.topArtist.count === 1 ? 'track' : 'tracks'}` : 'Most played'}</span>
        </div>
      </div>
    </section>
  );
}

function Skeleton() {
  return <div className="row skeleton"><div className="art" /><div className="row-text"><div className="sk-line" /><div className="sk-line short" /></div></div>;
}

/** Up next. With `limit` it shows the first few rows; without, the whole queue in a virtual list. */
export function UpNext({ limit, guildBase }) {
  const { act, state } = usePlayer();
  const can = state.me.canControl;
  const { total, getItem, ensure } = useList('queue');
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const count = limit ? Math.min(limit, total) : total;

  useEffect(() => { if (limit) ensure(0, count); }, [limit, count, ensure, state.queueRev]);

  const renderRow = (i) => {
    const t = getItem(i);
    if (!t) return <Skeleton />;
    return (
      <TrackRow
        art={t.artwork}
        title={t.title}
        explicit={t.explicit}
        subtitle={sub(t)}
        duration={t.duration}
        onPlay={can ? () => act('jump', { index: i, id: t.id }) : undefined}
        dim={dragIndex === i}
        dragProps={can ? {
          draggable: true,
          onDragStart: () => setDragIndex(i),
          onDragOver: (e) => { e.preventDefault(); setOverIndex(i); },
          onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
          onDrop: () => {
            const from = dragIndex !== null ? getItem(dragIndex) : null;
            if (from && dragIndex !== i) act('move', { from: dragIndex, to: i, id: from.id });
            setDragIndex(null); setOverIndex(null);
          },
          'data-over': overIndex === i && dragIndex !== null && dragIndex !== i ? 'true' : undefined,
        } : undefined}
        actions={can ? (
          <button className="icon-btn small" onClick={() => act('remove', { index: i, id: t.id })} aria-label={`Remove ${t.title}`}><X size={15} /></button>
        ) : null}
      />
    );
  };

  return (
    <section className="list-section">
      <div className="section-head">
        <h2 className="section-title">Up next{total ? <small>{total} {total === 1 ? 'song' : 'songs'} · {fmtLong(state.queueDuration)}</small> : null}</h2>
        {limit && total > count && guildBase ? <Link className="see-all" to={`${guildBase}/queue`}>See all {total}<ChevronRight size={14} /></Link> : null}
        {!limit && can && total > 0 ? <button className="see-all" onClick={() => act('clear')}>Clear queue</button> : null}
      </div>
      {total === 0 ? (
        <p className="empty-note">Nothing queued. Search for a song here, or use /play in Discord.</p>
      ) : limit ? (
        <div className="list" onDragLeave={() => setOverIndex(null)}>
          {Array.from({ length: count }, (_, i) => <div key={i}>{renderRow(i)}</div>)}
        </div>
      ) : (
        <div onDragLeave={() => setOverIndex(null)}>
          <VirtualRows total={total} renderRow={renderRow} onRange={ensure} />
        </div>
      )}
    </section>
  );
}

export function History({ limit, guildBase }) {
  const { act, state } = usePlayer();
  const can = state.me.canControl;
  const { total, getItem, ensure } = useList('history');
  const count = limit ? Math.min(limit, total) : total;

  useEffect(() => { if (limit) ensure(0, count); }, [limit, count, ensure, state.historyRev]);

  const renderRow = (i) => {
    const t = getItem(i);
    if (!t) return <Skeleton />;
    return (
      <TrackRow
        art={t.artwork}
        title={t.title}
        explicit={t.explicit}
        subtitle={sub(t)}
        duration={t.duration}
        onPlay={can ? () => act('playHistory', { index: i, id: t.id }) : undefined}
      />
    );
  };

  return (
    <section className="list-section">
      <div className="section-head">
        <h2 className="section-title">Recently played</h2>
        {limit && total > count && guildBase ? <Link className="see-all" to={`${guildBase}/history`}>See all {total}<ChevronRight size={14} /></Link> : null}
      </div>
      {total === 0 ? (
        <p className="empty-note">Songs you've listened to will show up here.</p>
      ) : limit ? (
        <div className="list">{Array.from({ length: count }, (_, i) => <div key={i}>{renderRow(i)}</div>)}</div>
      ) : (
        <VirtualRows total={total} renderRow={renderRow} onRange={ensure} />
      )}
    </section>
  );
}

/** Shown instead of playback info when the viewer isn't in the bot's voice channel. */
export function RestrictedNotice() {
  const { state } = usePlayer();
  return (
    <section className="hero empty">
      <div className="hero-empty-art"><Headphones size={44} /></div>
      <div className="hero-body">
        <h1>Join the music</h1>
        <p className="hero-sub">
          {state.voiceChannelName
            ? `Join ${state.voiceChannelName} in Discord to see what's playing and control it.`
            : 'Join the bot’s voice channel in Discord to see what’s playing and control it.'}
        </p>
      </div>
    </section>
  );
}

export function Home({ lyrics, onToggleLyrics, guildBase }) {
  const { state } = usePlayer();
  if (state.restricted) return <div className="page"><RestrictedNotice /></div>;
  const hasQueue = state.queueTotal > 0;
  const two = hasQueue && state.historyTotal > 0;
  const voiceHint = useMemo(() => {
    if (state.me.canControl) return null;
    if (!state.me.voiceChannelId) return 'Join a voice channel in Discord to control playback.';
    return `Join ${state.voiceChannelName ?? 'the bot’s voice channel'} to control playback.`;
  }, [state]);

  return (
    <div className="page">
      {voiceHint ? <div className="notice">{voiceHint}</div> : null}
      <Hero track={state.current} state={state} lyrics={lyrics} onToggleLyrics={onToggleLyrics} guildBase={guildBase} />
      <Stats stats={state.stats} listeners={state.listeners} />
      <div className={two ? 'two-col' : 'stack'}>
        <UpNext limit={5} guildBase={guildBase} />
        {state.historyTotal > 0 || !two ? <History limit={5} guildBase={guildBase} /> : null}
      </div>
    </div>
  );
}

export function QueuePage() {
  const { state } = usePlayer();
  return <div className="page">{state.restricted ? <RestrictedNotice /> : <UpNext />}</div>;
}

export function HistoryPage() {
  const { state } = usePlayer();
  return <div className="page">{state.restricted ? <RestrictedNotice /> : <History />}</div>;
}
