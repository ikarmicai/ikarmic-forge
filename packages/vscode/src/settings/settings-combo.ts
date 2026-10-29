/**
 * Lists behind the Settings page's combo boxes: pure (no `vscode`), bundled into the page as part of
 * `window.ForgeSettings`. A list only suggests; any typed value stays valid, so nothing here validates.
 */

export interface ComboOption { label: string; value: string }
export interface ComboGroup { label: string; options: ComboOption[] }

/** Groups whose options match `query` on the readable label or the stored value (case-insensitive). An empty query keeps everything. */
export function filterGroups(groups: ComboGroup[], query: string): ComboGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length > 0);
}

/** True when `value` is exactly the stored value of one option. */
export function isKnownValue(groups: ComboGroup[], value: string): boolean {
  return groups.some((g) => g.options.some((o) => o.value === value));
}

export interface ModelGroupsInput {
  aliases: Record<string, string>;
  /** The main model's provider: its models are listed as bare ids. */
  mainProvider: string;
  lists: Record<string, { models: { id: string; label: string }[] } | undefined>;
  catalog: Record<string, { id: string; label: string }[]>;
  providers: string[];
  labelOf: (provider: string) => string;
  /** Only the main provider's bare ids: for a field read as a plain model id, with no alias or provider:model handling. */
  bareOnly?: boolean;
}

/** The person's aliases, then the main provider's models (bare ids), then other providers' as `provider:id`. */
export function modelGroups(input: ModelGroupsInput): ComboGroup[] {
  const groups: ComboGroup[] = [];
  const aliasNames = Object.keys(input.aliases);
  if (aliasNames.length && !input.bareOnly) groups.push({ label: 'Your aliases', options: aliasNames.map((name) => ({ label: input.aliases[name]!, value: name })) });
  const modelsOf = (p: string) => input.lists[p]?.models ?? input.catalog[p] ?? [];
  const ordered = (input.bareOnly ? [input.mainProvider] : [input.mainProvider, ...input.providers.filter((p) => p !== input.mainProvider)]).filter((p) => p && input.providers.includes(p));
  for (const p of ordered) {
    const models = modelsOf(p);
    if (!models.length) continue;
    groups.push({ label: input.labelOf(p), options: models.map((m) => ({ label: m.label, value: p === input.mainProvider ? m.id : p + ':' + m.id })) });
  }
  return groups;
}

const group = (label: string, options: Array<[string, string]>): ComboGroup => ({ label, options: options.map(([value, text]) => ({ label: text, value })) });

/** Regions that offer Bedrock. */
export const AWS_REGIONS: ComboGroup[] = [
  group('Americas', [
    ['us-east-1', 'US East (N. Virginia)'], ['us-east-2', 'US East (Ohio)'], ['us-west-2', 'US West (Oregon)'],
    ['ca-central-1', 'Canada (Central)'], ['sa-east-1', 'South America (São Paulo)'],
  ]),
  group('Europe', [
    ['eu-west-1', 'Europe (Ireland)'], ['eu-west-2', 'Europe (London)'], ['eu-west-3', 'Europe (Paris)'],
    ['eu-central-1', 'Europe (Frankfurt)'], ['eu-north-1', 'Europe (Stockholm)'],
  ]),
  group('Asia Pacific', [
    ['ap-south-1', 'Asia Pacific (Mumbai)'], ['ap-northeast-1', 'Asia Pacific (Tokyo)'], ['ap-northeast-2', 'Asia Pacific (Seoul)'],
    ['ap-southeast-1', 'Asia Pacific (Singapore)'], ['ap-southeast-2', 'Asia Pacific (Sydney)'],
  ]),
];

/** Vertex AI locations. */
export const VERTEX_LOCATIONS: ComboGroup[] = [
  group('Global', [['global', 'Global (Google chooses)']]),
  group('Americas', [['us-central1', 'US Central (Iowa)'], ['us-east4', 'US East (N. Virginia)'], ['us-west1', 'US West (Oregon)']]),
  group('Europe', [['europe-west1', 'Europe West (Belgium)'], ['europe-west4', 'Europe West (Netherlands)']]),
  group('Asia Pacific', [['asia-northeast1', 'Asia Northeast (Tokyo)'], ['asia-southeast1', 'Asia Southeast (Singapore)']]),
];

/** BCP-47 codes for speech recognition. */
export const VOICE_LANGUAGES: ComboGroup[] = [
  group('English', [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)']]),
  group('Other languages', [
    ['hi-IN', 'Hindi'], ['es-ES', 'Spanish (Spain)'], ['es-MX', 'Spanish (Mexico)'], ['fr-FR', 'French'], ['de-DE', 'German'],
    ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['zh-CN', 'Chinese (Simplified)'],
  ]),
];
