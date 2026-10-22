import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { agentDirs } from '../src/agent-dirs.js';

describe('agentDirs', () => {
  it('user folder first, then the workspace folder, so a project agent replaces a user agent', () => {
    expect(agentDirs('/home/u', '/ws', true)).toEqual([join('/home/u', '.forge', 'agents'), join('/ws', '.forge', 'agents')]);
  });

  it('an untrusted workspace contributes nothing: its prompts would steer the model', () => {
    expect(agentDirs('/home/u', '/ws', false)).toEqual([join('/home/u', '.forge', 'agents')]);
  });
});
