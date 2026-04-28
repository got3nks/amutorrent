/**
 * LogsView Component
 *
 * Displays application logs (structured, level-tagged, filterable) plus the
 * raw client-side log feeds for aMule and qBittorrent (text streams from
 * those daemons; we don't tag them ourselves).
 *
 * Client log sections are generated dynamically from the `logs` capability.
 * To add log support for a new client type, add an entry to CLIENT_LOG_SECTIONS.
 */

import React from 'https://esm.sh/react@18.2.0';

import { LOGS_REFRESH_INTERVAL } from '../../utils/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useFontSize } from '../../contexts/FontSizeContext.js';
import {
  MultiSelectPopover, Select, Input,
  ExpandableSearch, MobileFilterButton, MobileFilterSheet,
  FilterCheckboxGroup
} from '../common/index.js';

// Sentinel value for "log records with no source tag" (top-level server.js
// startup calls, raw `logger.log(...)`, etc.). Lives only in the filter UI;
// the wire format uses `null` for unsourced records.
const NO_SOURCE = '__none__';

const { createElement: h, useRef, useEffect, useCallback, useState, useMemo } = React;

/**
 * Client log section configs keyed by client type.
 * Each type can define multiple sections (e.g. aMule has logs + server info).
 * Only types with connected instances having the `logs` capability are shown.
 */
const CLIENT_LOG_SECTIONS = {
  qbittorrent: [
    { key: 'qbittorrentLogs', title: 'qBittorrent Logs', dataKey: 'dataQbittorrentLogs', loadedKey: 'qbittorrentLogs', fetchKey: 'fetchQbittorrentLogs' }
  ],
  amule: [
    { key: 'logs', title: 'aMule Logs', dataKey: 'dataLogs', loadedKey: 'logs', fetchKey: 'fetchLogs' },
    { key: 'serverInfo', title: 'ED2K Server Info', dataKey: 'dataServerInfo', loadedKey: 'serverInfo', fetchKey: 'fetchServerInfo' }
  ]
};

// Severity ordering used for the "minimum level" filter — records at or
// above this level (i.e. lower index = more severe) are shown.
const LEVEL_ORDER = ['error', 'warn', 'info', 'debug'];

// Per-level row classes. We tint the background subtly and color the level
// badge prominently; the message text stays readable.
const LEVEL_STYLES = {
  error: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    row: 'bg-red-50/40 dark:bg-red-900/10',
    text: 'text-red-700 dark:text-red-300'
  },
  warn: {
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    row: 'bg-amber-50/40 dark:bg-amber-900/10',
    text: 'text-amber-800 dark:text-amber-300'
  },
  info: {
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    row: '',
    text: 'text-gray-800 dark:text-gray-200'
  },
  debug: {
    badge: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500',
    row: '',
    text: 'text-gray-500 dark:text-gray-500'
  }
};

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');

// Compact HH:MM:SS.mmm timestamp in the browser's local timezone — the row's
// `title` attribute carries the full local datetime so hovering reveals the
// date too (server stores UTC ISO; we just render it in the user's TZ).
const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  } catch {
    return iso;
  }
};

const formatFullLocal = (iso) => {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
  } catch {
    return iso;
  }
};

/**
 * Reusable raw-text log section with auto-scroll behavior.
 * Used for aMule / qBittorrent client logs which come as opaque strings.
 */
const LogSection = ({ title, data, loaded, maxHeightClass, instances, hasMulti, selectedInstance, onInstanceChange, fontSize }) => {
  const ref = useRef(null);
  const userScrolledAway = useRef(false);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const el = ref.current;
    userScrolledAway.current = el.scrollHeight - el.scrollTop - el.clientHeight > 30;
  }, []);

  useEffect(() => {
    if (ref.current && loaded && !userScrolledAway.current) {
      const timeoutId = setTimeout(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [data, loaded, fontSize]);

  return h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
    h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2' },
      title,
      hasMulti && h('select', {
        value: selectedInstance || '',
        onChange: (e) => onInstanceChange(e.target.value),
        className: 'text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 font-normal'
      }, instances.map(inst => h('option', { key: inst.id, value: inst.id }, inst.name)))
    ),
    h('div', {
      ref,
      onScroll: handleScroll,
      className: `bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 ${maxHeightClass} overflow-y-auto log-text`
    },
      (!loaded && !data)
        ? h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, `Loading ${title.toLowerCase()}...`)
        : (data || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, `No ${title.toLowerCase()} available`))
    )
  );
};

/**
 * App-log section: structured records with level / source / search filters.
 *
 * Filtering is done client-side against the records prop — the server already
 * sends a bounded slice (last ~1000) so this is cheap, and changing filters
 * is instant with no roundtrip.
 */
