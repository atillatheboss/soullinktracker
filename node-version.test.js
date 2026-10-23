const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPatchedNodeVersion } = require('./check-node-version');

test('rejects vulnerable and unsupported Node.js releases', () => {
  for (const version of ['20.19.0', '22.23.3', '24.22.0', '26.4.0', '26.12.0', '25.9.0', 'invalid']) {
    assert.equal(isPatchedNodeVersion(version), false, version);
  }
});

test('accepts the fixed releases and later patches in supported lines', () => {
  for (const version of ['22.23.4', 'v22.24.0', '24.22.1', '24.23.0', '26.12.1', '26.13.0']) {
    assert.equal(isPatchedNodeVersion(version), true, version);
  }
});
