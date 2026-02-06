/**
 * ClientSpeedChart Component
 *
 * Shows upload and download speed for a single client (aMule or rTorrent)
 * - Upload speed line (green)
 * - Download speed line (blue)
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/index.js';
import { loadChartJs } from '../../utils/chartLoader.js';

const { createElement: h, useEffect, useRef, useState } = React;

/**
 * ClientSpeedChart component
 * @param {object} speedData - Speed history data from API
 * @param {string} clientType - 'amule' or 'rtorrent'
 * @param {string} theme - Current theme (dark/light)
 * @param {string} historicalRange - Time range (24h/7d/30d)
 */
const ClientSpeedChart = ({ speedData, clientType, theme, historicalRange }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);
  const [chartReady, setChartReady] = useState(false);

  // Load Chart.js library on mount
  useEffect(() => {
    loadChartJs().then(() => {
      setChartReady(true);
    }).catch(err => {
      console.error('Failed to load Chart.js:', err);
    });
  }, []);

  // Effect 1: Create chart once on mount, destroy on unmount
  useEffect(() => {
    if (!chartReady || !canvasRef.current || !window.Chart) return;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = theme === 'dark';

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          // Upload speed line
          {
            label: 'Upload',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          },
          // Download speed line
          {
            label: 'Download',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { color: isDark ? '#e5e7eb' : '#1f2937' }
          },
          tooltip: {
            backgroundColor: isDark ? '#1f2937' : '#ffffff',
            titleColor: isDark ? '#e5e7eb' : '#1f2937',
            bodyColor: isDark ? '#e5e7eb' : '#1f2937',
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + formatSpeed(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              maxTicksLimit: 12
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          },
          y: {
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              callback: function(value) {
                return formatSpeed(value);
              }
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          }
        }
      }
    });

    // Cleanup only on unmount
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [chartReady]);

  // Effect: ResizeObserver to handle container size changes
  useEffect(() => {
    if (!containerRef.current || !chartInstance.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [chartReady, clientType]);

  // Effect 2: Update chart data when speedData, theme, or range changes
  useEffect(() => {
    if (!chartInstance.current || !speedData || !speedData.data) return;

    const isDark = theme === 'dark';
    const labels = speedData.data.map(d => {
      const date = new Date(d.timestamp);
      if (historicalRange === '24h') {
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
      } else {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit'
        });
      }
    });

    // Get client-specific data
    const isAmule = clientType === 'amule';
    const uploadSpeedKey = isAmule ? 'amuleUploadSpeed' : 'rtorrentUploadSpeed';
    const downloadSpeedKey = isAmule ? 'amuleDownloadSpeed' : 'rtorrentDownloadSpeed';

    // Update data
    chartInstance.current.data.labels = labels;
    chartInstance.current.data.datasets[0].data = speedData.data.map(d => d[uploadSpeedKey] || 0);
    chartInstance.current.data.datasets[1].data = speedData.data.map(d => d[downloadSpeedKey] || 0);

    // Update colors for theme changes
    const legendColor = isDark ? '#e5e7eb' : '#1f2937';
    const tickColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? '#374151' : '#e5e7eb';

    chartInstance.current.options.plugins.legend.labels.color = legendColor;
    chartInstance.current.options.plugins.tooltip.backgroundColor = isDark ? '#1f2937' : '#ffffff';
    chartInstance.current.options.plugins.tooltip.titleColor = legendColor;
    chartInstance.current.options.plugins.tooltip.bodyColor = legendColor;
    chartInstance.current.options.plugins.tooltip.borderColor = gridColor;
    chartInstance.current.options.scales.x.ticks.color = tickColor;
    chartInstance.current.options.scales.y.ticks.color = tickColor;
    chartInstance.current.options.scales.x.grid.color = gridColor;
    chartInstance.current.options.scales.y.grid.color = gridColor;

    // Update without animation to prevent bounce
    chartInstance.current.update('none');
  }, [chartReady, speedData, theme, historicalRange, clientType]);

  if (!speedData || !speedData.data || speedData.data.length === 0) {
    return h('p', { className: 'text-center text-gray-500 dark:text-gray-400 text-sm py-8' }, 'No data available');
  }

  return h('div', { ref: containerRef, className: 'w-full h-full overflow-hidden' },
    h('canvas', { ref: canvasRef, style: { maxWidth: '100%' } })
  );
};

export default ClientSpeedChart;
