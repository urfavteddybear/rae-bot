/**
 * Pause and resume. Sources such as Deezer close the audio connection when it sits idle, so a track
 * that stayed paused for a while fails the moment it is resumed. After a long pause the track is
 * loaded again from the same position, which gives it a fresh connection.
 */

/** A pause at least this long reloads the track on resume. */
const REFRESH_AFTER_MS = 30_000;

/** How long the "reloaded on purpose" mark stays valid, in case the new start never arrives. */
const RESTART_WINDOW_MS = 15_000;

export async function pausePlayer(player) {
  player.set('pausedAt', Date.now());
  await player.pause();
}

export async function resumePlayer(player) {
  const pausedFor = Date.now() - (player.get('pausedAt') ?? Date.now());
  player.set('pausedAt', null);

  const track = player.queue.current;
  if (!track || track.info.isStream || pausedFor < REFRESH_AFTER_MS) return player.resume();

  player.set('quietRestartAt', Date.now());
  return player.play({ position: player.position, paused: false });
}

/** True once for the track start that resumePlayer caused, so it isn't announced or counted as a new play. */
export function takeQuietRestart(player) {
  const at = player.get('quietRestartAt');
  player.set('quietRestartAt', null);
  return !!at && Date.now() - at < RESTART_WINDOW_MS;
}
