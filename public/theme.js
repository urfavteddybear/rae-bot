/**
 * Dynamic Ambient Background & Color Extraction Engine
 * Extracts dominant colors from album artwork and smoothly animates CSS ambient gradients.
 */

export class ThemeEngine {
  constructor() {
    this.root = document.documentElement;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 64;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.currentArtUrl = null;
  }

  /**
   * Apply dynamic ambient background extracted from the track album artwork.
   */
  async updateFromArtwork(artworkUrl) {
    if (!artworkUrl || artworkUrl === this.currentArtUrl) return;
    this.currentArtUrl = artworkUrl;

    try {
      const colors = await this.extractColors(artworkUrl);
      if (!colors) return;

      this.root.style.setProperty('--bg-gradient-1', colors.dominant);
      this.root.style.setProperty('--bg-gradient-2', colors.secondary);
      this.root.style.setProperty('--accent-color', colors.accent);
    } catch {
      // Graceful fallback to default aesthetic theme
      this.root.style.setProperty('--bg-gradient-1', '#2a0815');
      this.root.style.setProperty('--bg-gradient-2', '#14050d');
      this.root.style.setProperty('--accent-color', '#ff3b69');
    }
  }

  /**
   * Extract dominant and accent colors from an image URL.
   */
  extractColors(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          this.ctx.clearRect(0, 0, 64, 64);
          this.ctx.drawImage(img, 0, 0, 64, 64);
          const imageData = this.ctx.getImageData(0, 0, 64, 64).data;

          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          let maxSat = 0;
          let vibrant = { r: 180, g: 30, b: 60 };

          for (let i = 0; i < imageData.length; i += 16) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];

            // Ignore extreme blacks and extreme whites
            const brightness = (r + g + b) / 3;
            if (brightness < 20 || brightness > 235) continue;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;

            if (sat > maxSat) {
              maxSat = sat;
              vibrant = { r, g, b };
            }

            rSum += r;
            gSum += g;
            bSum += b;
            count++;
          }

          if (count === 0) {
            return resolve(null);
          }

          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);

          // Deep rich dark tones for the ambient background
          const dominant = `rgb(${Math.round(avgR * 0.45)}, ${Math.round(avgG * 0.45)}, ${Math.round(avgB * 0.45)})`;
          const secondary = `rgb(${Math.round(vibrant.r * 0.25)}, ${Math.round(vibrant.g * 0.25)}, ${Math.round(vibrant.b * 0.25)})`;
          const accent = `rgb(${vibrant.r}, ${vibrant.g}, ${vibrant.b})`;

          resolve({ dominant, secondary, accent });
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
}
