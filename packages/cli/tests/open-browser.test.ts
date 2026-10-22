import { describe, expect, it } from 'vitest';

import { browserCommand } from '../src/open-browser.js';

describe('browserCommand', () => {
  it('passes the address as one argument, with no shell involved', () => {
    const url = 'https://auth.example.com/authorize?a=1&b=2;calc';
    expect(browserCommand('win32', url)).toEqual({ command: 'explorer.exe', args: [url] });
    expect(browserCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(browserCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
  });

  it('opens only http and https addresses', () => {
    for (const bad of ['file:///etc/passwd', 'calc://run', 'javascript:alert(1)', 'ms-settings:']) {
      expect(browserCommand('win32', bad)).toBeUndefined();
    }
  });
});
