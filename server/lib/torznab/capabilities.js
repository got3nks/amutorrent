const { create } = require('xmlbuilder2');

/**
 * Generate Torznab capabilities XML
 *
 * This endpoint declares what search types and categories the indexer supports.
 * Sonarr/Radarr query this to understand how to interact with the indexer.
 *
 * @returns {string} XML capabilities response
 */
function generateCapabilities() {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('caps')
      .ele('server')
        .att('version', '1.0')
        .att('title', 'aMule ED2K Indexer')
      .up()
      .ele('limits')
        .att('max', '100')
        .att('default', '100')
      .up()
      .ele('searching')
        .ele('search')
          .att('available', 'yes')
          .att('supportedParams', 'q')
        .up()
        .ele('tv-search')
          .att('available', 'yes')
          .att('supportedParams', 'q,season,ep')
        .up()
        .ele('movie-search')
          .att('available', 'yes')
          .att('supportedParams', 'q')
        .up()
      .up()
      .ele('categories')
        .ele('category')
          .att('id', '5000')
          .att('name', 'TV')
          .ele('subcat')
            .att('id', '5030')
            .att('name', 'TV/SD')
          .up()
          .ele('subcat')
            .att('id', '5040')
            .att('name', 'TV/HD')
          .up()
          .ele('subcat')
            .att('id', '5045')
            .att('name', 'TV/UHD')
          .up()
        .up()
        .ele('category')
          .att('id', '2000')
          .att('name', 'Movies')
          .ele('subcat')
            .att('id', '2030')
            .att('name', 'Movies/SD')
          .up()
          .ele('subcat')
            .att('id', '2040')
            .att('name', 'Movies/HD')
          .up()
          .ele('subcat')
            .att('id', '2045')
            .att('name', 'Movies/UHD')
          .up()
        .up()
      .up()
    .up();

  return root.end({ prettyPrint: true });
}

module.exports = { generateCapabilities };
