const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DataFetchService = require('../lib/DataFetchService');

describe('DataFetchService cache invalidation', () => {
  it('invalidateBatchCache clears a fresh cached snapshot', () => {
    DataFetchService._cachedBatchData = { items: [{ hash: 'abc' }] };
    DataFetchService._cacheTimestamp = Date.now();

    assert.ok(DataFetchService.getCachedBatchData(10000));

    DataFetchService.invalidateBatchCache();

    assert.equal(DataFetchService.getCachedBatchData(10000), null);
    assert.equal(DataFetchService._cachedBatchData, null);
  });
});
