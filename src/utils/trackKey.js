/** Normalised identity of a song, so the same recording from different sources counts as one. */

export const norm = (s) => String(s ?? '').toLowerCase().replace(/\s*[(\[].*?[)\]]/g, '').replace(/[^a-z0-9 ]/g, '').trim();

export const firstArtist = (s) => String(s ?? '').split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0].trim() || String(s ?? '');

export const keyOf = (title, artist) => `${norm(title)}|${norm(firstArtist(artist))}`;
