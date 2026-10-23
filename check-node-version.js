// CVE-2026-111497 is fixed in these Node.js releases.
const fixedVersions = new Map([
  [22, [23, 4]],
  [24, [22, 1]],
  [26, [12, 1]],
]);

function isPatchedNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;

  const major = Number(match[1]);
  const minimum = fixedVersions.get(major);
  if (!minimum) return false;

  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]);
}

function assertPatchedNodeVersion() {
  if (isPatchedNodeVersion(process.versions.node)) return;
  throw new Error(
    `Node.js ${process.versions.node} ist wegen CVE-2026-111497 nicht freigegeben. ` +
    'Bitte auf 22.23.4, 24.22.1 oder 26.12.1 (oder eine neuere Version derselben Reihe) aktualisieren.'
  );
}

module.exports = { isPatchedNodeVersion, assertPatchedNodeVersion };
