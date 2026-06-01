const { create } = require('xmlbuilder2');
const { convertEd2kToMagnet, encodeSlskdToMagnet } = require('../linkConverter');

/**
 * Convert aMule search results to Torznab RSS feed
 *
 * aMule returns results with: fileHash, fileName, fileSize, sourceCount
 * Torznab expects: RSS 2.0 format with custom torznab:attr elements
 *
 * @param {Array} amuleResults - Results from amule
 * @param {string} query - Original search query
 * @param {string} requestedCategories - Comma-separated category IDs from request
 * @returns {string} XML RSS feed
 */
function convertToTorznabFeed(amuleResults, query, requestedCategories = '') {
  const root = create({ version: '1.0', encoding: 'UTF-8' });
  const rss = root.ele('rss', {
    version: '1.0',
    'xmlns:atom': 'http://www.w3.org/2005/Atom',
    'xmlns:torznab': 'http://torznab.com/schemas/2015/feed'
  });

  const channel = rss.ele('channel');
  channel.ele('title').txt('aMule ED2K Indexer').up();
  channel.ele('description').txt('aMule ED2K/Kad Network Search Results').up();
  channel.ele('link').txt('http://localhost').up();
  channel.ele('language').txt('en-us').up();
  channel.ele('atom:link', {
    href: 'http://localhost/indexer/amule/api',
    rel: 'self',
    type: 'application/rss+xml'
  }).up();

  // Convert each aMule result to RSS item
  amuleResults.forEach((result, index) => {
    const item = channel.ele('item');

    // Basic item info
    const fileName = result.fileName || 'Unknown';
    const fileHash = result.fileHash || `result-${index}`;
    const fileSize = result.fileSize || 0;
    const sourceCount = result.sourceCount || 0;

    // Log each result for debugging
    // console.log(`[Torznab] Result ${index + 1}: ${fileName} (${fileSize} bytes, ${sourceCount} sources)`);

    item.ele('title').txt(fileName).up();
    item.ele('guid').txt(fileHash).up();
    item.ele('pubDate').txt(new Date().toUTCString()).up();

    // Size
    item.ele('size').txt(String(fileSize)).up();

    // Convert ed2k hash to magnet link (using urn:btih format for Sonarr compatibility)
    const { magnetLink } = convertEd2kToMagnet(fileHash, fileName, fileSize);
    item.ele('link').txt(magnetLink).up();
    item.ele('enclosure', {
      url: magnetLink,
      length: String(fileSize),
      type: 'application/x-bittorrent'
    }).up();

    // Torznab attributes
    item.ele('torznab:attr', { name: 'seeders', value: String(sourceCount) }).up();
    item.ele('torznab:attr', { name: 'peers', value: String(sourceCount) }).up();
    item.ele('torznab:attr', { name: 'size', value: String(fileSize) }).up();
    item.ele('torznab:attr', { name: 'grabs', value: '0' }).up();

    // Categories - Since aMule doesn't have categories, match what Prowlarr requested
    // Torznab spec requires BOTH parent and child categories
    const requestedCats = requestedCategories.split(',').filter(Boolean);
    const categoriesToAdd = new Set();

    // All available categories
    const allMovieCategories = ['2000', '2010', '2020', '2030', '2040', '2045', '2050', '2060', '2070', '2080', '2090'];
    const allTVCategories = ['5000', '5010', '5020', '5030', '5040', '5045', '5050', '5060', '5070', '5080', '5090'];

    if (requestedCats.length === 0) {
      // No categories requested - return both TV and Movies with all subcategories
      allMovieCategories.forEach(cat => categoriesToAdd.add(cat));
      allTVCategories.forEach(cat => categoriesToAdd.add(cat));
    } else {
      // Add requested categories AND their parent categories
      requestedCats.forEach(cat => {
        categoriesToAdd.add(cat);

        // Add parent category if this is a child category
        if (cat.startsWith('2') && cat !== '2000') {
          categoriesToAdd.add('2000'); // Movies parent
        } else if (cat.startsWith('5') && cat !== '5000') {
          categoriesToAdd.add('5000'); // TV parent
        }
      });
    }

    // Add all determined categories to the item
    Array.from(categoriesToAdd).forEach(cat => {
      item.ele('torznab:attr', { name: 'category', value: cat }).up();
    });
  });

  return root.end({ prettyPrint: true });
}

