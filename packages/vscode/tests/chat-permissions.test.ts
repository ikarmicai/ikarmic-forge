import { describe, expect, it } from 'vitest';

import { permissionExtras } from '../src/chat/run-extras.js';

describe('permissionExtras', () => {
  it('passes the shared config permission rules to the run as permissionRules', () => {
    const rules = { bash: { '*': 'ask', 'git status *': 'allow' }, read: 'deny' } as const;
    expect(permissionExtras({ permission: rules })).toEqual({ permissionRules: rules });
  });

  it('adds nothing when the config has no rules or an empty object', () => {
    expect(permissionExtras({})).toEqual({});
    expect(permissionExtras({ permission: {} })).toEqual({});
  });
});
