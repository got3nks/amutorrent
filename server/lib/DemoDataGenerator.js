/**
 * Demo Data Generator
 *
 * Generates fake data for demo mode, allowing screenshots and showcasing
 * the app without requiring real aMule/rTorrent clients.
 *
 * Enable with environment variable: DEMO_MODE=true
 */

const clientMeta = require('./clientMeta');

class DemoDataGenerator {
  constructor() {
    // 50 Linux ISO filenames
    this.linuxIsos = [
      'ubuntu-24.04.1-desktop-amd64.iso',
      'ubuntu-24.04-server-amd64.iso',
      'ubuntu-22.04.5-desktop-amd64.iso',
      'debian-12.6.0-amd64-netinst.iso',
      'debian-12.6.0-amd64-DVD-1.iso',
      'debian-11.10.0-amd64-netinst.iso',
      'fedora-40-workstation-x86_64.iso',
      'fedora-40-server-x86_64-dvd.iso',
      'fedora-39-workstation-live-x86_64.iso',
      'archlinux-2024.07.01-x86_64.iso',
      'archlinux-2024.06.01-x86_64.iso',
      'manjaro-kde-24.0.1-240601-linux69.iso',
      'manjaro-gnome-24.0.1-240601-linux69.iso',
      'manjaro-xfce-24.0.1-240601-linux69.iso',
      'linuxmint-22-cinnamon-64bit.iso',
      'linuxmint-22-mate-64bit.iso',
      'linuxmint-21.3-cinnamon-64bit.iso',
      'opensuse-leap-15.6-dvd-x86_64.iso',
      'opensuse-tumbleweed-DVD-x86_64-snapshot.iso',
      'elementary-os-7.1-stable.20230926.iso',
      'pop-os_22.04_amd64_intel_39.iso',
      'pop-os_22.04_amd64_nvidia_39.iso',
      'zorin-os-17.1-core-64-bit.iso',
      'zorin-os-17.1-lite-64-bit.iso',
      'kali-linux-2024.2-installer-amd64.iso',
      'kali-linux-2024.2-live-amd64.iso',
      'parrot-security-6.0_amd64.iso',
      'tails-amd64-6.4.iso',
      'qubes-R4.2.1-x86_64.iso',
      'whonix-workstation-17.1.0.9.qcow2',
      'proxmox-ve_8.2-1.iso',
      'truenas-scale-24.04.1.iso',
      'openmediavault_7.1-amd64.iso',
      'rocky-9.4-x86_64-dvd.iso',
      'rocky-9.4-x86_64-minimal.iso',
      'almalinux-9.4-x86_64-dvd.iso',
      'almalinux-9.4-x86_64-minimal.iso',
      'centos-stream-9-x86_64-dvd.iso',
      'oracle-linux-R9-U4-x86_64-dvd.iso',
      'slackware64-15.0-install-dvd.iso',
      'gentoo-install-amd64-minimal-20240630.iso',
      'void-live-x86_64-20230628-xfce.iso',
      'nixos-24.05-x86_64-linux.iso',
      'solus-4.5-budgie.iso',
      'endeavouros-gemini-nova-03-2024.iso',
      'garuda-dr460nized-linux-zen-240428.iso',
      'artix-xfce-openrc-20230814-x86_64.iso',
      'mx-23.3_x64.iso',
      'antiX-23.1_x64-full.iso',
      'alpine-standard-3.20.1-x86_64.iso'
    ];

    // 50 Royalty-free video filenames
    this.videoFiles = [
      'nature-forest-sunrise-4k-footage.mp4',
      'ocean-waves-sunset-relaxation-hd.mp4',
      'mountain-landscape-drone-footage.mp4',
      'city-timelapse-night-lights-4k.mp4',
      'abstract-particles-motion-background.mp4',
      'aurora-borealis-timelapse-norway.mp4',
      'tropical-beach-paradise-aerial.mp4',
      'waterfall-cascade-slow-motion.mp4',
      'autumn-leaves-falling-macro.mp4',
      'starry-night-sky-milky-way.mp4',
      'desert-sand-dunes-wind-patterns.mp4',
      'rain-droplets-window-ambience.mp4',
      'fire-flames-dancing-closeup.mp4',
      'snow-falling-winter-forest.mp4',
      'underwater-coral-reef-fish.mp4',
      'clouds-rolling-timelapse-4k.mp4',
      'lightning-storm-night-footage.mp4',
      'bamboo-forest-zen-walk.mp4',
      'cherry-blossom-spring-japan.mp4',
      'volcano-eruption-aerial-view.mp4',
      'northern-lights-iceland-4k.mp4',
      'jungle-wildlife-documentary.mp4',
      'abstract-liquid-mercury-flow.mp4',
      'geometric-patterns-animation.mp4',
      'neon-tunnel-loop-background.mp4',
      'space-nebula-journey-4k.mp4',
      'earth-from-space-rotation.mp4',
      'solar-system-planets-tour.mp4',
      'deep-sea-creatures-bioluminescent.mp4',
      'savanna-wildlife-golden-hour.mp4',
      'arctic-glacier-calving-4k.mp4',
      'lavender-fields-provence-drone.mp4',
      'ancient-ruins-exploration.mp4',
      'modern-architecture-timelapse.mp4',
      'traffic-flow-city-night.mp4',
      'coffee-brewing-slow-motion.mp4',
      'ink-in-water-abstract-art.mp4',
      'butterfly-metamorphosis-macro.mp4',
      'thunderstorm-approaching-plains.mp4',
      'hot-air-balloons-cappadocia.mp4',
      'northern-sea-waves-drone.mp4',
      'redwood-forest-walking-tour.mp4',
      'japanese-garden-tranquility.mp4',
      'fireworks-celebration-night.mp4',
      'foggy-morning-lake-serenity.mp4',
      'rainbow-after-storm-beauty.mp4',
      'crystal-cave-exploration-4k.mp4',
      'river-rapids-kayak-pov.mp4',
      'moon-phases-timelapse.mp4',
      'bonsai-tree-growth-timelapse.mp4'
    ];

    // Categories
    this.categories = [
      { id: 0, name: 'Default', color: '#6B7280', path: '/downloads' },
      { id: 1, name: 'Movies', color: '#E07800', path: '/downloads/movies' },
      { id: 2, name: 'TV Shows', color: '#0063E6', path: '/downloads/tv' },
      { id: 3, name: 'Software', color: '#00C853', path: '/downloads/software' }
    ];

    // Tracker domains
    this.trackers = [
      'tracker.ubuntu.com',
      'torrent.fedoraproject.org',
      'tracker.debian.org',
      'tracker.archlinux.org',
      'tracker.linuxmint.com',
      'tracker.opentrackr.org',
      'tracker.openbittorrent.com',
      'tracker.publicbt.com',
      'open.stealth.si',
      'tracker.leechers-paradise.org',
      'tracker.coppersurfer.tk',
      'exodus.desync.com',
      'tracker.torrent.eu.org',
      'tracker.tiny-vps.com',
      'tracker.pirateparty.gr'
    ];

    // Countries for GeoIP
    this.countries = [
      { code: 'US', name: 'United States', cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Seattle'] },
      { code: 'DE', name: 'Germany', cities: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne'] },
      { code: 'FR', name: 'France', cities: ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'] },
      { code: 'GB', name: 'United Kingdom', cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow'] },
      { code: 'NL', name: 'Netherlands', cities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'] },
      { code: 'JP', name: 'Japan', cities: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Sapporo'] },
      { code: 'CA', name: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa'] },
      { code: 'AU', name: 'Australia', cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'] },
      { code: 'BR', name: 'Brazil', cities: ['Sao Paulo', 'Rio de Janeiro', 'Brasilia', 'Salvador', 'Fortaleza'] },
      { code: 'SE', name: 'Sweden', cities: ['Stockholm', 'Gothenburg', 'Malmo', 'Uppsala', 'Vasteras'] },
      { code: 'CH', name: 'Switzerland', cities: ['Zurich', 'Geneva', 'Basel', 'Bern', 'Lausanne'] },
      { code: 'PL', name: 'Poland', cities: ['Warsaw', 'Krakow', 'Lodz', 'Wroclaw', 'Poznan'] },
      { code: 'IT', name: 'Italy', cities: ['Rome', 'Milan', 'Naples', 'Turin', 'Florence'] },
      { code: 'ES', name: 'Spain', cities: ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Bilbao'] },
      { code: 'KR', name: 'South Korea', cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon'] }
    ];

    // Client software names
    this.clientSoftware = [
      { name: 'aMule 2.3.3', id: 1 },
      { name: 'eMule 0.60d', id: 2 },
      { name: 'qBittorrent 4.6.5', id: 3 },
      { name: 'Transmission 4.0.5', id: 4 },
      { name: 'Deluge 2.1.1', id: 5 },
      { name: 'rTorrent 0.9.8', id: 6 },
      { name: 'libtorrent 2.0.10', id: 7 },
      { name: 'uTorrent 3.6.0', id: 8 },
      { name: 'BitTorrent 7.11', id: 9 },
      { name: 'Vuze 5.7.7.0', id: 10 }
    ];

    // Cache for consistent items across calls
    this._cachedItems = null;
    this._cachedHistory = null;
    this._lastGeneratedAt = 0;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  _randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  _randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _randomHash(length = 40) {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < length; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  _randomIP() {
    // Generate a realistic-looking public IP
    const firstOctet = this._randomChoice([45, 51, 62, 78, 82, 91, 103, 104, 108, 142, 151, 162, 185, 192, 198, 203]);
    return `${firstOctet}.${this._randomBetween(1, 254)}.${this._randomBetween(1, 254)}.${this._randomBetween(1, 254)}`;
  }

  _generateGeoData() {
    const country = this._randomChoice(this.countries);
    const city = this._randomChoice(country.cities);
    return {
      country: country.code,
      countryName: country.name,
      city: city,
      latitude: this._randomFloat(-60, 60),
      longitude: this._randomFloat(-180, 180)
    };
  }

  _generatePeer(isUploader = false) {
    const software = this._randomChoice(this.clientSoftware);
    const uploadRate = isUploader ? this._randomBetween(50000, 500000) : 0;

    return {
      role: 'peer',
      id: this._randomHash(16),
      address: this._randomIP(),
      port: this._randomBetween(10000, 65535),
      software: software.name,
      softwareId: software.id,
      uploadRate: uploadRate,
      downloadRate: this._randomBetween(0, 200000),
      uploadTotal: this._randomBetween(0, 500000000),
      uploadSession: this._randomBetween(0, 50000000),
      completedPercent: this._randomBetween(0, 100),
      isEncrypted: Math.random() > 0.5,
      isIncoming: Math.random() > 0.7,
      geoData: this._generateGeoData(),
      hostname: null
    };
  }

  _generatePeers(count, uploaderRatio = 0.3) {
    const peers = [];
    for (let i = 0; i < count; i++) {
      const isUploader = Math.random() < uploaderRatio;
      peers.push(this._generatePeer(isUploader));
    }
    return peers;
  }

  // ============================================================================
  // ITEM GENERATION
  // ============================================================================

  _generateItem(name, client, type) {
    const isIso = name.endsWith('.iso') || name.endsWith('.qcow2');
    const size = isIso
      ? this._randomBetween(700_000_000, 4_700_000_000)  // ISOs: 700MB - 4.7GB
      : this._randomBetween(50_000_000, 500_000_000);     // Videos: 50MB - 500MB

    let progress, status, downloadSpeed, uploadSpeed, sizeDownloaded;
    let downloading, complete, seeding, shared;

    // For active downloads, determine if stalled (20% chance)
    const isStalled = type === 'active' && Math.random() < 0.2;

    switch (type) {
      case 'active':
        progress = this._randomBetween(10, 95);
        status = 'active';
        // Stalled = no connected sources, no download speed
        downloadSpeed = isStalled ? 0 : this._randomBetween(500_000, 5_000_000);
        // 30% chance of no upload (independent of stalled)
        uploadSpeed = Math.random() > 0.3 ? this._randomBetween(100_000, 1_000_000) : 0;
        sizeDownloaded = Math.floor(size * progress / 100);
        downloading = true;
        complete = false;
        seeding = false;
        shared = clientMeta.isBittorrent(client);
        break;

      case 'paused':
        progress = this._randomBetween(20, 80);
        status = 'paused';
        downloadSpeed = 0;
        uploadSpeed = 0;
        sizeDownloaded = Math.floor(size * progress / 100);
        downloading = false;
        complete = false;
        seeding = false;
        shared = clientMeta.isBittorrent(client);
        break;

      case 'seeding':
        progress = 100;
        status = 'seeding';
        downloadSpeed = 0;
        // 40% chance of no leechers (no upload speed)
        uploadSpeed = Math.random() > 0.4 ? this._randomBetween(100_000, 1_000_000) : 0;
        sizeDownloaded = size;
        downloading = false;
        complete = true;
        seeding = true;
        shared = true;
        break;

      default:
        progress = 100;
        status = 'seeding';
        downloadSpeed = 0;
        uploadSpeed = 0;
        sizeDownloaded = size;
        downloading = false;
        complete = true;
        seeding = true;
        shared = true;
    }

    const category = this._randomChoice(this.categories);
    const sourcesTotal = this._randomBetween(5, 50);
    // Stalled items have 0 connected sources
    const sourcesConnected = isStalled ? 0 : this._randomBetween(1, Math.min(20, sourcesTotal));
    const sourcesSeeders = this._randomBetween(0, sourcesConnected);

    // Calculate ETA
    let eta = null;
    if (!complete && downloadSpeed > 0) {
      const remainingBytes = size - sizeDownloaded;
      eta = Math.floor(remainingBytes / downloadSpeed);
    }

    // Generate peer data (unified array with role: 'peer')
    const peersCount = this._randomBetween(3, 15);
    const peers = this._generatePeers(peersCount, 0.3);

    const hash = this._randomHash(clientMeta.get(client).hashLength);
    const tracker = this._randomChoice(this.trackers);
    const uploadTotal = this._randomBetween(0, size * 3);
    const ratio = size > 0 ? uploadTotal / size : 0;

    // Timestamps
    const now = Date.now();
    const addedAt = new Date(now - this._randomBetween(3600000, 604800000)); // 1 hour to 7 days ago

    const item = {
      hash,
      name,
      client,
      instanceId: `demo-${client}`,
      size,
      sizeDownloaded,
      progress,
      downloadSpeed,
      uploadSpeed,
      status,
      category: category.name,
      categoryId: category.id,
      downloading,
      shared,
      complete,
      seeding,
      sources: {
        total: sourcesTotal,
        connected: sourcesConnected,
        seeders: sourcesSeeders,
        a4af: clientMeta.isEd2k(client) ? this._randomBetween(0, 5) : 0,
        notCurrent: clientMeta.isEd2k(client) ? this._randomBetween(0, 10) : 0
      },
      peers,
      uploadTotal,
      ratio: Math.round(ratio * 100) / 100,
      eta,
      raw: {},
      addedAt
    };

    // Client-specific fields
    if (clientMeta.isEd2k(client)) {
      item.downloadPriority = this._randomBetween(0, 5);
      item.uploadPriority = this._randomBetween(0, 5);
      item.uploadSession = this._randomBetween(0, uploadTotal);
      item.requestsAccepted = this._randomBetween(0, 100);
      item.requestsAcceptedTotal = this._randomBetween(0, 1000);
      item.partStatus = null;
      item.gapStatus = null;
      item.reqStatus = null;
      item.lastSeenComplete = Math.random() > 0.5 ? now - this._randomBetween(0, 86400000) : 0;
      item.link = `ed2k://|file|${encodeURIComponent(name)}|${size}|${hash.toUpperCase()}|/`;
    } else {
      item.tracker = tracker;
      item.trackers = [tracker];
      item.trackersDetailed = [{
        url: `http://${tracker}:6969/announce`,
        enabled: true,
        group: 0,
        scrapeComplete: this._randomBetween(10, 500),
        scrapeIncomplete: this._randomBetween(1, 100),
        type: 'http',
        lastActivity: now - this._randomBetween(0, 3600000)
      }];
      item.message = '';
      item.magnetLink = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}&tr=${encodeURIComponent(`http://${tracker}:6969/announce`)}`;
      item.directory = `${category.path}/${name}`;
      item.multiFile = Math.random() > 0.7;
      item.downloadPriority = this._randomBetween(0, 3);
    }

    return item;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  generateItems() {
    // Return cached items if recent (within 1 second) to avoid flickering
    const now = Date.now();
    if (this._cachedItems && now - this._lastGeneratedAt < 1000) {
      // Update speeds and progress slightly for realism
      return this._updateItemsRealtime(this._cachedItems);
    }

    const items = [];
    const usedNames = new Set();

    const getUniqueName = (source) => {
      let name;
      let attempts = 0;
      do {
        name = this._randomChoice(source);
        attempts++;
      } while (usedNames.has(name) && attempts < source.length);
      usedNames.add(name);
      return name;
    };

    // 15 active downloads (mix of aMule and rTorrent)
    for (let i = 0; i < 15; i++) {
      const client = i % 2 === 0 ? 'amule' : 'rtorrent';
      const source = i % 3 === 0 ? this.videoFiles : this.linuxIsos;
      const name = getUniqueName(source);
      items.push(this._generateItem(name, client, 'active'));
    }

    // 5 paused downloads
    for (let i = 0; i < 5; i++) {
      const client = i % 2 === 0 ? 'rtorrent' : 'amule';
      const source = i % 2 === 0 ? this.linuxIsos : this.videoFiles;
      const name = getUniqueName(source);
      items.push(this._generateItem(name, client, 'paused'));
    }

    // 15 seeding/shared files
    for (let i = 0; i < 15; i++) {
      const client = i % 2 === 0 ? 'amule' : 'rtorrent';
      const source = i % 2 === 0 ? this.linuxIsos : this.videoFiles;
      const name = getUniqueName(source);
      items.push(this._generateItem(name, client, 'seeding'));
    }

    this._cachedItems = items;
    this._lastGeneratedAt = now;

    return items;
  }

  _updateItemsRealtime(items) {
    // Slightly update speeds and progress for active items to simulate real-time changes
    return items.map(item => {
      if (item.status === 'active' && item.downloading) {
        // Fluctuate speeds by +/- 10%
        const speedFactor = 0.9 + Math.random() * 0.2;
        const newDownloadSpeed = Math.floor(item.downloadSpeed * speedFactor);
        const newUploadSpeed = Math.floor(item.uploadSpeed * speedFactor);

        // Increase downloaded slightly (simulate 3 seconds of progress)
        const downloaded = Math.min(item.size, item.sizeDownloaded + newDownloadSpeed * 3);
        const progress = Math.floor((downloaded / item.size) * 100);

        return {
          ...item,
          downloadSpeed: newDownloadSpeed,
          uploadSpeed: newUploadSpeed,
          sizeDownloaded: downloaded,
          progress,
          eta: progress < 100 && newDownloadSpeed > 0
            ? Math.floor((item.size - downloaded) / newDownloadSpeed)
            : null
        };
      }
      return item;
    });
  }

  generateCategories() {
    return this.categories.map(cat => ({
      id: cat.id,
      title: cat.name,
      name: cat.name,
      color: cat.color,
      hexColor: cat.color,  // Frontend uses hexColor for border styling
      path: cat.path,
      comment: '',
      priority: 0,
      source: cat.id === 0 ? 'default' : 'custom'
    }));
  }

  generateStats() {
    // Calculate from current items
    const items = this.generateItems();
    let downloadSpeed = 0;
    let uploadSpeed = 0;
    let downloading = 0;
    let seeding = 0;

    for (const item of items) {
      downloadSpeed += item.downloadSpeed;
      uploadSpeed += item.uploadSpeed;
      if (item.downloading) downloading++;
      if (item.seeding) seeding++;
    }

    return {
      downloadSpeed,
      uploadSpeed,
      downloading,
      seeding,
      connected: true
    };
  }

  generateHistory() {
    if (this._cachedHistory) {
      return this._cachedHistory;
    }

    const history = [];
    const usedNames = new Set();
    const now = Date.now();

    const getUniqueName = (source) => {
      let name;
      let attempts = 0;
      do {
        name = this._randomChoice(source);
        attempts++;
      } while (usedNames.has(name) && attempts < source.length);
      usedNames.add(name);
      return name;
    };

    // Status distribution: completed (50%), downloading (20%), deleted (15%), missing (15%)
    const statuses = [
      ...Array(10).fill('completed'),
      ...Array(4).fill('downloading'),
      ...Array(3).fill('deleted'),
      ...Array(3).fill('missing')
    ];

    // Generate 20 history entries with various statuses
    for (let i = 0; i < 20; i++) {
      const source = i % 2 === 0 ? this.linuxIsos : this.videoFiles;
      const name = getUniqueName(source);
      const client = i % 2 === 0 ? 'amule' : 'rtorrent';
      const isIso = name.endsWith('.iso') || name.endsWith('.qcow2');
      const size = isIso
        ? this._randomBetween(700_000_000, 4_700_000_000)
        : this._randomBetween(50_000_000, 500_000_000);

      const category = this._randomChoice(this.categories);
      const status = statuses[i];
      const tracker = client === 'rtorrent' ? this._randomChoice(this.trackers) : null;

      // Base timestamps
      const startedAt = new Date(now - this._randomBetween(3600000, 2592000000)); // 1 hour to 30 days ago

      let completedAt = null;
      let deletedAt = null;
      let downloaded = 0;
      let uploaded = 0;
      let downloadSpeed = null;
      let uploadSpeed = null;

      switch (status) {
        case 'completed':
          // Completed: full download, has completedAt
          completedAt = new Date(startedAt.getTime() + this._randomBetween(1800000, 86400000));
          downloaded = size;
          uploaded = this._randomBetween(0, size * 2);
          break;

        case 'downloading':
          // Downloading: partial progress, has speeds
          downloaded = Math.floor(size * this._randomBetween(10, 90) / 100);
          uploaded = this._randomBetween(0, downloaded);
          downloadSpeed = this._randomBetween(500_000, 5_000_000);
          uploadSpeed = Math.random() > 0.3 ? this._randomBetween(100_000, 1_000_000) : 0;
          break;

        case 'deleted':
          // Deleted: was completed, then removed
          completedAt = new Date(startedAt.getTime() + this._randomBetween(1800000, 86400000));
          deletedAt = new Date(completedAt.getTime() + this._randomBetween(86400000, 604800000)); // 1-7 days after completion
          downloaded = size;
          uploaded = this._randomBetween(0, size * 2);
          break;

        case 'missing':
          // Missing: file disappeared (completed but file not found)
          completedAt = new Date(startedAt.getTime() + this._randomBetween(1800000, 86400000));
          downloaded = size;
          uploaded = this._randomBetween(0, size);
          break;
      }

      const ratio = downloaded > 0 ? uploaded / downloaded : 0;

      history.push({
        id: i + 1,
        hash: this._randomHash(clientMeta.get(client).hashLength),
        name,
        client,
        clientType: client,
        size,
        category: category.name,
        categoryId: category.id,
        status,
        addedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt ? completedAt.toISOString() : null,
        addedBy: Math.random() > 0.7 ? 'sonarr' : null,
        deletedAt: deletedAt ? deletedAt.toISOString() : null,
        downloaded,
        uploaded,
        ratio: Math.round(ratio * 100) / 100,
        downloadSpeed,
        uploadSpeed,
        tracker,
        trackerDomain: tracker
      });
    }

    // Sort by startedAt descending (most recent first)
    history.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    this._cachedHistory = history;
    return history;
  }

  /**
   * Get complete batch data for demo mode
   */
  getBatchData() {
    return {
      items: this.generateItems(),
      categories: this.generateCategories(),
      stats: this.generateStats(),
      clientDefaultPaths: { 'demo-amule': '/downloads', 'demo-rtorrent': '/downloads', 'demo-qbittorrent': '/downloads' },
      hasPathWarnings: false
    };
  }
}

module.exports = DemoDataGenerator;
