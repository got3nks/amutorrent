#!/usr/bin/env node

/**
 * Sync docs from main project to website
 * - Copies markdown files from ../docs/ to src/content/docs/docs/
 * - Copies screenshots from ../docs/screenshots/ to public/screenshots/
 * - Adds Starlight frontmatter (title, description)
 * - Transforms filenames to lowercase
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../../docs');
const DEST_DIR = path.join(__dirname, '../src/content/docs/docs');
const SCREENSHOTS_SOURCE = path.join(__dirname, '../../docs/screenshots');
const SCREENSHOTS_DEST = path.join(__dirname, '../public/screenshots');
const STATIC_SOURCE = path.join(__dirname, '../../static');
const PUBLIC_DEST = path.join(__dirname, '../public');
const ASSETS_DEST = path.join(__dirname, '../src/assets');

// Title mappings for proper casing
const TITLE_MAP = {
  'AMULE': 'aMule',
  'API': 'API',
  'CONFIGURATION': 'Configuration',
  'DEVELOPMENT': 'Development',
  'GEOIP': 'GeoIP',
  'INTEGRATIONS': 'Integrations',
  'NOTIFICATIONS': 'Notifications',
  'PROWLARR': 'Prowlarr',
  'RTORRENT': 'rTorrent',
  'QBITTORRENT': 'qBittorrent',
  'DELUGE': 'Deluge',
  'TRANSMISSION': 'Transmission',
  'USERS': 'User Management',
  'INSTALLATION': 'Installation',
  'SCRIPTING': 'Scripting',
};

// Description mappings
const DESC_MAP = {
  'AMULE': 'Connect aMuTorrent to aMule via EC protocol',
  'API': 'REST API and WebSocket protocol reference',
  'CONFIGURATION': 'Setup wizard, settings, and environment variables',
  'DEVELOPMENT': 'Building, project structure, and contributing',
  'GEOIP': 'Display peer locations with MaxMind databases',
  'INTEGRATIONS': 'Sonarr, Radarr, and other *arr integrations',
  'NOTIFICATIONS': 'Push notifications via Apprise',
  'PROWLARR': 'Search torrents via Prowlarr indexers',
  'RTORRENT': 'Connect aMuTorrent to rTorrent via XML-RPC',
  'QBITTORRENT': 'Connect aMuTorrent to qBittorrent via WebUI API',
  'DELUGE': 'Connect aMuTorrent to Deluge via WebUI JSON-RPC',
  'TRANSMISSION': 'Connect aMuTorrent to Transmission via RPC',
  'USERS': 'Multi-user authentication, capabilities, and SSO',
  'INSTALLATION': 'How to install aMuTorrent',
  'SCRIPTING': 'Custom event scripts for automation',
};

// Transform internal doc links from ./FILENAME.md to /amutorrent/docs/filename
function transformLinks(content) {
  // Transform relative links like ./CONFIGURATION.md or (./AMULE.md) to /amutorrent/docs/configuration
  content = content.replace(/\]\(\.\/([A-Z_]+)\.md\)/g, (match, name) => {
    return `](/amutorrent/docs/${name.toLowerCase()})`;
  });

  // Transform links to ../scripts/README.md to internal scripting doc
  content = content.replace(/\]\(\.\.\/scripts\/README\.md\)/g, '](/amutorrent/docs/scripting)');

  return content;
}

function syncDocs() {
  // Ensure destination directory exists
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  // Get all markdown files from source
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.md'));

  console.log(`Syncing ${files.length} docs from ${SOURCE_DIR}`);

  for (const file of files) {
    const baseName = path.basename(file, '.md');
    const title = TITLE_MAP[baseName] || baseName;
    const description = DESC_MAP[baseName] || `${title} documentation`;

    // Read source content
    const sourcePath = path.join(SOURCE_DIR, file);
    let content = fs.readFileSync(sourcePath, 'utf-8');

    // Remove existing H1 if it matches the title (avoid duplicate)
    content = content.replace(/^#\s+.+\n+/, '');

    // Transform internal links
    content = transformLinks(content);

    // Add frontmatter
    const frontmatter = `---
title: ${title}
description: ${description}
---

`;

    const finalContent = frontmatter + content;

    // Write to destination with lowercase filename
    const destFile = file.toLowerCase();
    const destPath = path.join(DEST_DIR, destFile);

    fs.writeFileSync(destPath, finalContent);
    console.log(`  ${file} → ${destFile}`);
  }

  // Sync scripts/README.md as scripting.md
  syncScriptingDoc();

  console.log('Docs sync complete!');

  // Sync screenshots
  syncScreenshots();
}

function syncScriptingDoc() {
  const scriptingSource = path.join(__dirname, '../../scripts/README.md');
  if (!fs.existsSync(scriptingSource)) {
    console.log('  scripts/README.md not found, skipping.');
    return;
  }

  let content = fs.readFileSync(scriptingSource, 'utf-8');

  // Remove existing H1
  content = content.replace(/^#\s+.+\n+/, '');

  // Transform links
  content = transformLinks(content);

  const title = TITLE_MAP['SCRIPTING'];
  const description = DESC_MAP['SCRIPTING'];

  const frontmatter = `---
title: ${title}
description: ${description}
---

`;

  const finalContent = frontmatter + content;
  const destPath = path.join(DEST_DIR, 'scripting.md');

  fs.writeFileSync(destPath, finalContent);
  console.log('  scripts/README.md → scripting.md');
}

function syncScreenshots() {
  if (!fs.existsSync(SCREENSHOTS_SOURCE)) {
    console.log('No screenshots directory found, skipping.');
    return;
  }

  // Ensure destination directory exists
  if (!fs.existsSync(SCREENSHOTS_DEST)) {
    fs.mkdirSync(SCREENSHOTS_DEST, { recursive: true });
  }

  // Clean destination to remove stale screenshots
  const existing = fs.readdirSync(SCREENSHOTS_DEST).filter(f =>
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')
  );
  for (const file of existing) {
    fs.unlinkSync(path.join(SCREENSHOTS_DEST, file));
  }

  const files = fs.readdirSync(SCREENSHOTS_SOURCE).filter(f =>
    f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')
  );

  console.log(`Syncing ${files.length} screenshots from ${SCREENSHOTS_SOURCE}`);

  for (const file of files) {
    const sourcePath = path.join(SCREENSHOTS_SOURCE, file);
    const destPath = path.join(SCREENSHOTS_DEST, file);
    fs.copyFileSync(sourcePath, destPath);
  }

  console.log('Screenshots sync complete!');
}

function syncAssets() {
  // Ensure destination directories exist
  if (!fs.existsSync(PUBLIC_DEST)) {
    fs.mkdirSync(PUBLIC_DEST, { recursive: true });
  }
  if (!fs.existsSync(ASSETS_DEST)) {
    fs.mkdirSync(ASSETS_DEST, { recursive: true });
  }

  // Sync favicons to public/
  const favicons = ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png'];
  console.log('Syncing favicons...');
  for (const file of favicons) {
    const sourcePath = path.join(STATIC_SOURCE, file);
    const destPath = path.join(PUBLIC_DEST, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`  ${file}`);
    }
  }

  // Sync logo to src/assets/
  const logoSource = path.join(STATIC_SOURCE, 'logo-amutorrent.png');
  const logoDest = path.join(ASSETS_DEST, 'logo.png');
  if (fs.existsSync(logoSource)) {
    fs.copyFileSync(logoSource, logoDest);
    console.log('  logo-amutorrent.png → src/assets/logo.png');
  }

  console.log('Assets sync complete!');
}

syncDocs();
syncAssets();
