import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useToast } from './toast.jsx';

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

/**
 * Keeps a WebSocket open to the bot. The bot follows the voice channel you are in: it sends that
 * server's state, or `idle` when you aren't in any voice channel. The position is only sent on
 * state changes, so the clock runs locally in between.
 */
export function PlayerProvider({ children }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [idle, setIdle] = useState(false);
  const [status, setStatus] = useState('connecting');
  const anchor = useRef({ position: 0, at: Date.now(), running: false });

  useEffect(() => {
    let ws;
    let retry;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setStatus('live');
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'idle') {
          setIdle(true);
          setState(null);
          return;
        }
        if (msg.type !== 'state') return;
        anchor.current = {
          position: msg.position,
          at: Date.now(),
          running: msg.state.playing && !msg.state.paused && !!msg.state.current,
        };
        setIdle(false);
        setState(msg.state);
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  const guildId = state?.guildId ?? null;

  const getPosition = useCallback(() => {
    const a = anchor.current;
    return a.running ? a.position + (Date.now() - a.at) : a.position;
  }, []);

  const act = useCallback(async (action, body) => {
    if (!guildId) return false;
    try {
      await api.control(guildId, action, body);
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    }
  }, [guildId, toast]);

  const seek = useCallback((position) => {
    anchor.current = { ...anchor.current, position, at: Date.now() };
    return act('seek', { position: Math.round(position) });
  }, [act]);

  const value = useMemo(() => ({ guildId, state, idle, status, getPosition, act, seek }), [guildId, state, idle, status, getPosition, act, seek]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** Interpolated playback position, refreshed ~10x a second. */
export function usePosition(intervalMs = 100) {
  const { getPosition } = usePlayer();
  const [pos, setPos] = useState(getPosition());
  useEffect(() => {
    const id = setInterval(() => setPos(getPosition()), intervalMs);
    return () => clearInterval(id);
  }, [getPosition, intervalMs]);
  return pos;
}
