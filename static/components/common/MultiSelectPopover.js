/**
 * MultiSelectPopover Component
 *
 * Generic multi-select dropdown — button trigger that opens a Portal-rendered
 * popover with a checkbox list. Selecting nothing means "all". Multiple
 * selections combine with OR semantics; the consumer applies whatever
 * filtering/aggregation the values represent.
 *
 * Used by TrackerMultiSelect (with favicon decorations) and the LogsView
 * source filter (plain text). Designed so that any future "filter by N
 * options with checkboxes" UI can reuse this without forking layout/focus/
 * outside-click handling.
 *
 * Props:
 *   values            string[]                  selected values (empty = "all")
 *   onToggle(value)   fn                        called when a row is toggled
 *   onClear()         fn                        called when Clear is pressed
 *   options           Array<{value, label, decoration?, disabled?}>
 *                                               option list. `decoration` is
 *                                               an optional React node rendered
 *                                               before the label (e.g. favicon).
 *   triggerLabel      string                    text in the trigger when nothing is selected
 *   pluralUnit        string                    text for "N {pluralUnit}" when 2+ are selected
 *   renderSingleTrigger?  fn(option) => node    custom trigger rendering for the 1-selected case
 *                                               (defaults to label, with decoration if present)
 *   emptyMessage?     string                    shown in the popover when options is empty
 *   widthClass?       string                    Tailwind width class for the popover (default 'w-72')
 *   triggerClassName? string                    extra classes to merge into the trigger button
 *   triggerIcon?      string                    Icon name to show in the multi-selected trigger badge
 *   title             string                    button tooltip
 *   disabled          boolean
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import Portal from './Portal.js';
import { BASE_HEIGHT } from './FormControls.js';

const { createElement: h, useState, useEffect, useCallback, useRef, Fragment } = React;

const MultiSelectPopover = ({
  values = [],
  onToggle,
  onClear,
  options = [],
  triggerLabel = 'All',
  pluralUnit = 'items',
  renderSingleTrigger,
  emptyMessage = 'No options available',
  widthClass = 'w-72',
  triggerClassName = 'min-w-[9rem]',
  triggerIcon = null,
  title,
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [popStyle, setPopStyle] = useState({ opacity: 0 });
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchorRect(rect);
    setPopStyle({ opacity: 0 });
    setOpen(true);
  };

  // Position the popover when its DOM node mounts. Uses a ref callback
  // because Portal's container is created asynchronously — a normal
  // useLayoutEffect would fire before popRef.current is populated.
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

  // Outside click + Escape close while open. Excludes both the popover and
  // the trigger so re-clicking the trigger toggles cleanly.
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
  const selectedSet = new Set(values);

  // Trigger content
  let triggerContent;
  if (count === 0) {
    triggerContent = h('span', { className: 'text-gray-600 dark:text-gray-300' }, triggerLabel);
  } else if (count === 1) {
    const opt = options.find(o => o.value === values[0]);
    if (renderSingleTrigger && opt) {
      triggerContent = renderSingleTrigger(opt);
    } else {
      triggerContent = h('span', { className: 'flex items-center gap-1.5 min-w-0' },
        opt?.decoration || null,
        h('span', { className: 'truncate' }, opt?.label ?? values[0])
      );
    }
  } else {
    triggerContent = h('span', { className: 'flex items-center gap-1.5' },
      triggerIcon && h(Icon, { name: triggerIcon, size: 14, className: 'text-gray-500 dark:text-gray-400' }),
      h('span', null, `${count} ${pluralUnit}`)
    );
  }

  return h(Fragment, null,
    h('button', {
      ref: triggerRef,
      type: 'button',
      onClick: handleToggleOpen,
      disabled,
      title,
      className: `${BASE_HEIGHT} flex items-center gap-2 pl-3 pr-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${triggerClassName}`
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
        className: `${widthClass} max-h-96 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl flex flex-col text-sm`
      },
        h('div', { className: 'flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700' },
          h('span', { className: 'text-xs font-medium text-gray-700 dark:text-gray-300' },
            count === 0 ? triggerLabel : `${count} selected`
          ),
          count > 0 && h('button', {
            type: 'button',
            onClick: () => onClear?.(),
            className: 'text-xs text-blue-600 dark:text-blue-400 hover:underline'
          }, 'Clear')
        ),

        h('div', { className: 'flex-1 overflow-y-auto py-1' },
          options.length === 0
            ? h('div', { className: 'px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center' }, emptyMessage)
            : options.map(opt => {
                const checked = selectedSet.has(opt.value);
                return h('label', {
                  key: opt.value,
                  className: `flex items-center gap-2 px-3 py-1.5 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer${checked ? ' bg-blue-50 dark:bg-blue-900/20' : ''}${opt.disabled ? ' opacity-50 cursor-not-allowed' : ''}`
                },
                  h('input', {
                    type: 'checkbox',
                    checked,
                    disabled: opt.disabled,
                    onChange: () => onToggle?.(opt.value),
                    className: 'w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  }),
                  opt.decoration || null,
                  h('span', { className: 'truncate' }, opt.label)
                );
              })
        )
      )
    )
  );
};

export default MultiSelectPopover;
