/**
 * SpeedChart Component
 *
 * Displays upload and download speed over time using Chart.js
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatSpeed } from '../../utils/index.js';

const { createElement: h, useEffect, useRef } = React;

/**
 * SpeedChart component
 * @param {object} speedData - Speed history data
 * @param {string} theme - Current theme (dark/light)
 * @param {string} historicalRange - Time range (24h/7d/30d)
 */
const SpeedChart = ({ speedData, theme, historicalRange }) => {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  // Effect 1: Create chart once on mount, destroy on unmount
  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = theme === 'dark';

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Upload Speed',
            data: [],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Download Speed',
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
  }, []); // Run only once on mount

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
        // For 7d and 30d, show day-month and time
        return date.toLocaleString('en-US', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(',', '');
      }
    });

    // Update data
    chartInstance.current.data.labels = labels;
    chartInstance.current.data.datasets[0].data = speedData.data.map(d => d.uploadSpeed);
    chartInstance.current.data.datasets[1].data = speedData.data.map(d => d.downloadSpeed);

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
  }, [speedData, theme, historicalRange]);

  if (!speedData || !speedData.data || speedData.data.length === 0) {
    return h('p', { className: 'text-center text-gray-500 dark:text-gray-400 text-sm py-8' }, 'No data available');
  }

  return h('canvas', { ref: canvasRef });
};

export default SpeedChart;
