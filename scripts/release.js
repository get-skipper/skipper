#!/usr/bin/env node
'use strict';

/**
 * Release script — bumps version across all packages, commits, and tags.
 *
 * Usage:
 *   node scripts/release.js <version>
 *   pnpm release 0.2.0
 *
 * After running, push the tag to trigger the publish workflow:
 *   git push && git push --tags
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: pnpm release <version>  (e.g. pnpm release 0.2.0)');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');
const packageDirs = fs.readdirSync(packagesDir).map((name) => path.join(packagesDir, name));

const allDirs = [root, ...packageDirs];

for (const dir of allDirs) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.private) {
    // Update workspace dep references even in private root
    let changed = false;
    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (!pkg[depField]) continue;
      for (const [dep, val] of Object.entries(pkg[depField])) {
        if (dep.startsWith('@skipper/') && val.startsWith('workspace:')) {
          // workspace refs stay as-is — pnpm resolves them during publish
        }
      }
    }
    continue;
  }

  pkg.version = version;

  // Update @skipper/* workspace deps to the new version
  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depField]) continue;
    for (const dep of Object.keys(pkg[depField])) {
      if (dep.startsWith('@skipper/')) {
        pkg[depField][dep] = `workspace:^${version}`;
      }
    }
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`  bumped ${pkg.name ?? dir} → ${version}`);
}

execSync(`git add -A`, { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "chore: release v${version}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag v${version}`, { cwd: root, stdio: 'inherit' });

console.log(`\nDone! Push with:\n  git push && git push --tags`);
