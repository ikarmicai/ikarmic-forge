import { describe, expect, it } from 'vitest';

import { formatMessage, makeTranslator, parseLanguage } from '../src/l10n-core.js';

describe('formatMessage', () => {
  it('fills {n} placeholders and leaves unknown ones', () => {
    expect(formatMessage('{0} of {1} and {2}', [3, 'x'])).toBe('3 of x and {2}');
  });
});

describe('parseLanguage', () => {
  it('accepts the shipped languages and treats anything else as auto', () => {
    expect(parseLanguage('es')).toBe('es');
    expect(parseLanguage('zh-cn')).toBe('zh-cn');
    expect(parseLanguage('en')).toBe('en');
    expect(parseLanguage('klingon')).toBe('auto');
    expect(parseLanguage(undefined)).toBe('auto');
  });
});

describe('makeTranslator', () => {
  const host = (m: string) => `host:${m}`;

  it('auto hands the message to the host (VS Code display language)', () => {
    expect(makeTranslator('auto', undefined, host)('Save')).toBe('host:Save');
  });

  it('en ignores the display language and returns English with placeholders filled', () => {
    expect(makeTranslator('en', undefined, host)('Saved {0}', 'a')).toBe('Saved a');
  });

  it('a chosen language uses its bundle, filling placeholders, and falls back to English for a missing message', () => {
    const tr = makeTranslator('es', { Save: 'Guardar', 'Saved {0}': 'Guardado {0}' }, host);
    expect(tr('Save')).toBe('Guardar');
    expect(tr('Saved {0}', 'a')).toBe('Guardado a');
    expect(tr('Other {0}', 'b')).toBe('Other b');
  });

  it('a chosen language whose bundle failed to load falls back to English, not the host', () => {
    expect(makeTranslator('es', undefined, host)('Save')).toBe('Save');
  });
});