// Level options shared between desktop Select and the mobile filter sheet.
// Desktop uses long labels (room to breathe); mobile shows the short ones.
const LEVEL_OPTIONS = [
  { value: 'error', label: 'Errors only', short: 'Errors' },
  { value: 'warn', label: 'Warnings & errors', short: 'Warnings' },
  { value: 'info', label: 'Info & above', short: 'Info' },
  { value: 'debug', label: 'All (debug)', short: 'Debug' }
];

const AppLogSection = ({ records, sources, instances, loaded, maxHeightClass, fontSize }) => {
  const ref = useRef(null);
  const userScrolledAway = useRef(false);

  // Default to "info & above" — debug entries are high-volume trace breadcrumbs
  // (per-request HTTP, per-message WS) intended for targeted investigation;
  // showing them by default would drown out the signal.
  const [minLevel, setMinLevel] = useState('info');
  // Multi-select source filter — empty array means "all sources" (no filter
  // applied). Selected values use OR semantics, matching the tracker filter
  // pattern in the Downloads view.
  const [sourceFilters, setSourceFilters] = useState([]);
  const [search, setSearch] = useState('');

  // Mobile filter sheet — pending state holds the user's edits until they
  // tap Apply (matches the Downloads/Shared pattern). On open we copy the
  // committed values; on apply we commit pending → state and close.
  const [showSheet, setShowSheet] = useState(false);
  const [pendingMinLevel, setPendingMinLevel] = useState(minLevel);
  const [pendingSources, setPendingSources] = useState(sourceFilters);

  const openSheet = useCallback(() => {
    setPendingMinLevel(minLevel);
    setPendingSources([...sourceFilters]);
    setShowSheet(true);
  }, [minLevel, sourceFilters]);

  const applySheet = useCallback(() => {
    setMinLevel(pendingMinLevel);
    setSourceFilters(pendingSources);
    setShowSheet(false);
  }, [pendingMinLevel, pendingSources]);

  const clearSheet = useCallback(() => {
    setPendingMinLevel('info');
    setPendingSources([]);
  }, []);

  const togglePendingSource = useCallback((value) => {
    setPendingSources(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);

  // Active filter count for the mobile button badge — counts non-default
  // level (anything other than 'info') and each selected source.
  const mobileActiveFilterCount = (minLevel !== 'info' ? 1 : 0) + sourceFilters.length;

  const toggleSource = useCallback((value) => {
    setSourceFilters(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);
  const clearSources = useCallback(() => setSourceFilters([]), []);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const el = ref.current;
    userScrolledAway.current = el.scrollHeight - el.scrollTop - el.clientHeight > 30;
  }, []);

  const minLevelIdx = LEVEL_ORDER.indexOf(minLevel);

  const filteredRecords = useMemo(() => {
    if (!Array.isArray(records)) return [];
    const needle = search.trim().toLowerCase();
    const sourceSet = sourceFilters.length > 0 ? new Set(sourceFilters) : null;
    return records.filter(r => {
      const lvlIdx = LEVEL_ORDER.indexOf(r.level);
      if (lvlIdx === -1 || lvlIdx > minLevelIdx) return false;
      if (sourceSet) {
        // Map record's null source onto the NO_SOURCE sentinel for membership check.
        const key = r.source ?? NO_SOURCE;
        if (!sourceSet.has(key)) return false;
      }
      if (needle && !r.message.toLowerCase().includes(needle)
        && !(r.source || '').toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [records, minLevel, minLevelIdx, sourceFilters, search]);

  // Auto-scroll to bottom when new records arrive (unless user scrolled away)
  useEffect(() => {
    if (ref.current && loaded && !userScrolledAway.current) {
      const timeoutId = setTimeout(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [filteredRecords, loaded, fontSize]);

  // Source options for the multi-select. Sources are grouped semantically:
  //   1. `(server)` — unsourced records (top-level server.js, raw logger.log)
  //   2. Client instances — sources matching a configured instance ID (data-driven
  //      from the backend `instances` map, so adding a new client type requires
  //      no UI change here)
  //   3. WS user sessions — `<ip>(user, nick)` produced by createClientLog
  //   4. Modules — everything else (NotificationManager, AuthManager, etc.)
  const sourceOptions = useMemo(() => {
    if (!Array.isArray(sources) || sources.length === 0) return [];
    const instanceIds = new Set(Object.keys(instances || {}));
    const USER_SESSION = /\(.+,\s*.+\)/;

    const instanceSources = [];
    const userSessions = [];
    const moduleSources = [];
    for (const s of sources) {
      if (s === null) continue;
      if (instanceIds.has(s)) instanceSources.push(s);
      else if (USER_SESSION.test(s)) userSessions.push(s);
      else moduleSources.push(s);
    }
    instanceSources.sort();
    userSessions.sort();
    moduleSources.sort();

    const opts = [];
    if (sources.includes(null)) opts.push({ value: NO_SOURCE, label: '(server)' });
    for (const s of instanceSources) opts.push({ value: s, label: s });
    for (const s of userSessions) opts.push({ value: s, label: s });
    for (const s of moduleSources) opts.push({ value: s, label: s });
    return opts;
  }, [sources, instances]);

  const countLabel = Array.isArray(records) && records.length !== filteredRecords.length
    ? `${filteredRecords.length}/${records.length}`
    : `${filteredRecords.length}`;

  return h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },

    // Mobile filter row (xl:hidden) — uses the same patterns as Downloads/
    // Shared mobile headers: an ExpandableSearch + MobileFilterButton open
    // a bottom sheet with level radio + source checkboxes. Saves the bulk
    // of the horizontal width when search isn't active.
    h('div', { className: 'xl:hidden flex items-center gap-2 mb-2' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200' }, 'App Logs'),
      h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, countLabel),
      h('div', { className: 'flex-1' }),
      h(ExpandableSearch, {
        value: search,
        onChange: setSearch,
        onClear: () => setSearch(''),
        placeholder: 'Search logs…',
        hiddenWhenExpanded: h(MobileFilterButton, {
          onClick: openSheet,
          activeCount: mobileActiveFilterCount
        })
      })
    ),

    // Desktop filter row (xl:flex) — inline level + source + search + count.
    h('div', { className: 'hidden xl:flex flex-wrap items-center gap-2 mb-2' },
      h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mr-auto' }, 'App Logs'),
      h(Select, {
        value: minLevel,
        onChange: (e) => setMinLevel(e.target.value),
        title: 'Minimum severity',
        options: LEVEL_OPTIONS
      }),
      h(MultiSelectPopover, {
        values: sourceFilters,
        onToggle: toggleSource,
        onClear: clearSources,
        options: sourceOptions,
        triggerLabel: 'All sources',
        pluralUnit: 'sources',
        emptyMessage: 'No sources yet',
        widthClass: 'w-64',
        triggerClassName: 'min-w-[8rem] max-w-[14rem]',
        title: 'Filter by source'
      }),
      h(Input, {
        type: 'text',
        value: search,
        onChange: (e) => setSearch(e.target.value),
        placeholder: 'Search…',
        className: 'w-40'
      }),
      h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 ml-1' }, countLabel)
    ),

    h('div', {
      ref,
      onScroll: handleScroll,
      className: `bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 ${maxHeightClass} overflow-y-auto font-mono text-xs`
    },
      (!loaded && !records?.length)
        ? h('div', { className: 'p-3 text-gray-400 dark:text-gray-500 italic' }, 'Loading app logs…')
        : filteredRecords.length === 0
          ? h('div', { className: 'p-3 text-gray-400 dark:text-gray-500 italic' },
              records?.length ? 'No records match the current filters' : 'No app logs available')
          : filteredRecords.map((r, i) => {
              const styles = LEVEL_STYLES[r.level] || LEVEL_STYLES.info;
              return h('div', {
                key: `${r.ts}-${i}`,
                className: `relative px-2 py-1 border-b border-gray-100 dark:border-gray-700/40 ${styles.row}`,
                title: formatFullLocal(r.ts)
              },
                // Top line: level badge + source. Timestamp is absolute-
                // positioned in the top-right so it doesn't push the badge
                // around on narrow screens.
                h('div', { className: 'flex items-baseline gap-2 pr-16' },
                  h('span', {
                    className: `inline-block px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${styles.badge}`
                  }, r.level),
                  r.source && h('span', {
                    className: 'text-gray-500 dark:text-gray-400 truncate text-[11px]',
                    title: r.source
                  }, `[${r.source}]`)
                ),
                h('span', {
                  className: 'absolute top-1 right-2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums select-none'
                }, formatTime(r.ts)),
                h('div', {
                  className: `mt-0.5 whitespace-pre-wrap break-words ${styles.text}`
                }, r.message)
              );
            })
    ),

    // Mobile filter sheet — only mounts when shown. Replaces the legacy
    // inline filters with a focused full-width edit surface that's easier
    // to use on a phone.
    h(MobileFilterSheet, {
      show: showSheet,
      onClose: () => setShowSheet(false),
      onApply: applySheet,
      onClear: clearSheet,
      title: 'Filter logs',
      children: h('div', { className: 'space-y-4' },
        // Level: short-label radio group (single-select)
        h('div', null,
          h('h4', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2' }, 'Minimum level'),
          h('div', { className: 'space-y-2' },
            LEVEL_OPTIONS.map(opt =>
              h('label', {
                key: opt.value,
                className: 'flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'
              },
                h('input', {
                  type: 'radio',
                  name: 'minLevel',
                  checked: pendingMinLevel === opt.value,
                  onChange: () => setPendingMinLevel(opt.value),
                  className: 'w-4 h-4 text-blue-600 border-gray-300'
                }),
                opt.short
              )
            )
          )
        ),
        // Source: multi-select checkbox list
        h(FilterCheckboxGroup, {
          title: 'Sources',
          options: sourceOptions,
          selectedValues: pendingSources,
          onToggle: togglePendingSource,
          className: 'mt-4'
        })
      )
    })
  );
};

/**
 * Logs view component
 */
const LogsView = () => {
  const { dataLogs, dataServerInfo, dataAppLogs, dataAppLogSources, dataQbittorrentLogs, dataLoaded, instances } = useStaticData();
  const { fetchLogs, fetchServerInfo, fetchAppLogs, fetchQbittorrentLogs } = useDataFetch();
  const { fontSize } = useFontSize();

  // Lookup tables for dynamic access by config keys
  const dataByKey = { dataLogs, dataServerInfo, dataQbittorrentLogs };
  const fetchByKey = useMemo(
    () => ({ fetchLogs, fetchServerInfo, fetchQbittorrentLogs }),
    [fetchLogs, fetchServerInfo, fetchQbittorrentLogs]
  );

  // Group connected log-capable instances by type (capability-driven)
  const logInstanceGroups = useMemo(() => {
    const groups = {};
    for (const [id, inst] of Object.entries(instances)) {
      if (!inst.connected || !inst.capabilities?.logs) continue;
      if (!groups[inst.type]) groups[inst.type] = [];
      groups[inst.type].push({ id, name: inst.name });
    }
    return groups;
  }, [instances]);

  const hasClientLogs = Object.keys(logInstanceGroups).length > 0;

  // Per-type selected instance state
  const [selectedInstances, setSelectedInstances] = useState({});
  const setSelectedInstance = useCallback((type, id) => {
    setSelectedInstances(prev => ({ ...prev, [type]: id }));
  }, []);

  // Compute effective instance per type (validates selection, falls back to first)
  const getEffectiveInstance = useCallback((type) => {
    const insts = logInstanceGroups[type] || [];
    const selected = selectedInstances[type];
    return (selected && insts.some(i => i.id === selected)) ? selected : insts[0]?.id || null;
  }, [logInstanceGroups, selectedInstances]);

  // Build active client sections from config + capabilities
  const activeSections = useMemo(() => {
    const sections = [];
    for (const [type, configs] of Object.entries(CLIENT_LOG_SECTIONS)) {
      const insts = logInstanceGroups[type];
      if (!insts?.length) continue;
      for (const config of configs) {
        sections.push({ ...config, type, instances: insts, hasMulti: insts.length > 1 });
      }
    }
    return sections;
  }, [logInstanceGroups]);

  // Fetch all logs on mount and auto-refresh
  useEffect(() => {
    const doFetch = () => {
      for (const section of activeSections) {
        const instanceId = getEffectiveInstance(section.type);
        fetchByKey[section.fetchKey]?.(instanceId);
      }
      fetchAppLogs();
    };
    doFetch();
    const intervalId = setInterval(doFetch, LOGS_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [activeSections, getEffectiveInstance, fetchByKey, fetchAppLogs]);

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // App Logs (always shown, expands when no client logs exist)
    h(AppLogSection, {
      records: dataAppLogs,
      sources: dataAppLogSources,
      instances,
      loaded: dataLoaded.appLogs,
      maxHeightClass: hasClientLogs ? 'max-h-48 sm:max-h-96' : 'max-h-[calc(100vh-16rem)]',
      fontSize
    }),

    // Client log sections (raw text from external daemons)
    ...activeSections.map(section =>
      h(LogSection, {
        key: section.key,
        title: section.title,
        data: dataByKey[section.dataKey],
        loaded: dataLoaded[section.loadedKey],
        maxHeightClass: 'max-h-48',
        instances: section.instances,
        hasMulti: section.hasMulti,
        selectedInstance: getEffectiveInstance(section.type),
        onInstanceChange: (id) => setSelectedInstance(section.type, id),
        fontSize
      })
    )
  );
};

export default LogsView;
