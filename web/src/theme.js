import { useEffect } from 'react';
import { proxied } from './api.js';

const DEFAULT_HUE = 348;
const DEFAULT_SAT = 0.8;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Most vivid hue in the artwork, weighted by saturation. Returns [hue, saturation] or null. */
function dominantColor(img) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l < 0.12 || l > 0.92) continue;
    const key = Math.round(h / 20) % 18;
    const weight = s * s + 0.02;
    const b = buckets.get(key) ?? { w: 0, h: 0, s: 0 };
    b.w += weight; b.h += h * weight; b.s += s * weight;
    buckets.set(key, b);
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b.w > best.w) best = b;
  if (!best) return null;
  return [best.h / best.w, Math.max(0.45, Math.min(0.85, best.s / best.w))];
}

/** Sets --hue / --sat on <html>; the stylesheet derives the background and accent from them. */
export function useArtworkTheme(artwork) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (h, s) => {
      root.style.setProperty('--hue', String(Math.round(h)));
      root.style.setProperty('--sat', `${Math.round(s * 100)}%`);
    };
    if (!artwork) {
      apply(DEFAULT_HUE, DEFAULT_SAT);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = dominantColor(img);
        if (c) apply(c[0], c[1]);
      } catch { /* tainted canvas: keep the previous theme */ }
    };
    img.src = proxied(artwork);
    return () => { cancelled = true; };
  }, [artwork]);
}
