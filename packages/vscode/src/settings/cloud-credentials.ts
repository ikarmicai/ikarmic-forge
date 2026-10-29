import type * as vscode from 'vscode';

/**
 * AWS access keys for Bedrock, kept in the editor's secret storage like every other key and put in the environment
 * when a run starts, where core reads them. A saved value wins over one already in the environment, as a saved provider
 * key does. A value is never shown, logged or sent back to the page.
 */
export interface AwsCredentialField {
  id: 'accessKeyId' | 'secretAccessKey' | 'sessionToken';
  env: 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY' | 'AWS_SESSION_TOKEN';
  label: string;
  help: string;
  optional?: boolean;
}

export const AWS_CREDENTIALS: readonly AwsCredentialField[] = [
  { id: 'accessKeyId', env: 'AWS_ACCESS_KEY_ID', label: 'Access key ID', help: 'It starts with AKIA for a long-lived key or ASIA for a temporary one.' },
  { id: 'secretAccessKey', env: 'AWS_SECRET_ACCESS_KEY', label: 'Secret access key', help: 'Shown once when the key was created.' },
  { id: 'sessionToken', env: 'AWS_SESSION_TOKEN', label: 'Session token (optional)', help: 'Only for temporary keys.', optional: true },
];

export interface CloudCredentialStore {
  get(id: string): Promise<string | undefined>;
  /** An empty value removes it. */
  set(id: string, value: string): Promise<void>;
}

const known = (id: string): boolean => AWS_CREDENTIALS.some((c) => c.id === id);

export function createCloudCredentialStore(secrets: vscode.SecretStorage): CloudCredentialStore {
  // Provider keys use `ikarmic-forge:<provider>` and MCP secrets `forge.mcp:`; this prefix cannot collide with either.
  const keyFor = (id: string): string => `forge.cloud:aws:${id}`;
  return {
    async get(id) {
      return known(id) ? secrets.get(keyFor(id)) : undefined;
    },
    async set(id, value) {
      if (!known(id)) throw new Error(`${id} is not a cloud credential Forge keeps.`);
      if (value) await secrets.store(keyFor(id), value);
      else await secrets.delete(keyFor(id));
    },
  };
}

/** Put what is saved in `env`. Nothing saved leaves `env` as it was. */
export async function applyCloudCredentials(store: CloudCredentialStore, env: Record<string, string | undefined> = process.env): Promise<void> {
  for (const field of AWS_CREDENTIALS) {
    const value = await store.get(field.id);
    if (value) env[field.env] = value;
  }
}

/** The ids that have a saved value, never the values. */
export async function savedCloudCredentials(store: CloudCredentialStore): Promise<string[]> {
  const out: string[] = [];
  for (const field of AWS_CREDENTIALS) if (await store.get(field.id)) out.push(field.id);
  return out;
}

/** A sentence for what is wrong with a set of values, or undefined. The sentence names a field, never a value. */
export function cloudCredentialProblem(values: Readonly<Record<string, string | undefined>>): string | undefined {
  for (const field of AWS_CREDENTIALS) {
    if (/\s/.test((values[field.id] ?? '').trim())) return `${field.label} cannot have spaces or line breaks.`;
  }
  for (const field of AWS_CREDENTIALS) {
    if (!field.optional && !(values[field.id] ?? '').trim()) return `Enter the ${field.label}.`;
  }
  return undefined;
}
