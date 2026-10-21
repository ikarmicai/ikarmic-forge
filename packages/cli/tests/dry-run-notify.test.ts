import { describe, expect, it } from 'vitest';

import { defaultNotifyCommand } from '../src/notify.js';
import { buildSandbox, DRY_RUN_DENIED_TOOLS, parseOptions } from '../src/options.js';

const argv = (...a: string[]) => ['node', 'forge', ...a];

describe('--dry-run', () => {
  it('is off by default and adds no sandbox', () => {
    const o = parseOptions(argv('task')).options;
    expect(o.dryRun).toBe(false);
    expect(buildSandbox(o)).toBeUndefined();
  });

  it('denies every mutating tool and keeps the user deny list', () => {
    const o = parseOptions(argv('--dry-run', '--deny-tools', 'fetch_url', 'task')).options;
    expect(o.dryRun).toBe(true);
    const deny = buildSandbox(o)?.denyTools ?? [];
    for (const t of DRY_RUN_DENIED_TOOLS) expect(deny).toContain(t);
    expect(deny).toContain('fetch_url');
  });
});

describe('--notifications', () => {
  it('parses, and a custom command implies notifications', () => {
    expect(parseOptions(argv('task')).options.notifications).toBe(false);
    expect(parseOptions(argv('--notifications', 'task')).options.notifications).toBe(true);
    const o = parseOptions(argv('--notifications-command', 'say done', 'task')).options;
    expect([o.notifications, o.notificationsCommand]).toEqual([true, 'say done']);
  });

  it('has a backend per desktop OS and none elsewhere', () => {
    expect(defaultNotifyCommand('darwin')?.cmd).toBe('osascript');
    expect(defaultNotifyCommand('linux')?.cmd).toBe('notify-send');
    expect(defaultNotifyCommand('win32')?.cmd).toBe('powershell');
    expect(defaultNotifyCommand('freebsd')).toBeNull();
  });
});
