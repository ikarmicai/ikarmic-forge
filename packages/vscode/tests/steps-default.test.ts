import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

/** A chat run has no step limit unless the person sets one (`forge.maxSteps`, 0 = no limit). */
const src = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the default step limit is none', () => {
  it('is 0 in the manifest and in the code that reads the setting', () => {
    const pkg = JSON.parse(src('../package.json')) as { contributes: { configuration: { properties: Record<string, { default?: unknown }> } } };
    expect(pkg.contributes.configuration.properties['forge.maxSteps']?.default).toBe(0);
    expect(src('../src/config.ts')).toMatch(/maxSteps: Math\.max\(0, Math\.floor\(cfg\.get<number>\('maxSteps'\) \?\? 0\)\)/);
  });

  it('says so in the setting text', () => {
    expect(src('../package.nls.json')).toMatch(/"config\.forge\.maxSteps\.description": "[^"]*No limit unless you set one/);
  });
});

describe('the usage details with no limit', () => {
  it('show the step number alone, not "of" and a missing number', () => {
    const html = chatHtml();
    expect(html).toContain("meterRun.max ? meterRun.iter + ' of ' + meterRun.max : String(meterRun.iter)");
  });
});
