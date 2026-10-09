/**
 * In-memory room & listening session analytics tracker per guild.
 */
class SessionTracker {
  constructor() {
    /** @type {Map<string, { tracksPlayed: number, listeningTimeMs: number, artistCounts: Map<string, number>, recentlyPlayed: Array<any>, lastPosition: number }>} */
    this.sessions = new Map();
  }

  /**
   * Get or initialize session state for a guild.
   */
  getSession(guildId) {
    if (!this.sessions.has(guildId)) {
      this.sessions.set(guildId, {
        tracksPlayed: 0,
        listeningTimeMs: 0,
        artistCounts: new Map(),
        recentlyPlayed: [],
        lastPosition: 0,
      });
    }
    return this.sessions.get(guildId);
  }

  /**
   * Record when a new track starts playing.
   */
  recordTrackStart(guildId, track) {
    if (!track?.info) return;
    const session = this.getSession(guildId);
    session.tracksPlayed += 1;
    session.lastPosition = 0;

    const artist = track.info.author || 'Unknown';
    const currentCount = session.artistCounts.get(artist) || 0;
    session.artistCounts.set(artist, currentCount + 1);

    // Add to recently played (keep max 50)
    session.recentlyPlayed.unshift({
      title: track.info.title,
      author: track.info.author,
      duration: track.info.duration,
      uri: track.info.uri,
      artworkUrl: track.info.artworkUrl,
      sourceName: track.info.sourceName,
      requester: track.requester ? {
        username: track.requester.username || track.requester.tag || 'Unknown',
        avatar: track.requester.displayAvatarURL ? track.requester.displayAvatarURL() : null,
      } : null,
      playedAt: Date.now(),
    });

    if (session.recentlyPlayed.length > 50) {
      session.recentlyPlayed.pop();
    }
  }

  /**
   * Update listening time as playback progresses.
   */
  recordPosition(guildId, positionMs) {
    const session = this.getSession(guildId);
    if (positionMs > session.lastPosition) {
      const delta = positionMs - session.lastPosition;
      // Sanity check to avoid huge jumps on seek
      if (delta > 0 && delta < 5000) {
        session.listeningTimeMs += delta;
      }
    }
    session.lastPosition = positionMs;
  }

  /**
   * Get formatted room statistics.
   */
  getRoomStats(guildId) {
    const session = this.getSession(guildId);

    // Find most played artist
    let topArtist = 'None';
    let maxTracks = 0;
    for (const [artist, count] of session.artistCounts.entries()) {
      if (count > maxTracks) {
        maxTracks = count;
        topArtist = artist;
      }
    }

    return {
      tracksPlayed: session.tracksPlayed,
      listeningTimeMs: session.listeningTimeMs,
      topArtist: maxTracks > 0 ? { name: topArtist, count: maxTracks } : null,
      recentlyPlayed: session.recentlyPlayed,
    };
  }
}

export const sessionTracker = new SessionTracker();
