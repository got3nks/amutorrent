const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const notificationManager = require('../lib/NotificationManager');
const { importStatic } = require('./helpers/importEsm');

// Telegram forum topics (#83). Apprise maps ?topic= to message_thread_id, and
// rejects a non-integer topic outright — which fails the whole notification
// rather than falling back to General — so the value is guarded on the way out.
const build = (config) => notificationManager._buildAppriseUrl({ type: 'telegram', config });
const BASE = { bot_token: 'TOK', chat_id: '-100123' };

describe('Telegram notification URL', () => {
  it('omits the topic when it is absent, empty or blank', () => {
    const expected = 'tgram://TOK/-100123';
    assert.equal(build(BASE), expected);
    assert.equal(build({ ...BASE, topic: '' }), expected);
    assert.equal(build({ ...BASE, topic: '   ' }), expected);
    assert.equal(build({ ...BASE, topic: null }), expected);
  });

  it('appends a numeric topic as a query parameter', () => {
    assert.equal(build({ ...BASE, topic: '42' }), 'tgram://TOK/-100123?topic=42');
  });

  it('coerces a numeric topic given as a number', () => {
    assert.equal(build({ ...BASE, topic: 42 }), 'tgram://TOK/-100123?topic=42');
  });

  it('drops a non-numeric topic rather than letting Apprise reject the URL', () => {
    // An invalid Apprise URL is silently filtered out of the send list, so the
    // notification would vanish. Better to deliver it to General.
    assert.equal(build({ ...BASE, topic: 'abc' }), 'tgram://TOK/-100123');
  });

  it('still requires a chat id', () => {
    assert.equal(build({ bot_token: 'TOK', topic: '42' }), null);
  });
});

describe('notification service schema validation', () => {
  let validateServiceConfig;

  const load = async () => {
    if (!validateServiceConfig) {
      ({ validateServiceConfig } = await importStatic('utils', 'notificationServiceSchemas.js'));
    }
    return validateServiceConfig;
  };

  it('treats the topic as optional', async () => {
    const v = await load();
    assert.equal(v('telegram', BASE).valid, true);
    assert.equal(v('telegram', { ...BASE, topic: '' }).valid, true);
    assert.equal(v('telegram', { ...BASE, topic: '   ' }).valid, true);
  });

  it('accepts a numeric topic', async () => {
    const v = await load();
    assert.equal(v('telegram', { ...BASE, topic: '42' }).valid, true);
  });

  it('rejects a non-numeric topic with a usable message', async () => {
    const v = await load();
    const result = v('telegram', { ...BASE, topic: 'abc' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('Topic ID must be a number'));
  });

  it('rejects topics that are numeric-ish but not integers', async () => {
    const v = await load();
    assert.equal(v('telegram', { ...BASE, topic: '4 2' }).valid, false);
    assert.equal(v('telegram', { ...BASE, topic: '-5' }).valid, false);
  });

  it('still enforces required fields, here and for other services', async () => {
    const v = await load();
    assert.equal(v('telegram', { bot_token: 'TOK' }).valid, false);
    assert.equal(v('discord', {}).valid, false);
  });
});
