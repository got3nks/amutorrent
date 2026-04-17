/**
 * TrackerMultiSelect Component
 *
 * Custom multi-select dropdown for tracker filtering. Button trigger opens a
 * Portal-rendered popover with a checkbox list where each option shows the
 * tracker's favicon alongside the hostname.
 *
 * API mirrors the new array-based useTrackerFilter state:
 *   - `values`: array of selected hostnames (empty = "all trackers")
 *   - `onToggle(host)`: called when a row is toggled
 *   - `onClear()`: called when the "Clear" action is pressed
 *   - `options`: [{ value, label }] — from useTrackerFilter.trackerOptions
 *
 * The button and popover both share the same size + font as the rest of the
 * filter bar (see BASE_HEIGHT / BASE_TEXT / BASE_ROUNDED in FormControls).
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import Portal from './Portal.js';
import { BASE_HEIGHT } from './FormControls.js';
import { trackerFaviconUrl } from '../../utils/index.js';

const { createElement: h, useState, useEffect, useCallback, useRef, Fragment } = React;

const Favicon = ({ host, size = 14 }) => {
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [host]);
  const src = ok ? trackerFaviconUrl(host) : null;
  if (!src) {
    return h('span', {
      className: 'inline-flex items-center justify-center flex-shrink-0 text-gray-400 dark:text-gray-500',
      style: { width: size, height: size }
    }, h(Icon, { name: 'server', size: size - 2 }));
  }
  return h('img', {
    src,
    alt: '',
    width: size,
    height: size,
    loading: 'lazy',
    onError: () => setOk(false),
    className: 'flex-shrink-0 rounded-sm'
  });
};

const TrackerMultiSelect = ({
  values = [],
  onToggle,
  onClear,
  options = [],
  disabled = false,
  title
}) => {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [popStyle, setPopStyle] = useState({ opacity: 0 });
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    setPopStyle({ opacity: 0 });
    setOpen(true);
  };

  // Position the popover as soon as the DOM node is attached. A ref callback
  // is used instead of useLayoutEffect because the popover lives inside a
  // Portal that mounts its container asynchronously — by the time a normal
  // layout effect would run, popRef.current is still null and we'd miss it.
  const popRefCallback = useCallback((el) => {
    popRef.current = el;
    if (!el || !anchorRect) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const popRect = el.getBoundingClientRect();
    let top = anchorRect.bottom + 4;
    if (top + popRect.height > vh - margin) {
      top = Math.max(margin, anchorRect.top - popRect.height - 4);
    }
    let left = anchorRect.left;
    left = Math.min(left, vw - popRect.width - margin);
    left = Math.max(margin, left);
    setPopStyle({ top, left, opacity: 1 });
  }, [anchorRect]);

  // Outside click + Escape to close. Attach only while open; exclude both the
  // popover AND the trigger button so clicking the trigger again just closes.
  useEffect(() => {
    if (!open) return;
    const handleDocPointerDown = (e) => {
      const t = e.target;
      if (popRef.current && popRef.current.contains(t)) return;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      setOpen(false);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleDocPointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocPointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const count = values.length;

  // Trigger button content
  let triggerContent;
  if (count === 0) {
    triggerContent = h('span', { className: 'text-gray-600 dark:text-gray-300' }, 'All trackers');
  } else if (count === 1) {
    const host = values[0];
    const label = host === 'none' ? '(no tracker)' : host;
    triggerContent = h('span', { className: 'flex items-center gap-1.5 min-w-0' },
      host !== 'none' && h(Favicon, { host, size: 14 }),
      h('span', { className: 'truncate' }, label)
    );
  } else {
    triggerContent = h('span', { className: 'flex items-center gap-1.5' },
      h(Icon, { name: 'server', size: 14, className: 'text-gray-500 dark:text-gray-400' }),
      h('span', null, `${count} trackers`)
    );
  }

  const selectedSet = new Set(values);

  return h(Fragment, null,
    h('button', {
      ref: triggerRef,
      type: 'button',
      onClick: handleToggleOpen,
      disabled,
      title: title || 'Filter by tracker',
      className: `${BASE_HEIGHT} flex items-center gap-2 pl-3 pr-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed min-w-[9rem]`
    },
      h('span', { className: 'flex-1 text-left min-w-0' }, triggerContent),
      h(Icon, {
        name: 'chevronDown',
        size: 14,
        className: `text-gray-500 dark:text-gray-400 flex-shrink-0 transition-transform${open ? ' rotate-180' : ''}`
      })
    ),

    open && h(Portal, null,
      h('div', {
        ref: popRefCallback,
        role: 'listbox',
        style: { position: 'fixed', zIndex: 50, ...popStyle },
        className: 'w-72 max-h-96 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl flex flex-col text-sm'
      },
        h('div', { className: 'flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700' },
          h('span', { className: 'text-xs font-medium text-gray-700 dark:text-gray-300' },
            count === 0 ? 'All trackers' : `${count} selected`
          ),
          count > 0 && h('button', {
            type: 'button',
            onClick: () => onClear?.(),
            className: 'text-xs text-blue-600 dark:text-blue-400 hover:underline'
          }, 'Clear')
        ),

        h('div', { className: 'flex-1 overflow-y-auto py-1' },
          options.length === 0
            ? h('div', { className: 'px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center' }, 'No trackers available')
            : options.map(opt => {
                const checked = selectedSet.has(opt.value);
                const isNone = opt.value === 'none';
                return h('label', {
                  key: opt.value,
                  className: `flex items-center gap-2 px-3 py-1.5 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer${checked ? ' bg-blue-50 dark:bg-blue-900/20' : ''}`
                },
                  h('input', {
                    type: 'checkbox',
                    checked,
                    onChange: () => onToggle?.(opt.value),
                    className: 'w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  }),
                  !isNone && h(Favicon, { host: opt.value, size: 14 }),
                  h('span', { className: 'truncate' }, opt.label)
                );
              })
        )
      )
    )
  );
};

export default TrackerMultiSelect;
