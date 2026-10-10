import { useEffect, useState } from 'react';

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
