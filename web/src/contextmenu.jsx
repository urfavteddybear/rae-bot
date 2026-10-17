import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ContextMenuContext = createContext(() => {});

/** `open(event, items)` shows a right-click menu for `items` at the pointer. */
export const useContextMenu = () => useContext(ContextMenuContext);

/**
 * Menu items for a song. Only controls the bot's queue when the viewer may control playback; the
 * "open" item works for everyone when there is a link.
 */
export function songMenu({ can, uri, playNow, playNext, add, remove }) {
  const items = [];
  if (can) {
    if (playNow) items.push({ label: 'Play now', onSelect: playNow });
    if (playNext) items.push({ label: 'Play next', onSelect: playNext });
    if (add) items.push({ label: 'Add to queue', onSelect: add });
    if (remove) items.push({ label: 'Remove from queue', danger: true, onSelect: remove });
  }
  if (uri) items.push({ label: 'Open in browser', onSelect: () => window.open(uri, '_blank', 'noopener') });
  return items;
}

function Menu({ x, y, items, onClose }) {
  const box = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu on screen: flip it up or left when it would overflow.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y, items]);

  useEffect(() => {
    const onDown = (e) => { if (!box.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return (
    <div ref={box} className="popover ctx" role="menu" style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={`ctx-item ${item.danger ? 'danger' : ''}`}
          onClick={() => { onClose(); item.onSelect(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    if (!items?.length) return;
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);
  const value = useMemo(() => open, [open]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {menu ? <Menu x={menu.x} y={menu.y} items={menu.items} onClose={close} /> : null}
    </ContextMenuContext.Provider>
  );
}
