const crypto = require('crypto');
const { create } = require('xmlbuilder2');
const { convertEd2kToMagnet } = require('../linkConverter');

/**
 * Every distinct filename a result is published under, parent first.
 * aMule can repeat the parent's own name among its children, so dedupe.
 * @param {Object} result - Search result, possibly carrying `children`
 * @returns {string[]} Distinct names, at least one
 */
function distinctNames(result) {
  const names = [];
  const seen = new Set();
  for (const candidate of [result, ...(result.children || [])]) {
    const name = candidate?.fileName;
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names.length > 0 ? names : ['Unknown'];
}

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

  // One item per distinct filename. A hash published under several names is
  // usually the same release with differently-parseable titles (#82), so each
  // is offered separately and the *arr picks whichever its parser prefers —
  // every one of them grabs the same file.
  const expanded = [];
  amuleResults.forEach((result, index) => {
    const fileHash = result.fileHash || `result-${index}`;
    distinctNames(result).forEach((fileName, nameIndex) => {
      expanded.push({ result, index, fileHash, fileName, nameIndex });
    });
  });

  expanded.forEach(({ result, fileHash, fileName, nameIndex }) => {
    const item = channel.ele('item');

    const fileSize = result.fileSize || 0;
    const sourceCount = result.sourceCount || 0;

    // The first name keeps the bare hash as its guid so releases already in an
    // *arr's history keep matching; alternates get a stable suffix derived
    // from the name, so the same search always yields the same guid.
    const guid = nameIndex === 0
      ? fileHash
      : `${fileHash}-${crypto.createHash('md5').update(fileName).digest('hex').slice(0, 8)}`;

    item.ele('title').txt(fileName).up();
    item.ele('guid').txt(guid).up();
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
    // Audio, for Lidarr (#80). ED2K results carry no genre or type metadata, so
    // as with movies and TV we claim the whole tree rather than guess a subcat.
    const allAudioCategories = ['3000', '3010', '3020', '3030', '3040', '3050', '3060'];

    if (requestedCats.length === 0) {
      // No categories requested - return every tree we advertise
      allMovieCategories.forEach(cat => categoriesToAdd.add(cat));
      allTVCategories.forEach(cat => categoriesToAdd.add(cat));
      allAudioCategories.forEach(cat => categoriesToAdd.add(cat));
    } else {
      // Add requested categories AND their parent categories
      requestedCats.forEach(cat => {
        categoriesToAdd.add(cat);

        // Add parent category if this is a child category
        if (cat.startsWith('2') && cat !== '2000') {
          categoriesToAdd.add('2000'); // Movies parent
        } else if (cat.startsWith('3') && cat !== '3000') {
          categoriesToAdd.add('3000'); // Audio parent
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
