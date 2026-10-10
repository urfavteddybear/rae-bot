import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { usePlayer } from './player.jsx';

export const PAGE_SIZE = 100;
export const ROW_HEIGHT = 56;

/**
 * Pages of the queue or history, fetched on demand. The live state only carries a revision
 * string; when it changes the cache is dropped and whatever is on screen is refetched.
 */
export function useList(kind) {
  const { guildId, state } = usePlayer();
  const rev = kind === 'queue' ? state.queueRev : state.historyRev;
  const total = kind === 'queue' ? state.queueTotal : state.historyTotal;

  const pages = useRef(new Map());   // page index -> items
  const pending = useRef(new Set()); // page indexes in flight
  const range = useRef([0, 0]);
  const generation = useRef(0);
  const [, setVersion] = useState(0);

  const loadPage = useCallback((page) => {
    if (pages.current.has(page) || pending.current.has(page)) return;
    pending.current.add(page);
    const gen = generation.current;
    api.list(guildId, kind, page * PAGE_SIZE, PAGE_SIZE)
      .then((res) => {
        if (gen !== generation.current) return;
        pages.current.set(page, res.items);
        setVersion((v) => v + 1);
      })
      .catch(() => { /* the next revision change retries */ })
      .finally(() => { if (gen === generation.current) pending.current.delete(page); });
  }, [guildId, kind]);

  const ensure = useCallback((start, end) => {
    range.current = [start, end];
    if (end <= start) return;
    const last = Math.floor((end - 1) / PAGE_SIZE);
    for (let p = Math.floor(start / PAGE_SIZE); p <= last; p++) loadPage(p);
  }, [loadPage]);

  // Drop everything when the list changed or the server switched, then refill what is visible.
  const seen = useRef(null);
  useEffect(() => {
    const key = `${guildId}|${rev}`;
    if (seen.current === null || seen.current === key) { seen.current = key; return; }
    seen.current = key;
    generation.current += 1;
    pages.current = new Map();
    pending.current = new Set();
    const id = setTimeout(() => ensure(range.current[0], range.current[1]), 150);
    return () => clearTimeout(id);
  }, [rev, guildId, ensure]);

  const getItem = useCallback((i) => pages.current.get(Math.floor(i / PAGE_SIZE))?.[i % PAGE_SIZE] ?? null, []);

  return { total, getItem, ensure };
}

/**
 * Renders only the rows near the viewport of the nearest scroll container ([data-scroll]), so a queue of
 * thousands costs the same as one of fifty. Rows are fixed-height and absolutely positioned.
 */
export function VirtualRows({ total, renderRow, onRange, overscan = 8 }) {
  const box = useRef(null);
  const [view, setView] = useState([0, 24]);

  useEffect(() => {
    const el = box.current;
    const scroller = el?.closest('[data-scroll]');
    if (!scroller) return;
    const update = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const first = Math.max(0, Math.floor(-top / ROW_HEIGHT) - overscan);
      const last = Math.min(total, Math.ceil((-top + scroller.clientHeight) / ROW_HEIGHT) + overscan);
      setView((w) => (w[0] === first && w[1] === last ? w : [first, last]));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => { scroller.removeEventListener('scroll', update); ro.disconnect(); };
  }, [total, overscan]);

  const [first, last] = view;
  useEffect(() => { onRange?.(first, Math.min(last, total)); }, [first, last, total, onRange]);

  const rows = [];
  for (let i = first; i < Math.min(last, total); i++) {
    rows.push(<div key={i} className="vrow" style={{ top: i * ROW_HEIGHT }}>{renderRow(i)}</div>);
  }
  return <div ref={box} className="vlist" style={{ height: total * ROW_HEIGHT }}>{rows}</div>;
}
