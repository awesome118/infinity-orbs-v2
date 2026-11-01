import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('inline main-game post places Continue playing last and expands the infinity animation', () => {
  const splash = source('src/client/splash.tsx');
  const styles = source('src/client/post-revamp.css');
  const footerIndex = splash.indexOf('className="io-launch-footer"');
  const ctaIndex = splash.indexOf('className="io-post-conversion io-main-cta"');
  assert.ok(footerIndex >= 0 && ctaIndex >= 0, 'main post footer and CTA should both exist');
  assert.ok(footerIndex < ctaIndex, 'the Continue playing action should follow the metadata');
  assert.match(styles, /#root\.io-inline-post \.io-launch-orb-stage\s*\{[^}]*flex:\s*1 1 clamp\(76px, 15vh, 116px\)[^}]*min-height:\s*76px/s);
  assert.match(styles, /#root\.io-inline-post \.io-main-cta\s*\{[^}]*margin-top:\s*auto/s);
  assert.match(styles, /#root\.io-inline-post \.io-launch-footer\s*\{[^}]*margin-top:\s*9px/s);
});
