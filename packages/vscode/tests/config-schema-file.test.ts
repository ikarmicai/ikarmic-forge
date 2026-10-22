import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FORGE_CONFIG_SCHEMA } from '@ikarmic/forge-core';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  contributes: { jsonValidation?: Array<{ fileMatch: string | string[]; url: string }> };
};

describe('config JSON schema shipped with the extension', () => {
  it('the file in schemas/ is the schema core exports (regenerate it when core changes)', () => {
    const onDisk = JSON.parse(readFileSync(join(root, 'schemas', 'forge-config.schema.json'), 'utf8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(FORGE_CONFIG_SCHEMA)));
  });

  it('package.json attaches it to the Forge config files and the url exists', () => {
    const entry = manifest.contributes.jsonValidation?.find((e) => e.url.endsWith('forge-config.schema.json'));
    expect(entry).toBeDefined();
    const matches = ([] as string[]).concat(entry!.fileMatch);
    expect(matches).toContain('**/.forge/config.json');
    expect(() => readFileSync(join(root, entry!.url), 'utf8')).not.toThrow();
  });
});
