/**
 * TrackerMultiSelect Component
 *
 * Tracker-flavored multi-select: thin wrapper around `MultiSelectPopover`
 * that injects a favicon decoration per option and customizes the
 * single-selected trigger to show favicon + hostname.
 *
 * API mirrors the array-based `useTrackerFilter` state:
 *   - `values`: array of selected hostnames (empty = "all trackers")
 *   - `onToggle(host)`: called when a row is toggled
 *   - `onClear()`: called when the "Clear" action is pressed
 *   - `options`: [{ value, label }] — typically from useTrackerFilter.trackerOptions
 */

import React from 'https://esm.sh/react@18.2.0';
import Icon from './Icon.js';
import MultiSelectPopover from './MultiSelectPopover.js';
import { trackerFaviconUrl } from '../../utils/index.js';

const { createElement: h, useState, useEffect } = React;

/**
 * Tracker favicon — falls back to a generic `server` icon when no favicon
 * is reachable. Self-resets on host change so the same `<img>` slot can be
 * reused across renders without leaking the "broken" state from one tracker
 * to the next.
 */
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
  // Decorate each option with its favicon (skip the synthetic "no tracker"
  // sentinel — there's no host to look up).
  const decoratedOptions = options.map(opt => ({
    ...opt,
    decoration: opt.value === 'none' ? null : h(Favicon, { host: opt.value, size: 14 })
  }));

  return h(MultiSelectPopover, {
    values,
    onToggle,
    onClear,
    options: decoratedOptions,
    triggerLabel: 'All trackers',
    pluralUnit: 'trackers',
    triggerIcon: 'server',
    emptyMessage: 'No trackers available',
    title: title || 'Filter by tracker',
    disabled,
    // Single-selected trigger: favicon + hostname (or "(no tracker)" sentinel)
    renderSingleTrigger: (opt) => {
      const isNone = opt.value === 'none';
      const label = isNone ? '(no tracker)' : opt.value;
      return h('span', { className: 'flex items-center gap-1.5 min-w-0' },
        !isNone && h(Favicon, { host: opt.value, size: 14 }),
        h('span', { className: 'truncate' }, label)
      );
    }
  });
};

export default TrackerMultiSelect;
