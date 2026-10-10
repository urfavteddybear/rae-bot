import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * A glass pill of options with a thumb that glides to the selected one.
 * Items are buttons (pass onSelect) or links (give an item a `to`). `value` may match no item,
 * in which case the thumb fades out.
 */
export function Segmented({ items, value, onSelect, className = '', ariaLabel, tabs = false }) {
  const box = useRef(null);
  const refs = useRef({});
  const [thumb, setThumb] = useState({ left: 0, width: 0, visible: false });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (!el) { setThumb((t) => (t.visible ? { ...t, visible: false } : t)); return; }
      setThumb((t) => (t.left === el.offsetLeft && t.width === el.offsetWidth && t.visible ? t : { left: el.offsetLeft, width: el.offsetWidth, visible: true }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [value, items]);

  // Skip the glide on first paint so the thumb doesn't fly in from the corner.
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div ref={box} className={`seg ${ready ? 'ready' : ''} ${className}`} role={tabs ? 'tablist' : undefined} aria-label={ariaLabel}>
      <span
        className={`seg-thumb ${thumb.visible ? 'visible' : ''}`}
        style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        aria-hidden="true"
      />
      {items.map(({ id, label, icon: Icon, to }) => {
        const active = id === value;
        const content = <>{Icon ? <Icon size={16} /> : null}{label}</>;
        const common = { ref: (el) => { refs.current[id] = el; }, className: `seg-item ${active ? 'active' : ''}` };
        return to ? (
          <Link key={id} to={to} aria-current={active ? 'page' : undefined} {...common}>{content}</Link>
        ) : (
          <button key={id} type="button" role={tabs ? 'tab' : undefined} aria-selected={tabs ? active : undefined} onClick={() => onSelect?.(id)} {...common}>{content}</button>
        );
      })}
    </div>
  );
}
