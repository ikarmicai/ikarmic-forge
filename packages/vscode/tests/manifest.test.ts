import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const c = pkg.contributes;
const REMOVED = ['forge.mcpView', 'forge.skillsView', 'forge.agentsView'];

describe('product icons', () => {
  const root = path.join(__dirname, '..');

  it('has a square PNG marketplace icon of a size the Marketplace accepts', () => {
    expect(pkg.icon).toBe('resources/icon.png');
    const png = readFileSync(path.join(root, pkg.icon));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(128);
    expect(width).toBeLessThanOrEqual(512);
  });

  it('ships every icon the manifest points at, plus the light and dark Settings tab marks', () => {
    for (const v of c.viewsContainers.activitybar) expect(existsSync(path.join(root, v.icon)), v.icon).toBe(true);
    for (const f of ['tab-light.svg', 'tab-dark.svg']) expect(existsSync(path.join(root, 'resources', f)), f).toBe(true);
  });

  it('keeps the brand originals the generated assets come from', () => {
    for (const f of ['mandala-black.png', 'mandala-white.webp']) expect(existsSync(path.join(root, '..', '..', 'docs', 'brand', f)), f).toBe(true);
  });
});

describe('package.json sidebar', () => {
  it('has one Forge icon in the activity bar, with Chat as its only view (Specs and Steering live inside the chat panel)', () => {
    expect(c.views.forge.map((v: { id: string }) => v.id)).toEqual(['forge.chatView']);
    expect(Object.keys(c.views)).toEqual(['forge']);
    expect(c.viewsContainers.activitybar.map((v: { id: string }) => v.id)).toEqual(['forge']);
  });

  it('has no menu entries for removed views', () => {
    const all = JSON.stringify(c.menus);
    for (const id of REMOVED) expect(all).not.toContain(id);
  });

  it('puts a ⚙ Settings action on the chat view title', () => {
    expect(c.menus['view/title']).toContainEqual(expect.objectContaining({ command: 'forge.openSettings', when: 'view == forge.chatView' }));
    expect(c.commands.find((x: { command: string }) => x.command === 'forge.openSettings').icon).toBe('$(gear)');
  });

  it('keeps the spec and steering commands (palette, chat panel) without the tree views', () => {
    const cmds = c.commands.map((x: { command: string }) => x.command);
    for (const k of ['forge.spec.generate', 'forge.spec.approve', 'forge.spec.runTask', 'forge.steering.new', 'forge.steering.toggle']) expect(cmds).toContain(k);
    expect(JSON.stringify(c)).not.toMatch(/forge\.(specs|steering)View|forge-specs/);
  });

  it('keeps the MCP, skills and agents commands', () => {
    const cmds = c.commands.map((x: { command: string }) => x.command);
    for (const k of ['forge.mcp.browse', 'forge.mcp.reload', 'forge.skills.browse', 'forge.agents.run', 'forge.agents.clear']) expect(cmds).toContain(k);
  });
});
