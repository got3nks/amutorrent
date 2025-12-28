const { create } = require('xmlbuilder2');
const { convertEd2kToMagnet } = require('../linkConverter');

/**
 * Convert aMule search results to Torznab RSS feed
 *
 * aMule returns results with: fileHash, fileName, fileSize, sourceCount
 * Torznab expects: RSS 2.0 format with custom torznab:attr elements
 *
 * @param {Array} amuleResults - Results from amule
 * @param {string} query - Original search query
 * @returns {string} XML RSS feed
 */
function convertToTorznabFeed(amuleResults, query) {
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

    // Categories - add both parent and child categories
    // Torznab expects hierarchical categories: parent (5000) and child (5040)
    const categoryId = result.category || '5040';
    item.ele('torznab:attr', { name: 'category', value: '5000' }).up(); // Parent: TV
    item.ele('torznab:attr', { name: 'category', value: categoryId }).up(); // Child: TV/SD or custom
  });

  return root.end({ prettyPrint: true });
}

module.exports = { convertToTorznabFeed };
