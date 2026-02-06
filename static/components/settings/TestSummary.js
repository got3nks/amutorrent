/**
 * TestSummary Component
 *
 * Reusable test summary component for displaying test results
 */

import React from 'https://esm.sh/react@18.2.0';
import { AlertBox, Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * TestSummary component
 * @param {object} testResults - Test results object
 * @param {object} formData - Form data to check which integrations are enabled
 * @param {boolean} showDetails - Whether to show detailed error/warning messages (default: false)
 */
const TestSummary = ({ testResults, formData, showDetails = false }) => {
  if (!testResults || !testResults.results) return null;

  const results = testResults.results;
  const summary = {
    passed: 0,
    failed: 0,
    warnings: 0,
    total: 0
  };

  // Count aMule (only if enabled)
  if (formData?.amule?.enabled !== false && results.amule) {
    summary.total++;
    if (results.amule.success === false) {
      summary.failed++;
    } else if (results.amule.success) {
      summary.passed++;
    }
  }

  // Count rtorrent (only if enabled)
  if (formData?.rtorrent?.enabled && results.rtorrent) {
    summary.total++;
    if (results.rtorrent.success === false) {
      summary.failed++;
    } else if (results.rtorrent.success) {
      summary.passed++;
    }
  }

  // Count directories
  if (results.directories) {
    if (results.directories.data) {
      summary.total++;
      if (!results.directories.data.success) {
        summary.failed++;
      } else {
        summary.passed++;
      }
    }
    if (results.directories.logs) {
      summary.total++;
      if (!results.directories.logs.success) {
        summary.failed++;
      } else {
        summary.passed++;
      }
    }
    if (results.directories.geoip) {
      summary.total++;
      if (results.directories.geoip.warning && !results.directories.geoip.error) {
        summary.warnings++;
      } else if (results.directories.geoip.success) {
        summary.passed++;
      }
    }
  }

  // Count Sonarr (only if enabled)
  if (formData?.integrations?.sonarr?.enabled && results.sonarr) {
    summary.total++;
    if (results.sonarr.success === false) {
      summary.failed++;
    } else if (results.sonarr.success) {
      summary.passed++;
    }
  }

  // Count Radarr (only if enabled)
  if (formData?.integrations?.radarr?.enabled && results.radarr) {
    summary.total++;
    if (results.radarr.success === false) {
      summary.failed++;
    } else if (results.radarr.success) {
      summary.passed++;
    }
  }

  // Count Prowlarr (only if enabled)
  if (formData?.integrations?.prowlarr?.enabled && results.prowlarr) {
    summary.total++;
    if (results.prowlarr.success === false) {
      summary.failed++;
    } else if (results.prowlarr.success) {
      summary.passed++;
    }
  }

  const allPassed = summary.failed === 0 && summary.total > 0;
  const hasWarnings = summary.warnings > 0;

  // Determine AlertBox type
  let type;
  if (allPassed && !hasWarnings) {
    type = 'success';
  } else if (allPassed && hasWarnings) {
    type = 'warning';
  } else {
    type = 'error';
  }

  // Build detailed results if requested
  const detailedResults = [];
  if (showDetails) {
    // aMule result (only if enabled)
    if (formData?.amule?.enabled !== false && results.amule && !results.amule.success) {
      detailedResults.push({
        label: 'aMule Connection',
        success: false,
        message: results.amule.message || results.amule.error,
        warning: false
      });
    }

    // rtorrent result
    if (formData?.rtorrent?.enabled && results.rtorrent && !results.rtorrent.success) {
      detailedResults.push({
        label: 'rtorrent Connection',
        success: false,
        message: results.rtorrent.message || results.rtorrent.error,
        warning: false
      });
    }

    // Directory results
    if (results.directories) {
      if (results.directories.data && !results.directories.data.success) {
        detailedResults.push({
          label: 'Data Directory',
          success: false,
          message: results.directories.data.message || results.directories.data.error,
          warning: false
        });
      }
      if (results.directories.logs && !results.directories.logs.success) {
        detailedResults.push({
          label: 'Logs Directory',
          success: false,
          message: results.directories.logs.message || results.directories.logs.error,
          warning: false
        });
      }
      if (results.directories.geoip && (results.directories.geoip.warning || results.directories.geoip.error)) {
        detailedResults.push({
          label: 'GeoIP Database',
          success: false,
          message: results.directories.geoip.warning || results.directories.geoip.error,
          warning: !!results.directories.geoip.warning && !results.directories.geoip.error
        });
      }
    }

    // Sonarr result
    if (formData?.integrations?.sonarr?.enabled && results.sonarr && !results.sonarr.success) {
      detailedResults.push({
        label: 'Sonarr API',
        success: false,
        message: results.sonarr.message || results.sonarr.error,
        warning: false
      });
    }

    // Radarr result
    if (formData?.integrations?.radarr?.enabled && results.radarr && !results.radarr.success) {
      detailedResults.push({
        label: 'Radarr API',
        success: false,
        message: results.radarr.message || results.radarr.error,
        warning: false
      });
    }

    // Prowlarr result
    if (formData?.integrations?.prowlarr?.enabled && results.prowlarr && !results.prowlarr.success) {
      detailedResults.push({
        label: 'Prowlarr API',
        success: false,
        message: results.prowlarr.message || results.prowlarr.error,
        warning: false
      });
    }
  }

  return h(AlertBox, { type, className: 'mb-4' },
    h('div', {},
      h('p', { className: 'font-medium mb-1' },
        allPassed
          ? hasWarnings
            ? 'Configuration test completed with warnings'
            : 'All configuration tests passed!'
          : 'Configuration test failed'
      ),
      h('p', { className: 'text-sm' },
        `${summary.passed} passed${summary.warnings > 0 ? `, ${summary.warnings} warnings` : ''}${summary.failed > 0 ? `, ${summary.failed} failed` : ''} of ${summary.total} tests`
      ),

      // Detailed results - only show if requested and there are errors/warnings
      showDetails && detailedResults.length > 0 && h('div', {
        className: 'space-y-2 mt-3 pt-3 border-t border-gray-300 dark:border-gray-600'
      },
        detailedResults.map((result, idx) =>
          h('div', {
            key: idx,
            className: 'flex items-start gap-2 text-sm'
          },
            h(Icon, {
              name: result.success ? 'check' : (result.warning ? 'alertTriangle' : 'x'),
              size: 16,
              className: result.success
                ? 'text-green-600 dark:text-green-400 mt-0.5'
                : (result.warning
                  ? 'text-yellow-600 dark:text-yellow-400 mt-0.5'
                  : 'text-red-600 dark:text-red-400 mt-0.5')
            }),
            h('div', { className: 'flex-1' },
              h('span', {
                className: 'text-gray-700 dark:text-gray-300 font-medium'
              }, result.label + ': '),
              h('span', {
                className: 'text-gray-600 dark:text-gray-400'
              }, result.message)
            )
          )
        )
      )
    )
  );
};

export default TestSummary;
