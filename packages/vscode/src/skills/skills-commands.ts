import * as vscode from 'vscode';

import {
  configuredSkillSettings,
  DEFAULT_SKILL_CATALOG_URL,
  discoverSkills,
  loadSkillsCatalog,
  installSkillFromCatalog,
} from '@ikarmic/forge-core';

import { skillPickItems } from './skills-model.js';
import { t } from '../l10n.js';

/** What forge.skills.open receives; only reachable from code now that the tree view is gone. */
type LeafNode = { kind: 'skill'; skill: { source: { path: string } } };

export function registerSkills(context: vscode.ExtensionContext, root: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.skills.open', async (node?: LeafNode) => {
      if (node?.kind === 'skill') await vscode.window.showTextDocument(vscode.Uri.file(node.skill.source.path));
    }),
    vscode.commands.registerCommand('forge.skills.browse', async () => {
      const url = process.env.FORGE_SKILL_CATALOG_URL ?? DEFAULT_SKILL_CATALOG_URL;
      const catalog = await loadSkillsCatalog(url);
      if (!catalog) {
        void vscode.window.showWarningMessage(t('Forge: could not load the skills catalog ({0}).', url));
        return;
      }
      const settings = await configuredSkillSettings();
      const installedNames = new Set((await discoverSkills(root, settings.skillPaths, { otherToolSkills: settings.otherToolSkills }).catch(() => [])).map((s) => s.name));
      const pick = await vscode.window.showQuickPick(skillPickItems(catalog.skills, installedNames), {
        placeHolder: t('Install a skill'),
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!pick) return;
      if (pick.installed) {
        void vscode.window.showInformationMessage(t('Forge: "{0}" is already installed.', pick.entry.name));
        return;
      }
      let reason: string | undefined;
      const installed = await installSkillFromCatalog({ name: pick.entry.name, catalog, onError: (m) => void (reason = m) });
      if (!installed) {
        const base = t('Forge: could not install "{0}".', pick.entry.name);
        void vscode.window.showErrorMessage(reason ? `${base} ${reason}` : base);
        return;
      }
      void vscode.window.showInformationMessage(t('Forge: installed skill "{0}".', pick.entry.name));
    })
  );
}
