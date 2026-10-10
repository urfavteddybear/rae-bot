import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useToast } from './toast.jsx';

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

/**
 * Keeps a WebSocket open to the bot for one guild and exposes the live state.
 * The bot sends the position only on state changes, so the clock runs locally in between.
 */
export function PlayerProvider({ guildId, children }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const anchor = useRef({ position: 0, at: Date.now(), running: false });

  useEffect(() => {
    let ws;
    let retry;
    let closed = false;
    setState(null);
    setStatus('connecting');

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?guild=${guildId}`);
      ws.onopen = () => setStatus('live');
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'state') return;
        anchor.current = {
          position: msg.position,
          at: Date.now(),
          running: msg.state.playing && !msg.state.paused && !!msg.state.current,
        };
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
  }, [guildId]);

  const getPosition = useCallback(() => {
    const a = anchor.current;
    return a.running ? a.position + (Date.now() - a.at) : a.position;
  }, []);

  const act = useCallback(async (action, body) => {
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

  const value = useMemo(() => ({ guildId, state, status, getPosition, act, seek }), [guildId, state, status, getPosition, act, seek]);
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
