/**
 * Apple Music / Wave Synced Lyrics Engine (Powered by LRCLIB)
 * Parses timestamped LRC lyrics, animates progressive wave text fill,
 * provides smooth centering auto-scroll, and click-to-seek playback.
 */

export class LyricsEngine {
  constructor(options = {}) {
    this.container = document.getElementById('lyricsStream');
    this.heroQuote = document.getElementById('heroQuote');
    this.onSeek = options.onSeek || (() => {});

    this.lines = []; // Array<{ startTimeMs, endTimeMs, text, el }>
    this.activeIndex = -1;
    this.currentTrackKey = null;
    this.userScrolling = false;
    this.userScrollTimeout = null;

    if (this.container) {
      this.container.addEventListener('wheel', () => this.handleUserScroll(), { passive: true });
      this.container.addEventListener('touchmove', () => this.handleUserScroll(), { passive: true });
    }
  }

  handleUserScroll() {
    this.userScrolling = true;
    if (this.userScrollTimeout) clearTimeout(this.userScrollTimeout);
    this.userScrollTimeout = setTimeout(() => {
      this.userScrolling = false;
      this.scrollToActive();
    }, 4000);
  }

  /**
   * Load lyrics for a track.
   */
  async loadTrackLyrics(title, artist, duration) {
    if (!title) {
      this.renderEmpty('Nothing playing');
      return;
    }

    const trackKey = `${title}:::${artist}`.toLowerCase();
    if (trackKey === this.currentTrackKey) return;
    this.currentTrackKey = trackKey;

    this.renderLoading();

    try {
      const url = `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}&duration=${duration || ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Lyrics fetch failed');

      const data = await res.json();
      if (data.syncedLyrics) {
        this.parseLrc(data.syncedLyrics);
        this.renderSynced();
      } else if (data.plainLyrics) {
        this.renderPlain(data.plainLyrics);
      } else {
        this.renderEmpty('No lyrics available for this track');
      }
    } catch {
      this.renderEmpty('Lyrics unavailable');
    }
  }

  /**
   * Parse LRC format string [mm:ss.xx] Line text into timing array.
   */
  /**
   * Parse LRC format string [mm:ss.xx] Line text into timing array.
   */
  parseLrc(lrcText) {
    this.lines = [];
    const rawLines = lrcText.split('\n');
    const timeRegex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

    for (const raw of rawLines) {
      const trimmed = raw.trim();
      const match = trimmed.match(timeRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const fraction = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
        const startTimeMs = (mins * 60 + secs) * 1000 + fraction;
        const text = match[4].trim();

        if (text) {
          const rawWords = text.split(/\s+/).filter(Boolean);
          let totalWeight = 0;
          const words = rawWords.map((word) => {
            const weight = Math.max(2, word.length) + 1;
            totalWeight += weight;
            return {
              text: word,
              weight,
              startFrac: 0,
              endFrac: 0,
              el: null,
              state: 'dim',
            };
          });

          let currentWeight = 0;
          for (const w of words) {
            w.startFrac = currentWeight / Math.max(1, totalWeight);
            currentWeight += w.weight;
            w.endFrac = currentWeight / Math.max(1, totalWeight);
          }

          this.lines.push({
            startTimeMs,
            endTimeMs: 0,
            text,
            words,
            el: null,
          });
        }
      }
    }

    // Calculate endTimeMs for each line
    for (let i = 0; i < this.lines.length; i++) {
      if (i < this.lines.length - 1) {
        this.lines[i].endTimeMs = this.lines[i + 1].startTimeMs;
      } else {
        this.lines[i].endTimeMs = this.lines[i].startTimeMs + 6000;
      }
    }

    this.activeIndex = -1;
  }

  renderSynced() {
    if (!this.container) return;
    this.container.innerHTML = '';

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const div = document.createElement('div');
      div.className = 'lyric-line';
      div.setAttribute('data-index', i);
      div.setAttribute('data-start', line.startTimeMs);

      div.innerHTML = line.words.map((w, wIdx) => 
        `<span class="l-word" data-w="${wIdx}">${escapeHtml(w.text)}</span>`
      ).join(' ');

      div.addEventListener('click', () => {
        this.onSeek(line.startTimeMs);
      });

      line.el = div;
      const spanEls = div.querySelectorAll('.l-word');
      for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
        line.words[wIdx].el = spanEls[wIdx];
        line.words[wIdx].state = 'dim';
      }

      this.container.appendChild(div);
    }
  }

  renderPlain(plainText) {
    if (!this.container) return;
    this.lines = [];
    this.activeIndex = -1;
    this.container.innerHTML = plainText
      .split('\n')
      .map(line => `<div class="lyric-line plain" style="color: rgba(255,255,255,0.7); font-size: 24px;">${line || '&nbsp;'}</div>`)
      .join('');
  }

  renderLoading() {
    if (!this.container) return;
    this.container.innerHTML = `<div class="lyric-line active" style="font-size: 24px; color: var(--text-muted);">Finding lyrics...</div>`;
  }

  renderEmpty(msg) {
    if (!this.container) return;
    this.lines = [];
    this.activeIndex = -1;
    this.currentTrackKey = null;
    this.container.innerHTML = `<div class="lyric-line" style="font-size: 22px; color: var(--text-dim);">${msg}</div>`;
  }

  /**
   * Reset all lyrics state when playback stops or guild changes.
   */
  clear() {
    this.lines = [];
    this.activeIndex = -1;
    this.currentTrackKey = null;
    if (this.container) {
      this.container.innerHTML = `<div class="lyric-line" style="font-size: 22px; color: var(--text-dim);">No lyrics playing</div>`;
    }
  }

  /**
   * Update active lyric state and smooth progressive wave karaoke animation.
   */
  updatePosition(currentMs, isPlaying) {
    if (!this.lines.length) return;

    // Find active line
    let newIndex = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (currentMs >= this.lines[i].startTimeMs && currentMs < this.lines[i].endTimeMs) {
        newIndex = i;
        break;
      }
    }

    // If before first line
    if (newIndex === -1 && currentMs < this.lines[0].startTimeMs) {
      newIndex = -1;
    } else if (newIndex === -1 && currentMs >= this.lines[this.lines.length - 1].endTimeMs) {
      newIndex = this.lines.length - 1;
    }

    // Check if active line changed
    const indexChanged = newIndex !== this.activeIndex;

    if (indexChanged) {
      const prevIndex = this.activeIndex;
      this.activeIndex = newIndex;

      // Reset previous active line words if it existed
      if (prevIndex >= 0 && this.lines[prevIndex]?.words) {
        for (const w of this.lines[prevIndex].words) {
          if (w.el) {
            w.state = 'past';
            w.el.className = 'l-word';
            w.el.style.removeProperty('--w-prog');
          }
        }
      }

      for (let i = 0; i < this.lines.length; i++) {
        const line = this.lines[i];
        if (!line.el) continue;

        if (i < this.activeIndex) {
          if (line.el.className !== 'lyric-line past') {
            line.el.className = 'lyric-line past';
          }
        } else if (i === this.activeIndex) {
          line.el.className = 'lyric-line active';
        } else {
          if (line.el.className !== 'lyric-line') {
            line.el.className = 'lyric-line';
          }
          if (line.words) {
            for (const w of line.words) {
              if (w.state !== 'dim') {
                w.state = 'dim';
                w.el.className = 'l-word';
                w.el.style.removeProperty('--w-prog');
              }
            }
          }
        }
      }

      if (!this.userScrolling) {
        this.scrollToActive();
      }

      if (this.heroQuote && this.activeIndex >= 0 && this.lines[this.activeIndex]) {
        this.heroQuote.textContent = `"${this.lines[this.activeIndex].text}"`;
      }
    }

    // High-performance word-by-word sequential wave illumination
    if (this.activeIndex >= 0 && this.lines[this.activeIndex]?.words) {
      const activeLine = this.lines[this.activeIndex];
      if (isPlaying && activeLine.words.length) {
        const lineSpan = Math.max(100, activeLine.endTimeMs - activeLine.startTimeMs);
        // Estimate natural singing duration (words * ~460ms, bounded by line span)
        const estDuration = Math.max(1400, Math.min(lineSpan, activeLine.words.length * 460));
        const elapsed = Math.max(0, currentMs - activeLine.startTimeMs);
        const progressFrac = Math.min(1, Math.max(0, elapsed / estDuration));

        for (let j = 0; j < activeLine.words.length; j++) {
          const word = activeLine.words[j];
          if (!word.el) continue;

          // Wave has completely passed this word -> 100% lit
          if (progressFrac >= word.endFrac) {
            if (word.state !== 'lit') {
              word.state = 'lit';
              word.el.className = 'l-word lit';
              word.el.style.removeProperty('--w-prog');
            }
          }
          // Wave has not reached this word yet -> dim
          else if (progressFrac <= word.startFrac) {
            if (word.state !== 'dim') {
              word.state = 'dim';
              word.el.className = 'l-word';
              word.el.style.removeProperty('--w-prog');
            }
          }
          // Wave is currently sweeping through this word!
          else {
            const wordSpan = Math.max(0.001, word.endFrac - word.startFrac);
            const wProg = Math.min(100, Math.max(0, ((progressFrac - word.startFrac) / wordSpan) * 100));

            if (word.state !== 'current') {
              word.state = 'current';
              word.el.className = 'l-word current';
            }
            word.el.style.setProperty('--w-prog', `${wProg.toFixed(1)}%`);
          }
        }
      }
    }
  }

  scrollToActive() {
    if (this.activeIndex < 0 || !this.lines[this.activeIndex]?.el || !this.container) return;
    const activeEl = this.lines[this.activeIndex].el;
    const containerRect = this.container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    const currentScrollTop = this.container.scrollTop;
    const targetScroll = currentScrollTop + (elRect.top - containerRect.top) - (containerRect.height * 0.32);

    this.container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

