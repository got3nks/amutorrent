/**
 * GeoIP Module
 * Handles IP geolocation using MaxMind databases
 */

const maxmind = require('maxmind');
const fs = require('fs');
const config = require('./config');
const BaseModule = require('../lib/BaseModule');
const { ipToString } = require('../lib/networkUtils');

class GeoIPManager extends BaseModule {
  constructor() {
    super();
    this.cityReader = null;
    this.countryReader = null;
  }

  // Initialize GeoIP databases
  async initGeoIP() {
    try {
      const geoipDir = config.getGeoIPDir();
      const cityDbPath = config.getGeoIPCityDbPath();
      const countryDbPath = config.getGeoIPCountryDbPath();

      // Check if GeoIP directory exists
      if (!fs.existsSync(geoipDir)) {
        this.log('ℹ️  GeoIP directory not found - GeoIP feature disabled');
        return;
      }

      let databasesLoaded = false;

      if (fs.existsSync(cityDbPath)) {
        this.cityReader = await maxmind.open(cityDbPath);
        this.log('🌍 GeoIP City database loaded:', cityDbPath);
        databasesLoaded = true;
      } else {
        this.log('ℹ️  GeoIP City database not found at:', cityDbPath);
      }

      if (fs.existsSync(countryDbPath)) {
        this.countryReader = await maxmind.open(countryDbPath);
        this.log('🌍 GeoIP Country database loaded:', countryDbPath);
        databasesLoaded = true;
      } else {
        this.log('ℹ️  GeoIP Country database not found at:', countryDbPath);
      }

      if (!databasesLoaded) {
        this.log('ℹ️  No GeoIP databases found - GeoIP feature disabled');
      } else {
        this.log('✅ GeoIP feature enabled with available databases');
      }
    } catch (err) {
      this.log('⚠️  GeoIP initialization failed:', err.message);
      this.log('ℹ️  Server will continue without GeoIP functionality');
    }
  }

  // Function to get GeoIP data for an IP address
  getGeoIPData(ip) {
    try {
      // If GeoIP is not available, return null immediately
      if (!this.cityReader && !this.countryReader) {
        return null;
      }

      // Skip localhost and private IPs
      if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') ||
          ip.startsWith('10.') || ip.startsWith('172.')) {
        return null;
      }

      let geoData = null;

      // Try city database first for more detailed info
      if (this.cityReader) {
        geoData = this.cityReader.get(ip);
        if (geoData) {
          return {
            city: geoData.city?.names?.en || geoData.city?.names?.en || null,
            country: geoData.country?.names?.en || geoData.country?.iso_code || null,
            countryCode: geoData.country?.iso_code || null,
            continent: geoData.continent?.names?.en || geoData.continent?.code || null,
            location: {
              lat: geoData.location?.latitude || null,
              lon: geoData.location?.longitude || null,
              timezone: geoData.location?.time_zone || null
            },
            source: 'city'
          };
        }
      }

      // Fallback to country database
      if (this.countryReader) {
        geoData = this.countryReader.get(ip);
        if (geoData) {
          return {
            country: geoData.country?.names?.en || geoData.country?.iso_code || null,
            countryCode: geoData.country?.iso_code || null,
            continent: geoData.continent?.names?.en || geoData.continent?.code || null,
            source: 'country'
          };
        }
      }

      return null;
    } catch (err) {
      this.log('⚠️  Error getting GeoIP data for', ip, ':', err.message);
      return null;
    }
  }

  /**
   * Format geoData into location info string for logging
   * @param {object|null} geoData - GeoIP data object
   * @returns {string} Formatted location string like " [City, Country, Continent]" or empty string
   */
  formatLocationInfo(geoData) {
    if (!geoData) return '';

    const parts = [];
    if (geoData.city) parts.push(geoData.city);
    if (geoData.country) parts.push(geoData.country);
    if (geoData.continent) parts.push(geoData.continent);

    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }

  // Watch GeoIP database files for changes
  watchGeoIPFiles() {
    const geoipDir = config.getGeoIPDir();

    // Only start watching if GeoIP is available
    if (!this.cityReader && !this.countryReader) {
      this.log('ℹ️  GeoIP not available - skipping file watching');
      return;
    }

    // Check if directory still exists
    if (!fs.existsSync(geoipDir)) {
      this.log('ℹ️  GeoIP directory not found - cannot start file watching');
      return;
    }

    const cityDbPath = config.getGeoIPCityDbPath();
    const countryDbPath = config.getGeoIPCountryDbPath();

    const reloadDatabase = async (dbType, filePath) => {
      try {
        this.log(`🔄 Detected change in ${dbType} database, reloading...`);

        if (dbType === 'City') {
          // MaxMind readers are memory-mapped and don't need explicit closing
          // Just set to null to allow garbage collection
          this.cityReader = null;

          if (fs.existsSync(filePath)) {
            this.cityReader = await maxmind.open(filePath);
            this.log(`✅ ${dbType} database reloaded successfully:`, filePath);
          } else {
            this.log(`⚠️  ${dbType} database file not found after change:`, filePath);
          }
        }
        else if (dbType === 'Country') {
          // MaxMind readers are memory-mapped and don't need explicit closing
          // Just set to null to allow garbage collection
          this.countryReader = null;

          if (fs.existsSync(filePath)) {
            this.countryReader = await maxmind.open(filePath);
            this.log(`✅ ${dbType} database reloaded successfully:`, filePath);
          } else {
            this.log(`⚠️  ${dbType} database file not found after change:`, filePath);
          }
        }
      } catch (err) {
        this.log(`❌ Failed to reload ${dbType} database:`, err.message);
      }
    };

    // Watch city database
    if (fs.existsSync(cityDbPath)) {
      try {
        fs.watch(cityDbPath, { persistent: false }, (eventType, filename) => {
          if (eventType === 'change') {
            // Debounce rapid file changes
            setTimeout(() => reloadDatabase('City', cityDbPath), 1000);
          }
        });
        this.log('👀 Watching City database for changes:', cityDbPath);
      } catch (err) {
        this.log('⚠️  Failed to watch City database:', err.message);
      }
    } else {
      this.log('ℹ️  City database file not found - not watching for changes');
    }

    // Watch country database
    if (fs.existsSync(countryDbPath)) {
      try {
        fs.watch(countryDbPath, { persistent: false }, (eventType, filename) => {
          if (eventType === 'change') {
            // Debounce rapid file changes
            setTimeout(() => reloadDatabase('Country', countryDbPath), 1000);
          }
        });
        this.log('👀 Watching Country database for changes:', countryDbPath);
      } catch (err) {
        this.log('⚠️  Failed to watch Country database:', err.message);
      }
    } else {
      this.log('ℹ️  Country database file not found - not watching for changes');
    }
  }

  /**
   * Enrich peers/uploads array with GeoIP data
   * Reads the `address` string field from each entry
   * @param {Array} peers - Array of peer/upload objects with address field
   * @returns {Array} - Enriched entries with geoData field
   */
  enrichPeersWithGeo(peers) {
    if (!Array.isArray(peers)) return peers;

    return peers.map(peer => {
      const ip = peer.address;
      if (!ip) return peer;

      const geoData = this.getGeoIPData(ip);

      return {
        ...peer,
        geoData: geoData
      };
    });
  }

  // Graceful shutdown
  async shutdown() {
    // MaxMind readers are memory-mapped and don't need explicit closing
    // Just set to null to allow garbage collection
    this.cityReader = null;
    this.countryReader = null;
    this.log('✅ GeoIP shutdown complete');
  }
}

module.exports = new GeoIPManager();