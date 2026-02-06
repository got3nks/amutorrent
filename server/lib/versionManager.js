/**
 * Version Manager
 * Handles version info, changelog parsing, and GitHub update checking
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class VersionManager {
  constructor() {
    this.packageJson = null;
    this.changelog = null;
    this.githubCache = {
      data: null,
      timestamp: 0,
      ttl: 6 * 60 * 60 * 1000 // 6 hours default
    };
    this.githubRepo = 'got3nks/amutorrent';
  }

  /**
   * Load package.json
   */
  loadPackageJson() {
    if (!this.packageJson) {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      this.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    }
    return this.packageJson;
  }

  /**
   * Get current version from package.json
   */
  getVersion() {
    return this.loadPackageJson().version;
  }

  /**
   * Parse CHANGELOG.md into structured data
   * Format: Keep a Changelog (https://keepachangelog.com)
   */
  parseChangelog() {
    if (this.changelog) return this.changelog;

    const changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.md');

    if (!fs.existsSync(changelogPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(changelogPath, 'utf8');
      const releases = [];

      // Split by version headers: ## [x.x.x] or ## [x.x.x] - YYYY-MM-DD
      const lines = content.split('\n');
      let currentRelease = null;
      let currentCategory = null;

      for (const line of lines) {
        // Match version header: ## [2.0.0] or ## [2.0.0] - 2024-01-15
        const versionMatch = line.match(/^## \[(\d+\.\d+\.\d+)\](?:\s*-?\s*(.*))?$/);
        if (versionMatch) {
          if (currentRelease) {
            releases.push(currentRelease);
          }

          let releaseDate = null;
          const dateStr = versionMatch[2]?.trim();
          if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            releaseDate = dateStr.split(' ')[0];
          }

          currentRelease = {
            version: versionMatch[1],
            releaseDate,
            changes: {}
          };
          currentCategory = null;
          continue;
        }

        // Match category header: ### Added, ### Fixed, etc.
        const categoryMatch = line.match(/^### (.+)$/);
        if (categoryMatch && currentRelease) {
          currentCategory = categoryMatch[1].trim();
          if (!currentRelease.changes[currentCategory]) {
            currentRelease.changes[currentCategory] = [];
          }
          continue;
        }

        // Match list item: - Item or * Item
        const itemMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
        if (itemMatch && currentRelease && currentCategory) {
          currentRelease.changes[currentCategory].push(itemMatch[1].trim());
        }
      }

      // Don't forget the last release
      if (currentRelease) {
        releases.push(currentRelease);
      }

      // Only cache if we found releases (don't cache empty results)
      if (releases.length > 0) {
        this.changelog = releases;
      }
      return releases;
    } catch (err) {
      console.error('Error parsing changelog:', err.message);
      return [];
    }
  }

  /**
   * Check GitHub API for latest release
   * Caches result to avoid rate limiting (60 req/hour unauthenticated)
   */
  async checkGitHubUpdate() {
    const now = Date.now();

    // Return cached data if still valid
    if (this.githubCache.data && (now - this.githubCache.timestamp) < this.githubCache.ttl) {
      return this.githubCache.data;
    }

    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.githubRepo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'amutorrent',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const release = JSON.parse(data);
              const result = {
                latestVersion: release.tag_name.replace(/^v/, ''),
                releaseUrl: release.html_url,
                publishedAt: release.published_at,
                releaseName: release.name || null
              };

              // Cache successful result
              this.githubCache.data = result;
              this.githubCache.timestamp = now;
              this.githubCache.ttl = 6 * 60 * 60 * 1000; // Reset to 6 hours

              resolve(result);
            } else if (res.statusCode === 404) {
              // No releases yet
              resolve(null);
            } else {
              // Rate limited or error - use longer cache TTL
              this.githubCache.ttl = 12 * 60 * 60 * 1000; // 12 hours
              resolve(this.githubCache.data || null);
            }
          } catch (e) {
            resolve(this.githubCache.data || null);
          }
        });
      });

      req.on('error', () => resolve(this.githubCache.data || null));
      req.on('timeout', () => {
        req.destroy();
        resolve(this.githubCache.data || null);
      });

      req.end();
    });
  }

  /**
   * Compare semver versions
   * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
   */
  compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  /**
   * Get full version info
   */
  async getVersionInfo() {
    const version = this.getVersion();
    const changelog = this.parseChangelog();
    const currentRelease = changelog.find(r => r.version === version);

    // Check GitHub for updates (async, cached)
    const githubData = await this.checkGitHubUpdate();

    let updateAvailable = false;
    let latestVersion = version;
    let releaseUrl = `https://github.com/${this.githubRepo}/releases`;

    if (githubData) {
      latestVersion = githubData.latestVersion;
      releaseUrl = githubData.releaseUrl || releaseUrl;
      updateAvailable = this.compareSemver(githubData.latestVersion, version) > 0;
    }

    return {
      appName: 'aMuTorrent',
      version,
      releaseDate: currentRelease?.releaseDate || null,
      changelog: changelog.slice(0, 5), // Last 5 releases
      latestVersion,
      updateAvailable,
      releaseUrl,
      links: {
        github: `https://github.com/${this.githubRepo}`,
        dockerHub: 'https://hub.docker.com/r/g0t3nks/amutorrent',
        releases: `https://github.com/${this.githubRepo}/releases`
      }
    };
  }

  /**
   * Invalidate changelog cache (call after updates)
   */
  invalidateCache() {
    this.changelog = null;
    this.githubCache.data = null;
    this.githubCache.timestamp = 0;
  }
}

module.exports = new VersionManager();
