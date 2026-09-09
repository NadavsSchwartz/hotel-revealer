import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { OfferSort } from './context.ts';

export const SORT_LABELS: Record<OfferSort, string> = {
  price: 'Lowest room rate',
  rating: 'Highest guest rating',
  stars: 'Highest star rating',
  discount: 'Biggest discount',
};
const options = Object.keys(SORT_LABELS) as OfferSort[];

export default function SortSelect({ value, onChange }: { value: OfferSort; onChange: (value: OfferSort) => void }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(options.indexOf(value));
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ above: false, maxHeight: 240 });

  useLayoutEffect(() => {
    if (!open) return;
    const position = (event?: Event) => {
      if (!trigger.current || !menu.current || event?.target === menu.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const below = window.innerHeight - anchor.bottom - 20;
      const above = anchor.top - 20;
      const upwards = below < menu.current.scrollHeight && above > below;
      setLayout({ above: upwards, maxHeight: Math.max(44, Math.min(240, upwards ? above : below)) });
    };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open]);

  useEffect(() => {
    const panel = menu.current;
    const option = panel?.children[activeIndex];
    if (!open || !panel || !(option instanceof HTMLElement)) return;
    const top = option.offsetTop - 7;
    const bottom = option.offsetTop + option.offsetHeight + 7;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }, [open, activeIndex, layout.maxHeight]);

  function select(option: OfferSort) {
    onChange(option);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    if (event.key === 'Tab') {
      if (open) select(options[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) select(options[activeIndex]);
      else { setActiveIndex(options.indexOf(value)); setOpen(true); }
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(open ? Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))) : options.indexOf(value));
      setOpen(true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      setOpen(true);
    } else if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      const start = open ? activeIndex : options.indexOf(value);
      for (let offset = 1; offset <= options.length; offset++) {
        const next = (start + offset) % options.length;
        if (SORT_LABELS[options[next]].toLowerCase().startsWith(event.key.toLowerCase())) {
          setActiveIndex(next);
          setOpen(true);
          break;
        }
      }
    }
  }

  return (
    <div className="sort-control" ref={control} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <span id="offer-sort-label">Sort by</span>
      <div className="sort-select">
        <button ref={trigger} id="offer-sort" type="button" className="sort-trigger" role="combobox"
          aria-labelledby="offer-sort-label" aria-haspopup="listbox" aria-expanded={open}
          aria-controls={open ? 'offer-sort-options' : undefined}
          aria-activedescendant={open ? `sort-option-${options[activeIndex]}` : undefined}
          onKeyDown={handleKeyDown}
          onClick={() => { setActiveIndex(options.indexOf(value)); setOpen(!open); }}>
          {SORT_LABELS[value]}
          <svg className="control-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
        </button>
        {open && <div ref={menu} id="offer-sort-options" className="sort-menu" role="listbox" aria-labelledby="offer-sort-label"
          data-above={layout.above} style={{ maxHeight: layout.maxHeight }}
          onMouseDown={event => event.preventDefault()}>
          {options.map((option, index) => <div key={option} id={`sort-option-${option}`} className="sort-option" role="option"
            aria-selected={option === value} data-active={index === activeIndex}
            onPointerMove={() => setActiveIndex(index)}
            onClick={() => { select(option); trigger.current?.focus(); }}>
            {SORT_LABELS[option]}
            {option === value && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
          </div>)}
        </div>}
      </div>
    </div>
  );
}
