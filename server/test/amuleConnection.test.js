const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../lib/logger');
const {
  amuleSecurityOptions,
  normalizeSecurity,
  amuleSecurityHint,
  describeAmuleSecurity
} = require('../lib/amuleConnection');

describe('amuleSecurityOptions', () => {
  it('maps each level to the library options', () => {
    assert.deepEqual(amuleSecurityOptions('compatible'), { encryption: 'prefer', allowLegacyAuth: true });
    assert.deepEqual(amuleSecurityOptions('encrypted'), { encryption: 'require', allowLegacyAuth: true });
    assert.deepEqual(amuleSecurityOptions('strict'), { encryption: 'require', allowLegacyAuth: false });
  });

  it('stays compatible when unset, so saved configs keep connecting', () => {
    for (const value of [undefined, null, '']) {
      assert.deepEqual(amuleSecurityOptions(value), { encryption: 'prefer', allowLegacyAuth: true });
    }
  });

  it('accepts env-style spelling', () => {
    assert.equal(normalizeSecurity(' Strict '), 'strict');
  });

  it('falls back to compatible on an unknown value and warns once', (t) => {
    const warn = t.mock.method(logger, 'warn', () => {});
    assert.equal(normalizeSecurity('paranoid'), 'compatible');
    assert.equal(normalizeSecurity('paranoid'), 'compatible');
    assert.equal(warn.mock.callCount(), 1);
  });

  it('returns a copy the caller can change', () => {
    amuleSecurityOptions('strict').allowLegacyAuth = true;
    assert.equal(amuleSecurityOptions('strict').allowLegacyAuth, false);
  });
});

describe('amuleSecurityHint', () => {
  it('points an old core refusing encryption to Compatible', () => {
    const hint = amuleSecurityHint(new Error('Authentication failed: the core did not negotiate an encrypted channel'));
    assert.match(hint, /before 3\.1/);
    assert.match(hint, /Compatible/);
  });

  it('points a core without SRP to a less strict level', () => {
    const hint = amuleSecurityHint(new Error("Authentication failed: this core does not offer SRP, and the pre-SRP password challenge is offline-crackable by whoever chose the salt. Pass allowLegacyAuth: ['amule'] to permit it for this host."));
    assert.match(hint, /before 3\.3/);
    assert.match(hint, /Encrypted only or Compatible/);
  });

  it('leaves other errors alone', () => {
    assert.equal(amuleSecurityHint(new Error('connect ECONNREFUSED 127.0.0.1:4712')), null);
    assert.equal(amuleSecurityHint(undefined), null);
  });
});

describe('describeAmuleSecurity', () => {
  it('names the cipher and the login', () => {
    const session = {
      encryptionState: { encrypted: true, cipherName: 'chacha20-poly1305' },
      srpAuthenticated: true
    };
    assert.equal(describeAmuleSecurity(session), 'encrypted (ChaCha20-Poly1305), SRP login');
  });

  it('reports a clear connection with the password login', () => {
    const session = { encryptionState: { encrypted: false, cipherName: null }, srpAuthenticated: false };
    assert.equal(describeAmuleSecurity(session), 'not encrypted, password login');
  });

  it('returns null without a session', () => {
    assert.equal(describeAmuleSecurity(undefined), null);
  });
});
