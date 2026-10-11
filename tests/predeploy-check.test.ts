import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const helperPath = resolve(process.cwd(), 'scripts/predeploy-check.mjs');
const currentNodeMajor = Number(process.versions.node.split('.')[0]);

function createFixture(options: {
  packageVersion?: string;
  lockVersion?: string;
  devvitName?: string;
  sourceText?: string;
  createSourceDir?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'infinity-orbs-preflight-'));
  const scriptDir = join(root, 'scripts');
  mkdirSync(scriptDir, { recursive: true });
  copyFileSync(helperPath, join(scriptDir, 'predeploy-check.mjs'));

  const packageVersion = options.packageVersion ?? '1.2.2';
  const lockVersion = options.lockVersion ?? packageVersion;
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'infinity-orbs',
    version: packageVersion,
    engines: { node: '>=24.0.0' },
  }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
    name: 'infinity-orbs',
    version: lockVersion,
    packages: {
      '': { name: 'infinity-orbs', version: lockVersion },
    },
  }));
  writeFileSync(join(root, 'devvit.json'), JSON.stringify({
    name: options.devvitName ?? 'infinity-orbs',
  }));

  if (options.createSourceDir !== false) {
    const sourceDir = join(root, 'src');
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'entry.ts'), options.sourceText ?? 'export const healthy = true;\n');
  }

  return {
    root,
    run() {
      return spawnSync(process.execPath, [join(scriptDir, 'predeploy-check.mjs')], {
        cwd: root,
        encoding: 'utf8',
      });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('deployment preflight accepts aligned manifests on supported Node.js', {
  skip: currentNodeMajor < 24 ? 'Project release checks require Node.js 24+' : false,
}, () => {
  const fixture = createFixture();
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /manifests\/version aligned/);
  } finally {
    fixture.cleanup();
  }
});

test('deployment preflight rejects a package-lock version mismatch', () => {
  const fixture = createFixture({ packageVersion: '1.2.2', lockVersion: '1.2.1' });
  try {
    const result = fixture.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /versions do not match/);
  } finally {
    fixture.cleanup();
  }
});

test('deployment preflight rejects the forbidden Devvit transaction-read pattern', () => {
  const fixture = createFixture({ sourceText: 'const state = tx.get("player");\n' });
  try {
    const result = fixture.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /forbidden transaction read pattern/);
  } finally {
    fixture.cleanup();
  }
});

test('deployment preflight rejects a missing or empty source tree', () => {
  const fixture = createFixture({ createSourceDir: false });
  try {
    const result = fixture.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not scan required source directory|No supported source files were scanned/);
  } finally {
    fixture.cleanup();
  }
});

test('deployment preflight rejects a Devvit app name that differs from package.json', () => {
  const fixture = createFixture({ devvitName: 'different-app' });
  try {
    const result = fixture.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Devvit app name/);
  } finally {
    fixture.cleanup();
  }
});


test('deployment workflow is manual, main-only, and installs only to the development subreddit', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/deploy.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_install:[\s\S]*?default:\s*false/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /^\s*npx devvit upload --version "\$REQUESTED_VERSION"$/m);
  assert.match(workflow, /^\s*npx devvit install r\/infinity_orbs_dev\b/m);
  assert.doesNotMatch(workflow, /^\s*npx devvit install r\/infinityorbs\b/m);
  assert.doesNotMatch(workflow, /^\s*npx devvit publish\b/m);
});

test('review submission workflow never installs to a subreddit', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_publish:[\s\S]*?default:\s*false/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /^\s*npx devvit publish --version\b/m);
  assert.doesNotMatch(workflow, /^\s*npx devvit install\b/m);
});

test('production workflow requires explicit post-approval confirmation and only installs production', () => {
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/install-production.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /confirm_approved:[\s\S]*?default:\s*false/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /already-approved Devvit version/i);
  assert.match(workflow, /^\s*npx devvit install r\/infinityorbs\b/m);
  assert.doesNotMatch(workflow, /^\s*npx devvit install r\/infinity_orbs_dev\b/m);
  assert.doesNotMatch(workflow, /^\s*npx devvit (upload|publish)\b/m);
});
