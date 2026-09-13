/**
 * TestSummary Component
 *
 * Reusable test summary component for displaying test results.
 * Uses `clientTestResults` (per-instance keyed object) for client counts,
 * and `testResults` for non-client counts (directories, integrations).
 */

import React from 'https://esm.sh/react@18.2.0';
import { AlertBox, Icon } from '../common/index.js';

const { createElement: h } = React;

/**
 * Count client test results from per-instance object.
 * @param {Object} clientTestResults - { [key]: { success, message, _label } }
 * @param {Object} summary - { passed, failed, warnings, total } to mutate
 */
function countClientResults(clientTestResults, summary) {
  if (!clientTestResults) return;
  for (const result of Object.values(clientTestResults)) {
    if (!result) continue;
    summary.total++;
    if (result.success === false) summary.failed++;
    else if (result.success) summary.passed++;
  }
}

/**
 * Collect detailed client error results using _label for display name.
 * @param {Object} clientTestResults - { [key]: { success, message, _label } }
 * @param {Array} detailedResults - Array to push results into
 */
function collectClientDetails(clientTestResults, detailedResults) {
  if (!clientTestResults) return;
  for (const result of Object.values(clientTestResults)) {
    if (result && !result.success) {
      detailedResults.push({
        label: result._label || 'Client Connection',
        success: false,
        message: result.message || result.error,
        warning: false
      });
    }
  }
}

/**
 * TestSummary component
 * @param {object} testResults - Test results object (non-client: directories, integrations)
 * @param {object} clientTestResults - Per-instance client test results
 * @param {boolean} showDetails - Whether to show detailed error/warning messages (default: false)
 */
const TestSummary = ({ testResults, clientTestResults, showDetails = false }) => {
  const hasClientResults = clientTestResults && Object.keys(clientTestResults).length > 0;
  const hasNonClientResults = testResults && testResults.results;

  if (!hasClientResults && !hasNonClientResults) return null;

  const results = testResults?.results || {};
  const summary = {
    passed: 0,
    failed: 0,
    warnings: 0,
    total: 0
  };

  // Count client results from per-instance object
  countClientResults(clientTestResults, summary);

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

  // Count Sonarr
  if (results.sonarr) {
    summary.total++;
    if (results.sonarr.success === false) {
      summary.failed++;
    } else if (results.sonarr.success) {
      summary.passed++;
    }
  }

  // Count Radarr
  if (results.radarr) {
    summary.total++;
    if (results.radarr.success === false) {
      summary.failed++;
    } else if (results.radarr.success) {
      summary.passed++;
    }
  }

  // Count Lidarr
  if (results.lidarr) {
    summary.total++;
    if (results.lidarr.success === false) {
      summary.failed++;
    } else if (results.lidarr.success) {
      summary.passed++;
    }
  }

  // Count Readarr
  if (results.readarr) {
    summary.total++;
    if (results.readarr.success === false) {
      summary.failed++;
    } else if (results.readarr.success) {
      summary.passed++;
    }
  }

  // Count Prowlarr
  if (results.prowlarr) {
    summary.total++;
    if (results.prowlarr.success === false) {
      summary.failed++;
    } else if (results.prowlarr.success) {
      summary.passed++;
    }
  }

  if (summary.total === 0) return null;

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
    // Client results from per-instance object
    collectClientDetails(clientTestResults, detailedResults);

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
    if (results.sonarr && !results.sonarr.success) {
      detailedResults.push({
        label: 'Sonarr API',
        success: false,
        message: results.sonarr.message || results.sonarr.error,
        warning: false
      });
    }

    // Radarr result
    if (results.radarr && !results.radarr.success) {
      detailedResults.push({
        label: 'Radarr API',
        success: false,
        message: results.radarr.message || results.radarr.error,
        warning: false
      });
    }

    // Lidarr result
    if (results.lidarr && !results.lidarr.success) {
      detailedResults.push({
        label: 'Lidarr API',
        success: false,
        message: results.lidarr.message || results.lidarr.error,
        warning: false
      });
    }

    // Readarr result
    if (results.readarr && !results.readarr.success) {
      detailedResults.push({
        label: 'Readarr API',
        success: false,
        message: results.readarr.message || results.readarr.error,
        warning: false
      });
    }

    // Prowlarr result
    if (results.prowlarr && !results.prowlarr.success) {
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
