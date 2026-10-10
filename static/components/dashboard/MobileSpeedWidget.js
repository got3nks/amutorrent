/**
 * MobileSpeedWidget Component
 *
 * Compact speed chart with current speeds and network status for mobile view
 * Shows 24h speed history with simplified data points for performance
 * Supports switching between aMule and BitTorrent (rTorrent + qBittorrent) when both are active
 * Multi-instance mode: per-instance network status dots with instance names
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/index.js';
import { loadChartJs } from '../../utils/chartLoader.js';
import { getStatusDotClass } from '../../utils/networkStatus.js';
import { NETWORK_ORDER, NETWORK_NAMES } from '../../utils/constants.js';
import ClientIcon from '../common/ClientIcon.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';

const { createElement: h, useEffect, useRef, useState } = React;

/**
 * Downsample data for mobile performance
 * 288 points = 1 data point every 5 minutes for 24 hours
 * @param {Array} data - Original data array
 * @param {string} networkType - 'ed2k' or 'bittorrent'
 * @param {number} targetPoints - Target number of data points
 * @returns {Array} Downsampled data
 */
const downsampleData = (data, networkType, targetPoints = 288) => {
  if (!data || data.length <= targetPoints) return data;

  const uploadKey = `${networkType}UploadSpeed`;
  const downloadKey = `${networkType}DownloadSpeed`;

  const step = Math.ceil(data.length / targetPoints);
  const result = [];

  for (let i = 0; i < data.length; i += step) {
    // Take the max value in each bucket to preserve peaks
    const bucket = data.slice(i, Math.min(i + step, data.length));
    const maxUpload = Math.max(...bucket.map(d => d[uploadKey] || 0));
    const maxDownload = Math.max(...bucket.map(d => d[downloadKey] || 0));
    result.push({
      timestamp: bucket[Math.floor(bucket.length / 2)].timestamp,
      uploadSpeed: maxUpload,
      downloadSpeed: maxDownload
    });
  }

  return result;
};


/**
 * MobileSpeedWidget component
 * @param {object} speedData - Speed history data from API
 * @param {object} stats - Current stats from WebSocket
 * @param {string} theme - Current theme (dark/light)
 */
