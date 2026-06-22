/**
 * Footer Component
 *
 * Displays connection status, upload/download speeds, and network statistics
 * Supports multi-instance mode with per-instance status tooltips and speed breakdown
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed, formatBytes, CLIENT_NAMES } from '../../utils/index.js';
import { getStatusBadgeClass, getStatusIcon, getStatusDotClass } from '../../utils/networkStatus.js';
import { useVersion } from '../../contexts/index.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useClientFilter } from '../../contexts/ClientFilterContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import Icon from '../common/Icon.js';
import Tooltip from '../common/Tooltip.js';
import ClientIcon from '../common/ClientIcon.js';

const { createElement: h } = React;

// Status priority for worst-of computation (lower = worse)
const STATUS_PRIORITY = { red: 0, yellow: 1, green: 2 };

// Build the KAD tooltip element: one line per port. Tooltip styles use
// whiteSpace: 'normal' so '\n' in a plain string collapses — we have to
// emit a real element tree to get visual line breaks.
const buildKadTooltip = (ns) => {
  if (!ns || !ns.connected) return null;
  const lines = [];
  if (ns.listenPort) {
    lines.push(h('div', { key: 'udp' }, `UDP ${ns.listenPort}: ${ns.firewalledUdp ? 'Firewalled' : 'OK'}`));
  }
  if (ns.tcpPort) {
    lines.push(h('div', { key: 'tcp' }, `TCP ${ns.tcpPort}: ${ns.firewalledTcp ? 'Firewalled' : 'OK'}`));
  }
  return lines.length > 0 ? h('div', { className: 'space-y-1' }, ...lines) : null;
};

/**
 * Find the status object with worst status from an array
 * @param {Array} statusObjs - Array of objects with .status field ('green'|'yellow'|'red')
 * @returns {object|null} The worst status object, or null if empty
 */
const findWorstStatus = (statusObjs) => {
  if (statusObjs.length === 0) return null;
  return statusObjs.reduce((worst, s) =>
    (STATUS_PRIORITY[s.status] ?? 2) < (STATUS_PRIORITY[worst.status] ?? 2) ? s : worst
  );
};

/**
 * Render a status badge, optionally wrapped in a Tooltip
 */
const renderBadge = (status, text, tooltip) => {
  const badge = h('span', {
    className: `inline-block px-1.5 py-0.5 lg:px-2 lg:py-1 rounded-md text-xs font-medium ${tooltip ? 'cursor-help ' : ''}${getStatusBadgeClass(status)}`
  }, `${getStatusIcon(status)} ${text}`);
  return tooltip ? h(Tooltip, { content: tooltip, position: 'top' }, badge) : badge;
};

/**
 * Footer component
 * Uses useLiveData directly to avoid re-rendering parent (AppContent)
 * @param {string} currentView - Current view name
 * @param {function} onOpenAbout - Open about modal handler
 */
