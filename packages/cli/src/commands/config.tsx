import React, { useEffect, useState } from 'react';
import { Box, Text, render, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { readFile, writeFile } from 'node:fs/promises';

import {
  BUILTIN_TOOLS,
  MODEL_CATALOG,
  SUPPORTED_PROVIDERS,
  exportSettings,
  importSettings,
  listSpecialists,
  loadForgeConfigFile as coreLoad,
  loadToolSandboxConfig,
  saveForgeConfigFile as coreSave,
  saveSpecialistsToConfig,
  saveToolSandboxConfig,
} from '@ikarmic/forge-core';
import type { CredentialStore, ForgeConfigFile, ProviderName, SerializedToolSandbox, SpecialistConfig } from '@ikarmic/forge-core';

export interface ConfigWizardProps {
  loadForgeConfigFile: typeof coreLoad;
  saveForgeConfigFile: typeof coreSave;
  credentialStore: CredentialStore;
  onExit: () => void;
}

type Step = 'provider' | 'model' | 'reasoningEffort' | 'apiKey' | 'agents' | 'permissions' | 'display' | 'exportImport' | 'done';

export function ConfigWizard(props: ConfigWizardProps): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('provider');
  const [provider, setProvider] = useState<ProviderName | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [agents, setAgents] = useState<SpecialistConfig[]>(() => [...listSpecialists()]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [exportImportMsg, setExportImportMsg] = useState<string | null>(null);
  const [denyTools, setDenyTools] = useState<string[]>([]);
  const [permissionsMsg, setPermissionsMsg] = useState<string | null>(null);

  useEffect(() => {
    loadToolSandboxConfig(process.cwd(), { trustedProjectSettings: false }).then(({ sandbox }) => {
      setDenyTools(sandbox.denyTools ?? []);
    });
  }, []);

  if (step === 'provider') {
    return (
      <Box flexDirection="column">
        <Text bold>Provider</Text>
        <SelectInput
          items={SUPPORTED_PROVIDERS.map((p) => ({ label: p, value: p }))}
          onSelect={(item: { value: ProviderName }) => {
            setProvider(item.value);
            setStep('model');
          }}
        />
      </Box>
    );
  }

  if (step === 'model' && provider) {
    const entries = MODEL_CATALOG[provider];
    return (
      <Box flexDirection="column">
        <Text bold>Model ({provider})</Text>
        <SelectInput
          items={entries.map((e) => ({ label: e.label, value: e.id }))}
          onSelect={async (item: { value: string }) => {
            await props.saveForgeConfigFile({ provider, model: item.value });
            setStep('reasoningEffort');
          }}
        />
      </Box>
    );
  }

  if (step === 'reasoningEffort') {
    const options = [
      { label: '(provider default)', value: '' },
      { label: 'None', value: 'none' },
      { label: 'Minimal', value: 'minimal' },
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
      { label: 'Extra high', value: 'xhigh' },
    ];
    return (
      <Box flexDirection="column">
        <Text bold>Reasoning effort</Text>
        <SelectInput
          items={options}
          onSelect={async (item: { value: string }) => {
            await props.saveForgeConfigFile({
              ...(item.value ? { reasoningEffort: item.value as ForgeConfigFile['reasoningEffort'] } : {}),
            });
            setStep('apiKey');
          }}
        />
      </Box>
    );
  }

  if (step === 'apiKey' && provider) {
    return (
      <Box flexDirection="column">
        <Text bold>API key for {provider}</Text>
        <TextInput
          value={keyInput}
          onChange={setKeyInput}
          mask="*"
          onSubmit={async (value: string) => {
            if (value) await props.credentialStore.set(provider, value);
            setStep('agents');
          }}
        />
        <Text color="gray">Press Enter to skip</Text>
      </Box>
    );
  }

  if (step === 'agents') {
    return (
      <Box flexDirection="column">
        <Text bold>Agents ({agents.length} custom)</Text>
        {agents.map((a) => (
          <Text key={a.id}>
            - {a.id}: {a.description}
          </Text>
        ))}
        {agentError && <Text color="red">{agentError}</Text>}
        <SelectInput
          items={[
            { label: 'Save and continue', value: 'save' },
            { label: 'Skip (no changes)', value: 'skip' },
          ]}
          onSelect={async (item: { value: string }) => {
            if (item.value === 'save') {
              try {
                await saveSpecialistsToConfig(agents);
                setStep('permissions');
              } catch (err) {
                setAgentError((err as Error).message);
              }
            } else {
              setStep('permissions');
            }
          }}
        />
      </Box>
    );
  }

  if (step === 'permissions') {
    const items = BUILTIN_TOOLS.map((t) => ({
      label: (denyTools.includes(t.name) ? '[x] ' : '[ ] ') + t.name,
      value: t.name,
    }));
    return (
      <Box flexDirection="column">
        <Text bold>Permissions: toggle tools to deny (Enter to toggle, select &quot;Done&quot; to save)</Text>
        {permissionsMsg && <Text color="green">{permissionsMsg}</Text>}
        <SelectInput
          items={[...items, { label: 'Done', value: '__done__' }]}
          onSelect={async (item: { value: string }) => {
            if (item.value === '__done__') {
              const sandbox: SerializedToolSandbox = denyTools.length > 0 ? { denyTools } : {};
              await saveToolSandboxConfig(sandbox);
              setPermissionsMsg('Saved.');
              setStep('display');
              return;
            }
            setDenyTools((prev) =>
              prev.includes(item.value) ? prev.filter((t) => t !== item.value) : [...prev, item.value]
            );
          }}
        />
      </Box>
    );
  }

  if (step === 'display') {
    const options = [
      { label: 'Review first (expanded blocks, reasoning shown)', value: 'review' },
      { label: 'High autonomy (collapsed blocks, reasoning hidden)', value: 'autonomy' },
      { label: 'Continue without changing', value: 'skip' },
    ];
    return (
      <Box flexDirection="column">
        <Text bold>Display</Text>
        <SelectInput
          items={options}
          onSelect={async (item: { value: string }) => {
            if (item.value === 'review') {
              await props.saveForgeConfigFile({ display: { detail: 'full', showReasoning: true } });
            } else if (item.value === 'autonomy') {
              await props.saveForgeConfigFile({ display: { detail: 'compact', showReasoning: false } });
            }
            setStep('exportImport');
          }}
        />
      </Box>
    );
  }

  if (step === 'exportImport') {
    const options = [
      { label: 'Export settings to ./forge-settings.json', value: 'export' },
      { label: 'Import settings from ./forge-settings.json', value: 'import' },
      { label: 'Done', value: 'done' },
    ];
    return (
      <Box flexDirection="column">
        <Text bold>Export / Import</Text>
        {exportImportMsg && <Text color="green">{exportImportMsg}</Text>}
        <SelectInput
          items={options}
          onSelect={async (item: { value: string }) => {
            if (item.value === 'export') {
              const data = await exportSettings({});
              await writeFile('./forge-settings.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
              setExportImportMsg('Exported to ./forge-settings.json');
              return;
            }
            if (item.value === 'import') {
              try {
                const raw = await readFile('./forge-settings.json', 'utf8');
                await importSettings(JSON.parse(raw), {});
                setExportImportMsg('Imported from ./forge-settings.json');
              } catch (err) {
                setExportImportMsg('Import failed: ' + (err as Error).message);
              }
              return;
            }
            setStep('done');
            props.onExit();
            exit();
          }}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Text color="green">Saved.</Text>
    </Box>
  );
}

/** Renders the wizard and resolves once the user finishes. */
export async function runConfigWizard(deps: { credentialStore: CredentialStore }): Promise<void> {
  const { waitUntilExit } = render(
    <ConfigWizard
      loadForgeConfigFile={coreLoad}
      saveForgeConfigFile={coreSave}
      credentialStore={deps.credentialStore}
      onExit={() => {}}
    />
  );
  await waitUntilExit();
}