const MobileSpeedWidget = ({ speedData, stats, theme }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const chartInstance = useRef(null);
  const [chartReady, setChartReady] = useState(false);

  // Crosshair hover state — ref for sync plugin access, state for React render
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const hoveredIndexRef = useRef(null);
  const sampledDataRef = useRef([]);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Chart.js plugin: vertical crosshair line at hover/touch position
  const crosshairPluginRef = useRef({
    id: 'crosshair',
    afterEvent(chart, args) {
      const event = args.event;
      if (event.type === 'mouseout' || event.type === 'touchend') {
        if (hoveredIndexRef.current !== null) {
          hoveredIndexRef.current = null;
          setHoveredIndex(null);
          args.changed = true;
        }
        return;
      }
      const elements = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, false);
      const newIndex = elements.length > 0 ? elements[0].index : null;
      if (newIndex !== hoveredIndexRef.current) {
        hoveredIndexRef.current = newIndex;
        setHoveredIndex(newIndex);
        args.changed = true;
      }
    },
    afterDraw(chart) {
      const index = hoveredIndexRef.current;
      if (index == null) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[index]) return;
      const x = meta.data[index].x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = themeRef.current === 'dark'
        ? 'rgba(209, 213, 219, 0.5)'
        : 'rgba(107, 114, 128, 0.5)';
      ctx.stroke();
      ctx.restore();
    }
  });

  const { instances } = useStaticData();

  // Connected network types, in display order (aMule / Rucio / BitTorrent / ...)
  const connectedNetworks = NETWORK_ORDER.filter(nt =>
    Object.values(instances).some(i => i.connected && i.networkType === nt)
  );
  const connectedKey = connectedNetworks.join(',');
  // Show the network toggle when more than one network is connected.
  const showNetworkToggle = connectedNetworks.length > 1;

  // Selected network for the chart; defaults to the first connected one.
  const [selectedNetwork, setSelectedNetwork] = useState(connectedNetworks[0] || 'ed2k');

  // Keep the selection valid as connections change.
  useEffect(() => {
    if (connectedNetworks.length && !connectedNetworks.includes(selectedNetwork)) {
      setSelectedNetwork(connectedNetworks[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey, selectedNetwork]);

  // Load Chart.js library on mount
  useEffect(() => {
    loadChartJs().then(() => {
      setChartReady(true);
    }).catch(err => {
      console.error('Failed to load Chart.js:', err);
    });
  }, []);

  // Create and update chart
  useEffect(() => {
    if (!chartReady || !canvasRef.current || !window.Chart || !speedData?.data) return;

    // Downsample data - 288 points max (1 per 5 mins for 24h)
    const sampledData = downsampleData(speedData.data, selectedNetwork, 288);
    sampledDataRef.current = sampledData;

    const labels = sampledData.map(d => {
      const date = new Date(d.timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    });

    const uploadData = sampledData.map(d => d.uploadSpeed || 0);
    const downloadData = sampledData.map(d => d.downloadSpeed || 0);

    // If chart exists, update data
    if (chartInstance.current) {
      chartInstance.current.data.labels = labels;
      chartInstance.current.data.datasets[0].data = uploadData;
      chartInstance.current.data.datasets[1].data = downloadData;
      chartInstance.current.update('none');
      return;
    }

    // Creating a new chart — clear any stale hover state
    hoveredIndexRef.current = null;
    setHoveredIndex(null);

    // Create new chart
    const ctx = canvasRef.current.getContext('2d');

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Upload',
            data: uploadData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderWidth: 1.5,
            tension: 0.3,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Download',
            data: downloadData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderWidth: 1.5,
            tension: 0.3,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        events: ['mousemove', 'mouseout', 'touchstart', 'touchmove', 'touchend'],
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false, beginAtZero: true }
        }
      },
      plugins: [crosshairPluginRef.current]
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [chartReady, speedData, theme, selectedNetwork]);

  // ResizeObserver to handle container size changes
  useEffect(() => {
    if (!containerRef.current || !chartInstance.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [chartReady, speedData, theme, selectedNetwork]);

  // --- Network status section ---
  // Always read from instances[id].networkStatus (backend-computed)
  let networkStatus;

  const tabInstances = Object.entries(instances)
    .filter(([, i]) => i.connected && i.networkType === selectedNetwork)
    .map(([id, i]) => ({ id, ...i }));

  if (selectedNetwork === 'ed2k') {
    if (tabInstances.length === 1) {
      // Single aMule: show ED2K and KAD separately
      const inst = tabInstances[0];
      const ed2kNs = inst.networkStatus?.ed2k;
      const kadNs = inst.networkStatus?.kad;
      networkStatus = h(React.Fragment, null,
        ed2kNs && h('div', { className: 'flex items-center gap-1.5' },
          h('div', { className: `w-2 h-2 rounded-full ${getStatusDotClass(ed2kNs.status)}` }),
          h('span', { className: 'text-xs font-medium text-gray-600 dark:text-gray-400' },
            `ED2K: ${ed2kNs.text}`
          )
        ),
        kadNs && h('div', { className: 'flex items-center gap-1.5' },
          h('div', { className: `w-2 h-2 rounded-full ${getStatusDotClass(kadNs.status)}` }),
          h('span', { className: 'text-xs font-medium text-gray-600 dark:text-gray-400' },
            `KAD: ${kadNs.text}`
          )
        )
      );
    } else {
      // Multi aMule: per-instance combined ED2K/KAD
      networkStatus = h(React.Fragment, null,
        ...tabInstances.map(inst => {
          const ed2kNs = inst.networkStatus?.ed2k;
          const kadNs = inst.networkStatus?.kad;
          if (!ed2kNs && !kadNs) return null;

          const ed2kText = ed2kNs ? `${ed2kNs.text}` : '?';
          const kadText = kadNs ? `${kadNs.text}` : '?';
          // Use worst of ED2K/KAD for the dot color
          const worstStatus = ed2kNs && kadNs
            ? (ed2kNs.status === 'red' || kadNs.status === 'red' ? 'red'
              : ed2kNs.status === 'yellow' || kadNs.status === 'yellow' ? 'yellow' : 'green')
            : (ed2kNs?.status || kadNs?.status || 'red');

          return h('div', { key: inst.id, className: 'flex items-center gap-1.5' },
            h('div', { className: `w-2 h-2 rounded-full ${getStatusDotClass(worstStatus)}` }),
            h('span', { className: 'text-xs font-medium text-gray-600 dark:text-gray-400' },
              `${inst.name}: ${ed2kText} / ${kadText}`
            )
          );
        }).filter(Boolean)
      );
    }
  } else {
    // BitTorrent: per-instance status
    networkStatus = h(React.Fragment, null,
      ...tabInstances.map(inst => {
        const ns = inst.networkStatus;
        if (!ns) return null;
        return h('div', { key: inst.id, className: 'flex items-center gap-1.5' },
          h('div', { className: `w-2 h-2 rounded-full ${getStatusDotClass(ns.status)}` }),
          h('span', { className: 'text-xs font-medium text-gray-600 dark:text-gray-400' },
            `${inst.name}: ${ns.text}`
          )
        );
      }).filter(Boolean)
    );
  }

  // Current speeds computed from per-instance speeds
  const instanceSpeeds = stats?.instanceSpeeds || {};
  let uploadSpeed = 0;
  let downloadSpeed = 0;
  for (const [id, inst] of Object.entries(instances)) {
    if (inst.connected && inst.networkType === selectedNetwork) {
      const speeds = instanceSpeeds[id];
      if (speeds) {
        uploadSpeed += speeds.uploadSpeed || 0;
        downloadSpeed += speeds.downloadSpeed || 0;
      }
    }
  }

  // Network toggle: one button per connected network (aMule / Rucio / BitTorrent)
  const networkToggle = showNetworkToggle && h('div', {
    className: 'absolute top-2 left-2 z-10 flex rounded-md overflow-hidden border border-gray-300 dark:border-gray-600'
  },
    ...connectedNetworks.map((nt, i) =>
      h('button', {
        key: nt,
        onClick: () => setSelectedNetwork(nt),
        className: `p-1.5 ${i > 0 ? 'border-l border-gray-300 dark:border-gray-600 ' : ''}${selectedNetwork === nt
          ? 'bg-blue-100 dark:bg-blue-900/50'
          : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`,
        title: `Show ${NETWORK_NAMES[nt] || nt}`
      }, h(ClientIcon, { clientType: nt, size: 16 }))
    )
  );

  // Determine displayed speeds: hovered historical point or live current
  const hoveredPoint = hoveredIndex != null ? sampledDataRef.current[hoveredIndex] : null;
  const displayUpload = hoveredPoint ? hoveredPoint.uploadSpeed : uploadSpeed;
  const displayDownload = hoveredPoint ? hoveredPoint.downloadSpeed : downloadSpeed;
  const hoveredTime = hoveredPoint
    ? new Date(hoveredPoint.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  // Check if data is loading
  const isLoading = !speedData?.data || !stats;

  return h('div', {
    className: `bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden ${isLoading ? 'animate-pulse' : ''}`
  },
    // Chart container
    h('div', { className: 'relative', style: { height: '100px' } },
      // Network toggle (when both clients available and not loading)
      !isLoading && networkToggle,
      // Chart canvas (always mounted for refs, hidden when loading)
      h('div', {
        ref: containerRef,
        className: `absolute inset-0 overflow-hidden ${isLoading ? 'invisible' : ''}`,
        style: { padding: '8px' }
      },
        h('canvas', {
          ref: canvasRef,
          style: { width: '100%', height: '100%', maxWidth: '100%', touchAction: 'none' }
        })
      ),
      // Empty placeholder when loading (outer overlay handles the spinner)
      isLoading && h('div', { className: 'absolute inset-0' })
    ),
    // Status bar
    h('div', { className: 'flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700' },
      // Network status (left side) - show skeleton when loading
      isLoading
        ? h('div', { className: 'flex items-center gap-3' },
            h('div', { className: 'h-3 w-24 bg-gray-200 dark:bg-gray-600 rounded' }),
            h('div', { className: 'h-3 w-20 bg-gray-200 dark:bg-gray-600 rounded' })
          )
        : h('div', { className: 'flex items-center gap-3 flex-wrap' }, networkStatus),
      // Current speeds (right side) - show skeleton when loading
      isLoading
        ? h('div', { className: 'flex items-center gap-3' },
            h('div', { className: 'h-3 w-12 bg-gray-200 dark:bg-gray-600 rounded' }),
            h('div', { className: 'h-3 w-12 bg-gray-200 dark:bg-gray-600 rounded' })
          )
        : h('div', { className: 'flex items-center gap-3' },
            hoveredTime && h('span', { className: 'text-xs font-medium text-gray-500 dark:text-gray-400' }, hoveredTime),
            h('span', { className: 'text-xs font-semibold text-green-600 dark:text-green-400' }, `↑ ${formatSpeed(displayUpload)}`),
            h('span', { className: 'text-xs font-semibold text-blue-600 dark:text-blue-400' }, `↓ ${formatSpeed(displayDownload)}`)
          )
    )
  );
};

export default MobileSpeedWidget;