const Footer = ({ currentView, onOpenAbout }) => {
  const { dataStats: stats } = useLiveData();
  const { updateAvailable, latestVersion } = useVersion();
  const { ed2kConnected, bittorrentConnected } = useClientFilter();
  const { instances, hasMultiInstance } = useStaticData();
  if (!stats) {
    return h('footer', { className: 'hidden md:block bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-4 text-center text-sm text-gray-500 dark:text-gray-400' },
      'Loading stats...'
    );
  }

  // --- Compute per-instance status and tooltips from instances metadata ---
  let ed2k, kad;
  let ed2kTooltip = null, kadTooltip = null;
  const disconnected = { status: 'red', text: 'Disconnected', connected: false };

  // Group connected instances by type (dynamic — works for any client type)
  const byType = {};
  for (const [id, inst] of Object.entries(instances)) {
    if (!inst.connected) continue;
    if (!byType[inst.type]) byType[inst.type] = [];
    byType[inst.type].push({ id, ...inst });
  }

  // aMule: worst ED2K and KAD status across instances
  const amuleInsts = byType.amule || [];
  if (amuleInsts.length > 0) {
    const ed2kStatuses = amuleInsts.map(i => i.networkStatus?.ed2k).filter(Boolean);
    const kadStatuses = amuleInsts.map(i => i.networkStatus?.kad).filter(Boolean);

    ed2k = findWorstStatus(ed2kStatuses) || disconnected;
    kad = findWorstStatus(kadStatuses) || disconnected;

    // Multi-instance tooltips (only when 2+ aMule instances)
    if (amuleInsts.length > 1) {
      ed2kTooltip = h('div', { className: 'space-y-1' },
        h('div', { className: 'font-semibold mb-1' }, 'ED2K Status'),
        ...amuleInsts.map(inst => {
          const ns = inst.networkStatus?.ed2k;
          if (!ns) return null;
          const detail = ns.connected && ns.serverName
            ? ` (${ns.serverName}${ns.serverPing ? ` - ${ns.serverPing}ms` : ''})`
            : '';
          const portSuffix = ns.listenPort ? ` · Port ${ns.listenPort}` : '';
          return h('div', { key: inst.id, className: 'flex items-center gap-2' },
            h('div', { className: `w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(ns.status)}` }),
            h('span', null, `${inst.name}: ${ns.text}${detail}${portSuffix}`)
          );
        }).filter(Boolean)
      );

      kadTooltip = h('div', { className: 'space-y-1' },
        h('div', { className: 'font-semibold mb-1' }, 'KAD Status'),
        ...amuleInsts.map(inst => {
          const ns = inst.networkStatus?.kad;
          if (!ns) return null;
          const portDetail = ns.connected && (ns.listenPort || ns.tcpPort)
            ? ` (UDP ${ns.listenPort || '?'}: ${ns.firewalledUdp ? 'Firewalled' : 'OK'} · TCP ${ns.tcpPort || '?'}: ${ns.firewalledTcp ? 'Firewalled' : 'OK'})`
            : '';
          return h('div', { key: inst.id, className: 'flex items-center gap-2' },
            h('div', { className: `w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(ns.status)}` }),
            h('span', null, `${inst.name}: ${ns.text}${portDetail}`)
          );
        }).filter(Boolean)
      );
    }
  } else {
    ed2k = disconnected;
    kad = disconnected;
  }

  // BitTorrent clients: compute worst status per type (dynamic — works for rtorrent, qbittorrent, deluge, etc.)
  const btTypes = Object.keys(byType).filter(t => t !== 'amule').sort();
  const btStatusMap = {};  // { type: { status, tooltip } }
  for (const type of btTypes) {
    const insts = byType[type];
    const statuses = insts.map(i => i.networkStatus).filter(Boolean);
    const worst = findWorstStatus(statuses) || disconnected;
    let tooltip = null;
    if (insts.length > 1) {
      const label = CLIENT_NAMES[type]?.name || type;
      tooltip = h('div', { className: 'space-y-1' },
        h('div', { className: 'font-semibold mb-1' }, `${label} Status`),
        ...insts.map(inst => {
          const ns = inst.networkStatus;
          if (!ns) return null;
          return h('div', { key: inst.id, className: 'flex items-center gap-2' },
            h('div', { className: `w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotClass(ns.status)}` }),
            h('span', null, `${inst.name}: ${ns.text}${ns.listenPort ? ` (Port ${ns.listenPort})` : ''}`)
          );
        }).filter(Boolean)
      );
    }
    btStatusMap[type] = { status: worst, tooltip };
  }

  // --- Speed computation ---
  // Per-instance speeds from backend (keyed by instanceId)
  const instanceSpeeds = stats.instanceSpeeds || {};

  // Sum speeds from all connected instances (filtered by client filter state)
  let totalUploadSpeed = 0;
  let totalDownloadSpeed = 0;
  const connectedInsts = Object.entries(instances)
    .filter(([, i]) => i.connected)
    .map(([id, i]) => ({ id, ...i }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  for (const inst of connectedInsts) {
    const isEnabled = inst.networkType === 'ed2k' ? ed2kConnected : bittorrentConnected;
    if (!isEnabled) continue;
    const speeds = instanceSpeeds[inst.id];
    if (speeds) {
      totalUploadSpeed += speeds.uploadSpeed || 0;
      totalDownloadSpeed += speeds.downloadSpeed || 0;
    }
  }

  // Show speed tooltip when multiple instances or multiple network types connected
  const connectedNetworkTypes = new Set(connectedInsts.map(i => i.networkType));
  const showSpeedTooltip = hasMultiInstance || connectedNetworkTypes.size >= 2;

  // Build speed tooltip content
  const buildSpeedTooltip = (label, speedKey) => {
    if (connectedInsts.length === 0) return null;

    return h('div', { className: 'space-y-1' },
      h('div', { className: 'font-semibold mb-1' }, label),
      ...connectedInsts.map(inst => {
        const speed = instanceSpeeds[inst.id]?.[speedKey] || 0;
        return h('div', { key: inst.id, className: 'flex items-center gap-2' },
          h(ClientIcon, { clientType: inst.type, size: 14 }),
          h('span', null,
            inst.color ? h('span', { style: { color: inst.color } }, inst.name) : inst.name,
            `: ${formatSpeed(speed)}`
          )
        );
      })
    );
  };

  // Footer is hidden on mobile (replaced by MobileNavFooter)
  return h('footer', {
    className: 'hidden md:block bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-1.5 px-2 lg:px-3 flex-none sticky bottom-0 z-40'
  },
    h('div', { className: 'mx-auto' },
      // Desktop view only
      h('div', { className: 'flex justify-between items-center text-xs gap-4' },
        // Left: Connection status (scrollable when many clients configured)
        h('div', { className: 'flex items-center gap-1.5 lg:gap-3 min-w-0 overflow-x-auto flex-nowrap', style: { scrollbarWidth: 'none' } },
          // aMule: ED2K and KAD status (only when an actual aMule instance is
          // connected — other ed2k-networkType clients, e.g. Rucio, render as
          // their own badge below rather than under the ED2K/KAD headers)
          amuleInsts.length > 0 && h(React.Fragment, null,
            h('div', { className: 'flex items-center gap-1.5 flex-shrink-0' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'ED2K:'),
              renderBadge(ed2k.status, ed2k.text, ed2kTooltip || (ed2k.listenPort ? `Port ${ed2k.listenPort}` : null)),
              // Show inline server info only in single-instance mode
              !ed2kTooltip && ed2k.connected && ed2k.serverName && h('span', { className: 'hidden xl:inline text-gray-600 dark:text-gray-400 text-xs' }, `(${ed2k.serverName} - ${ed2k.serverPing}ms)`)
            ),
            h('div', { className: 'flex items-center gap-1.5 flex-shrink-0' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'KAD:'),
              renderBadge(kad.status, kad.text, kadTooltip || buildKadTooltip(kad))
            )
          ),
          // Divider between aMule and other per-client status badges
          amuleInsts.length > 0 && btTypes.length > 0 && h('div', { className: 'w-px h-4 bg-gray-300 dark:bg-gray-600 flex-shrink-0' }),
          // BitTorrent client statuses (dynamic — works for rtorrent, qbittorrent, deluge, etc.)
          ...btTypes.map(type => {
            const { status: st, tooltip } = btStatusMap[type];
            const names = CLIENT_NAMES[type] || { name: type, shortName: type.slice(0, 3) };
            return h('div', { key: type, className: 'flex items-center gap-1.5 flex-shrink-0' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' },
                h('span', { className: 'lg:hidden' }, `${names.shortName}:`),
                h('span', { className: 'hidden lg:inline' }, `${names.name}:`)
              ),
              renderBadge(st.status, st.text, tooltip || (st.listenPort ? `Port ${st.listenPort}` : null))
            );
          })
        ),
        // Right: System indicators + Speeds (fixed, never compressed)
        h('div', { className: 'flex items-center gap-1.5 lg:gap-3 flex-shrink-0' },
          // Update available indicator
          updateAvailable && onOpenAbout && h(Tooltip, {
            content: `Version ${latestVersion} is available`,
            position: 'top'
          },
            h('button', {
              onClick: onOpenAbout,
              className: 'flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors cursor-pointer'
            },
              h(Icon, { name: 'bell', size: 14, className: 'animate-pulse' }),
              h('span', { className: 'hidden lg:inline font-medium' }, 'Update')
            )
          ),
          // Divider after update indicator
          updateAvailable && onOpenAbout && h('div', { className: 'w-px h-4 bg-gray-300 dark:bg-gray-600' }),
          // Disk Space Indicator
          stats.diskSpace && h(Tooltip, {
            content: h('div', { className: 'space-y-1 text-right' },
              h('div', { className: 'font-semibold mb-1' }, 'Disk Usage'),
              h('div', {}, `Total: ${formatBytes(stats.diskSpace.total)}`),
              h('div', {}, `Used: ${formatBytes(stats.diskSpace.used)}`),
              h('div', {}, `Free: ${formatBytes(stats.diskSpace.free)}`),
              h('div', {}, `Usage: ${stats.diskSpace.percentUsed}%`)
            ),
            position: 'top'
          },
            h('div', { className: 'flex items-center gap-1 lg:gap-2 cursor-help' },
              h(Icon, { name: 'harddrive', size: 16, className: 'text-gray-600 dark:text-gray-400' }),
              h('div', { className: 'relative w-16 xl:w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden' },
                h('div', {
                  className: `h-full transition-all ${
                    stats.diskSpace.percentUsed >= 85
                      ? 'bg-red-500'
                      : stats.diskSpace.percentUsed >= 65
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                  }`,
                  style: { width: `${stats.diskSpace.percentUsed}%` }
                }),
                h('span', {
                  className: 'absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-800 dark:text-white [text-shadow:0_0_2px_rgba(255,255,255,0.8)] dark:[text-shadow:0_0_2px_rgba(0,0,0,0.8)]'
                },
                  `${stats.diskSpace.percentUsed}%`
                )
              )
            )
          ),
          // CPU Usage Indicator
          stats.cpuUsage && h('div', { className: 'flex items-center gap-1 lg:gap-2' },
            h(Icon, { name: 'cpu', size: 16, className: 'text-gray-600 dark:text-gray-400' }),
            h('div', { className: 'relative w-16 xl:w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden' },
              h('div', {
                className: `h-full transition-all ${
                  stats.cpuUsage.percent >= 85
                    ? 'bg-red-500'
                    : stats.cpuUsage.percent >= 65
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`,
                style: { width: `${stats.cpuUsage.percent}%` }
              }),
              h('span', {
                className: 'absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-800 dark:text-white [text-shadow:0_0_2px_rgba(255,255,255,0.8)] dark:[text-shadow:0_0_2px_rgba(0,0,0,0.8)]'
              },
                `${stats.cpuUsage.percent}%`
              )
            )
          ),
          // Vertical divider (only show if disk or CPU indicators are visible)
          (stats.diskSpace || stats.cpuUsage) && h('div', { className: 'w-px h-4 bg-gray-300 dark:bg-gray-600' }),
          // Upload speed
          showSpeedTooltip
            ? h(Tooltip, {
                content: buildSpeedTooltip('Upload Speed', 'uploadSpeed'),
                position: 'top'
              },
                h('div', { className: 'flex items-center gap-1 lg:gap-2 cursor-help' },
                  h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' },
                    h('span', { className: 'hidden lg:inline' }, 'Upload '),
                    '↑'
                  ),
                  h('span', { className: 'text-green-600 dark:text-green-400 font-mono font-semibold' }, formatSpeed(totalUploadSpeed))
                )
              )
            : h('div', { className: 'flex items-center gap-1 lg:gap-2' },
                h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' },
                  h('span', { className: 'hidden lg:inline' }, 'Upload '),
                  '↑'
                ),
                h('span', { className: 'text-green-600 dark:text-green-400 font-mono font-semibold' }, formatSpeed(totalUploadSpeed))
              ),
          // Download speed
          showSpeedTooltip
            ? h(Tooltip, {
                content: buildSpeedTooltip('Download Speed', 'downloadSpeed'),
                position: 'top'
              },
                h('div', { className: 'flex items-center gap-1 lg:gap-2 cursor-help' },
                  h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' },
                    h('span', { className: 'hidden lg:inline' }, 'Download '),
                    '↓'
                  ),
                  h('span', { className: 'text-blue-600 dark:text-blue-400 font-mono font-semibold' }, formatSpeed(totalDownloadSpeed))
                )
              )
            : h('div', { className: 'flex items-center gap-1 lg:gap-2' },
                h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' },
                  h('span', { className: 'hidden lg:inline' }, 'Download '),
                  '↓'
                ),
                h('span', { className: 'text-blue-600 dark:text-blue-400 font-mono font-semibold' }, formatSpeed(totalDownloadSpeed))
              )
        )
      )
    )
  );
};

// Memoize to prevent re-renders when parent context changes but props don't
export default React.memo(Footer);
