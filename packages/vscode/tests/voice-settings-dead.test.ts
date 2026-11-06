import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXCLUDED_KEYS, SETTING_ROWS } from '../src/settings/settings-rows.js';

// Found 2026-11-06: four voice settings in Settings, Advanced changed nothing. Only the in-page speech engine read them,
// and it is never built (VS Code refuses webviews the microphone): the mic hands off to the system's voice typing,
// which has its own language and behaviour. A setting that does nothing is not shown; the manifest says why.
const DEAD = ['forge.voice.language', 'forge.voice.autoSubmit', 'forge.voice.continuous', 'forge.voice.interimResults'];
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const props = pkg.contributes.configuration.properties;
const nls = JSON.parse(readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
const text = (v: string) => (/^%(.+)%$/.test(v) ? nls[v.slice(1, -1)] : v);

describe('voice settings that the system voice typing does not use', () => {
  it('have no row on the Settings page, and say why they are left out', () => {
    for (const key of DEAD) {
      expect(SETTING_ROWS.find((r) => r.key === key), key).toBeUndefined();
      expect(EXCLUDED_KEYS, key).toContain(key);
    }
  });

  it('are marked deprecated in the manifest, so a saved value gives no error and VS Code says it does nothing', () => {
    for (const key of DEAD) {
      const message = text(props[key].deprecationMessage ?? '');
      expect(message, key).toMatch(/system's voice typing/);
    }
  });

  it('describe the mic as the hand-off it is, not as the Web Speech engine', () => {
    const description = text(props['forge.voice.enabled'].description);
    expect(description).not.toMatch(/Web Speech|SpeechRecognition/);
    expect(description).toMatch(/voice typing/);
    expect(SETTING_ROWS.find((r) => r.key === 'forge.voice.enabled')).toBeDefined();
  });
});
