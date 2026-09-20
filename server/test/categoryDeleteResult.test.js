const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const AmuleClient = require('amule-ec-node');
const { EC_TAGS, EC_OPCODES } = require('amule-ec-node/ECDefs');

// EC_OP_DELETE_CATEGORY used to answer EC_OP_NOOP for every delete, including
// the ones it discarded (amule-org/amule#1231). The fix (#1232) answers
// EC_OP_FAILED with a reason. These build the daemon's replies directly so the
// parsing is covered without needing a core new enough to send them.
const { CATEGORY_REASON } = AmuleClient;
const client = Object.create(AmuleClient.prototype);

const CAT = (v) => ({ tagId: EC_TAGS.EC_TAG_CATEGORY, humanValue: v });
const STR = (v) => ({ tagId: EC_TAGS.EC_TAG_STRING, humanValue: v });
const failed = (tags) => client._parseCategoryDeleteResult({ opcode: EC_OPCODES.EC_OP_FAILED, tags });

describe('category delete result parsing', () => {
  it('reads EC_OP_NOOP as a completed delete', () => {
    const result = client._parseCategoryDeleteResult({ opcode: EC_OPCODES.EC_OP_NOOP, tags: [] });
    assert.equal(result.success, true);
    assert.equal(result.applied, 'full');
  });

  it('reports a malformed request', () => {
    const result = failed([STR('Malformed category request.')]);
    assert.equal(result.success, false);
    assert.equal(result.reason, CATEGORY_REASON.MALFORMED_REQUEST);
  });

  it('reports a refusal to delete the default category', () => {
    const result = failed([CAT(0), STR('The default category cannot be deleted.')]);
    assert.equal(result.success, false);
    assert.equal(result.reason, CATEGORY_REASON.DEFAULT_CATEGORY);
  });

  it('reports an unknown category index', () => {
    const result = failed([CAT(7), STR('No such category.')]);
    assert.equal(result.success, false);
    assert.equal(result.reason, CATEGORY_REASON.NO_SUCH_CATEGORY);
  });

  it("carries the daemon's own message through", () => {
    assert.equal(failed([CAT(7), STR('No such category.')]).message, 'No such category.');
  });

  it('keeps category id 0 as 0 rather than null', () => {
    // A naive `humanValue || value` turns 0 into null, which would silently
    // misreport a default-category refusal as a malformed request.
    assert.equal(client.parseCategoryIdFromResponse({ tags: [CAT(0)] }), 0);
    assert.equal(client.parseCategoryIdFromResponse({ tags: [] }), null);
  });
});

describe('category update result parsing', () => {
  const PATH = (v) => ({ tagId: EC_TAGS.EC_TAG_CATEGORY_PATH, humanValue: v });
  const parse = (opcode, tags) => client._parseCategoryResult({ opcode, tags });

  it('treats a refused path as a partial success', () => {
    // EC_OP_FAILED + a path tag means everything except the path was applied
    // and aMule kept its own (amule-org/amule#1213). Treating it as a failure
    // would report a successful rename as failed whenever a category's path
    // cannot be created on the aMule host — routine with Docker mounts.
    const result = parse(EC_OPCODES.EC_OP_FAILED, [CAT(1), PATH('/incoming')]);
    assert.equal(result.success, true);
    assert.equal(result.applied, 'partial');
    assert.equal(result.reason, CATEGORY_REASON.PATH_REJECTED);
    assert.equal(result.keptPath, '/incoming');
  });

  it('treats an unknown category as a hard failure', () => {
    const result = parse(EC_OPCODES.EC_OP_FAILED, [CAT(28), STR('No such category.')]);
    assert.equal(result.success, false);
    assert.equal(result.reason, CATEGORY_REASON.NO_SUCH_CATEGORY);
  });
});
