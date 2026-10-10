import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ListPlus, Play, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { usePlayer } from '../player.jsx';
import { useToast } from '../toast.jsx';
import { Art, TrackRow } from '../components/TrackRow.jsx';

/**
 * Add/play helpers shared by search results and album/artist pages.
 * `ids` are the track ids on screen; the bot reports which of them are already queued.
 */
export function useAdder(ids = []) {
  const { act, state, guildId } = usePlayer();
  const toast = useToast();
  const [queued, setQueued] = useState(() => new Set());
  const key = ids.join(',');

  useEffect(() => {
    if (!ids.length) { setQueued(new Set()); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const chunks = [];
      for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
      try {
        const found = (await Promise.all(chunks.map((c) => api.queued(guildId, c)))).flatMap((r) => r.ids);
        if (!cancelled) setQueued(new Set(found));
      } catch { /* badges are cosmetic */ }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, key, state.queueRev, state.current?.id]);

  const add = async (url, label, opts = {}) => {
    if (await act('add', { url, ...opts })) toast(opts.now ? `Playing ${label}` : `Added ${label} to the queue`);
  };
  return { add, queued, canAdd: !!state.me.canControl };
}

function useFetch(loader, deps) {
  const [data, setData] = useState({ loading: true, error: null, value: null });
  useEffect(() => {
    let cancelled = false;
    setData({ loading: true, error: null, value: null });
    loader()
      .then((value) => { if (!cancelled) setData({ loading: false, error: null, value }); })
      .catch((error) => { if (!cancelled) setData({ loading: false, error, value: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function TrackList({ tracks, queued, add, canAdd, limit }) {
  return (
    <div className="list">
      {(limit ? tracks.slice(0, limit) : tracks).map((t) => (
        <TrackRow
          key={t.id}
          art={t.artwork}
          title={t.title}
          explicit={t.explicit}
          badge={queued.has(t.id) ? 'In queue' : null}
          subtitle={[t.author, t.album].filter(Boolean).join(' · ')}
          duration={t.duration}
          onPlay={canAdd ? () => add(t.url, t.title, { now: true }) : undefined}
          actions={canAdd ? (
            <button className="icon-btn small" onClick={() => add(t.url, t.title)} aria-label={`Add ${t.title} to queue`} title="Add to queue"><ListPlus size={17} /></button>
          ) : null}
        />
      ))}
    </div>
  );
}

function AlbumGrid({ albums, guildBase }) {
  return (
    <div className="grid">
      {albums.map((a) => (
        <Link key={a.id} to={`${guildBase}/album/${a.id}`} className="card">
          <Art src={a.artwork} className="card-art" />
          <div className="card-title">{a.title}</div>
          <div className="card-sub">{a.author}</div>
        </Link>
      ))}
    </div>
  );
}

function ArtistGrid({ artists, guildBase }) {
  return (
    <div className="grid">
      {artists.map((a) => (
        <Link key={a.id} to={`${guildBase}/artist/${a.id}`} className="card artist">
          <Art src={a.picture} round className="card-art" />
          <div className="card-title">{a.name}</div>
          <div className="card-sub">Artist</div>
        </Link>
      ))}
    </div>
  );
}

const TABS = [['all', 'Everything'], ['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists']];

export function Search({ guildBase }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tab = params.get('tab') ?? 'all';
  const { loading, error, value } = useFetch(() => api.search(q), [q]);
  const adder = useAdder(value?.tracks.map((t) => t.id));

  const setTab = (t) => setParams({ q, ...(t === 'all' ? {} : { tab: t }) }, { replace: true });
  const top = value?.artists[0];

  return (
    <div className="page">
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {loading ? <p className="empty-note">Searching…</p> : null}
      {error ? <p className="empty-note">Search failed. {error.message}</p> : null}
      {value && !value.tracks.length && !value.albums.length && !value.artists.length ? <p className="empty-note">No results for “{q}”.</p> : null}

      {value && tab === 'all' ? (
        <>
          <div className="search-grid">
            {top ? (
              <section>
                <h2 className="section-title">Top result</h2>
                <Link to={`${guildBase}/artist/${top.id}`} className="top-card">
                  <Art src={top.picture} round className="top-art" />
                  <div className="top-name">{top.name}</div>
                  <div className="card-sub">Artist</div>
                </Link>
              </section>
            ) : null}
            {value.tracks.length ? (
              <section className="list-section">
                <div className="section-head">
                  <h2 className="section-title">Songs</h2>
                  <button className="see-all" onClick={() => setTab('songs')}>See all {value.tracks.length}<ChevronRight size={14} /></button>
                </div>
                <TrackList tracks={value.tracks} limit={5} {...adder} />
              </section>
            ) : null}
          </div>
          {value.albums.length ? <section><h2 className="section-title">Albums</h2><AlbumGrid albums={value.albums.slice(0, 6)} guildBase={guildBase} /></section> : null}
          {value.artists.length > 1 ? <section><h2 className="section-title">Artists</h2><ArtistGrid artists={value.artists.slice(1, 7)} guildBase={guildBase} /></section> : null}
        </>
      ) : null}
      {value && tab === 'songs' ? <TrackList tracks={value.tracks} {...adder} /> : null}
      {value && tab === 'albums' ? <AlbumGrid albums={value.albums} guildBase={guildBase} /> : null}
      {value && tab === 'artists' ? <ArtistGrid artists={value.artists} guildBase={guildBase} /> : null}
    </div>
  );
}

/** Album or artist detail: header, play/add all, and the track list. */
export function Collection({ kind }) {
  const { id } = useParams();
  const { loading, error, value } = useFetch(() => (kind === 'album' ? api.album(id) : api.artist(id)), [kind, id]);
  const adder = useAdder(value?.tracks.map((t) => t.id));

  if (loading) return <div className="page"><p className="empty-note">Loading…</p></div>;
  if (error) return <div className="page"><p className="empty-note">Could not load this {kind}. {error.message}</p></div>;

  const isAlbum = kind === 'album';
  const title = isAlbum ? value.title : value.name;
  return (
    <div className="page">
      <section className="hero">
        <Art src={isAlbum ? value.artwork : value.picture} round={!isAlbum} className="hero-art" />
        <div className="hero-body">
          <h1>{title}</h1>
          <p className="hero-sub">
            {isAlbum
              ? [value.author, value.year, `${value.tracks.length} songs`].filter(Boolean).join(' · ')
              : `Artist${value.fans ? ` · ${value.fans.toLocaleString()} fans` : ''}`}
          </p>
          <div className="hero-actions">
            <button className="chip solid" disabled={!adder.canAdd} onClick={() => adder.add(value.url, title, { now: true })}><Play size={15} fill="currentColor" />Play</button>
            <button className="chip" disabled={!adder.canAdd} onClick={() => adder.add(value.url, title)}><ListPlus size={15} />Add to queue</button>
          </div>
        </div>
      </section>
      <section className="list-section">
        <h2 className="section-title">{isAlbum ? 'Songs' : 'Popular songs'}</h2>
        <TrackList tracks={value.tracks} {...adder} />
      </section>
    </div>
  );
}