module.exports = { convertToTorznabFeed };

// ============================================================================
// SOULSEEK (SLSKD) TORZNAB FEED
// ============================================================================

/**
 * Convert slskd search results to a Torznab-compatible RSS feed.
 * Uses magnet links with the slskd encoding scheme (ffffffff suffix).
 *
 * @param {Array} slskdResults - Normalized slskd search results (fileHash, fileName, fileSize, sourceCount)
 * @param {string} query - Original search query
 * @param {string} requestedCategories - Comma-separated category IDs from request
 * @returns {string} XML RSS feed
 */
function convertToSoulseekTorznabFeed(slskdResults, query, requestedCategories = '') {
  const root = create({ version: '1.0', encoding: 'UTF-8' });
  const rss = root.ele('rss', {
    version: '1.0',
    'xmlns:atom': 'http://www.w3.org/2005/Atom',
    'xmlns:torznab': 'http://torznab.com/schemas/2015/feed'
  });

  const channel = rss.ele('channel');
  channel.ele('title').txt('Soulseek Indexer').up();
  channel.ele('description').txt('Soulseek Network Search Results').up();
  channel.ele('link').txt('http://localhost').up();
  channel.ele('language').txt('en-us').up();
  channel.ele('atom:link', {
    href: 'http://localhost/indexer/soulseek/api',
    rel: 'self',
    type: 'application/rss+xml'
  }).up();

  const allMovieCategories = ['2000', '2010', '2020', '2030', '2040', '2045', '2050', '2060', '2070', '2080', '2090'];
  const allTVCategories = ['5000', '5010', '5020', '5030', '5040', '5045', '5050', '5060', '5070', '5080', '5090'];

  slskdResults.forEach((result) => {
    const item = channel.ele('item');

    const fileName = result.fileName || 'Unknown';
    const fileHash = result.fileHash || '';
    const fileSize = result.fileSize || 0;
    const sourceCount = result.sourceCount || 1;

    const { magnetLink } = encodeSlskdToMagnet(fileHash, fileName, fileSize);

    item.ele('title').txt(fileName).up();
    item.ele('guid').txt(fileHash || magnetLink).up();
    item.ele('pubDate').txt(new Date().toUTCString()).up();
    item.ele('size').txt(String(fileSize)).up();
    item.ele('link').txt(magnetLink).up();
    item.ele('enclosure', {
      url: magnetLink,
      length: String(fileSize),
      type: 'application/x-bittorrent'
    }).up();

    item.ele('torznab:attr', { name: 'seeders', value: String(sourceCount) }).up();
    item.ele('torznab:attr', { name: 'peers', value: String(sourceCount) }).up();
    item.ele('torznab:attr', { name: 'size', value: String(fileSize) }).up();
    item.ele('torznab:attr', { name: 'grabs', value: '0' }).up();

    const requestedCats = requestedCategories.split(',').filter(Boolean);
    const categoriesToAdd = new Set();

    if (requestedCats.length === 0) {
      allMovieCategories.forEach(cat => categoriesToAdd.add(cat));
      allTVCategories.forEach(cat => categoriesToAdd.add(cat));
    } else {
      requestedCats.forEach(cat => {
        categoriesToAdd.add(cat);
        if (cat.startsWith('2') && cat !== '2000') categoriesToAdd.add('2000');
        else if (cat.startsWith('5') && cat !== '5000') categoriesToAdd.add('5000');
      });
    }

    Array.from(categoriesToAdd).forEach(cat => {
      item.ele('torznab:attr', { name: 'category', value: cat }).up();
    });
  });

  return root.end({ prettyPrint: true });
}

module.exports = { convertToTorznabFeed, convertToSoulseekTorznabFeed };
