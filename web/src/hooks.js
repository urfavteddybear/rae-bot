import { useEffect, useRef, useState } from 'react';

/**
 * Keeps something mounted for `ms` after `open` turns false, so it can play an exit animation.
 * Returns { mounted, exiting }: render while `mounted`, add an exit class while `exiting`.
 */
export function usePresence(open, ms) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) { setMounted(true); return; }
    const id = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(id);
  }, [open, ms]);

  return { mounted: open || mounted, exiting: !open && mounted };
}

/**
 * Single click and double-click on the same thing. A double-click is two clicks, so the single-click
 * action waits briefly to see whether a second click follows and is skipped if it does.
 */
export function useSingleDoubleClick(onSingle, onDouble, ms = 280) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    onClick: () => {
      if (!onSingle) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(onSingle, ms);
    },
    onDoubleClick: () => {
      clearTimeout(timer.current);
      onDouble?.();
    },
  };
}
