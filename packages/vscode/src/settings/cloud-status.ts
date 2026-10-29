/**
 * What Forge finds for the three providers that use a cloud account rather than a key it stores: AWS Bedrock, Google
 * Vertex AI and Azure OpenAI. Core reads their credentials from environment variables, and a key saved on the API keys
 * page reaches the same variables when a run starts, so the caller passes both together and this says in words what is
 * set and what is missing. It never returns a value, only variable names and, for a region, a
 * project or a location, the setting the person chose. Pure (no `vscode`).
 */
export interface CloudProviderStatus {
  provider: string;
  /** `ok`: ready. `bad`: will fail. `note`: may work through the account's usual sign-in. */
  tone: 'ok' | 'bad' | 'note';
  text: string;
}

type Env = Readonly<Record<string, string | undefined>>;
const has = (env: Env, name: string): boolean => Boolean(env[name]?.trim());
const val = (env: Env, name: string): string => env[name]!.trim();

function bedrock(env: Env): CloudProviderStatus {
  const region = has(env, 'AWS_REGION') ? val(env, 'AWS_REGION') : 'us-east-1';
  const where = ` Region: ${region}${has(env, 'AWS_REGION') ? '' : ' (the default)'}.`;
  if (has(env, 'AWS_BEARER_TOKEN_BEDROCK')) return { provider: 'AWS Bedrock', tone: 'ok', text: `Using a Bedrock API key: the one saved above, or AWS_BEARER_TOKEN_BEDROCK.${where}` };
  const id = has(env, 'AWS_ACCESS_KEY_ID');
  const secret = has(env, 'AWS_SECRET_ACCESS_KEY');
  if (id && secret) return { provider: 'AWS Bedrock', tone: 'ok', text: `Using the access keys in AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.${where}` };
  if (id !== secret) {
    const missing = id ? 'AWS_SECRET_ACCESS_KEY' : 'AWS_ACCESS_KEY_ID';
    return { provider: 'AWS Bedrock', tone: 'bad', text: `${missing} is not set. The two access key variables only work together, so Forge ignores the one that is.${where}` };
  }
  return {
    provider: 'AWS Bedrock',
    tone: 'note',
    text: `No Bedrock API key (saved above or in the environment) and no access keys, so Forge uses your usual AWS sign-in (a profile or single sign-on), if you have one.${where}`,
  };
}

function vertex(env: Env): CloudProviderStatus {
  if (!has(env, 'GOOGLE_VERTEX_PROJECT')) {
    return { provider: 'Google Vertex AI', tone: 'bad', text: 'GOOGLE_VERTEX_PROJECT is not set. Vertex needs a project. Set it, or choose one under Advanced.' };
  }
  const location = has(env, 'GOOGLE_VERTEX_LOCATION') ? val(env, 'GOOGLE_VERTEX_LOCATION') : 'us-central1 (the default)';
  const signIn = has(env, 'GOOGLE_APPLICATION_CREDENTIALS')
    ? `the key file ${val(env, 'GOOGLE_APPLICATION_CREDENTIALS')}`
    : 'the Google credentials set up on this machine, for example from gcloud auth application-default login';
  return { provider: 'Google Vertex AI', tone: 'ok', text: `Project: ${val(env, 'GOOGLE_VERTEX_PROJECT')}. Location: ${location}. It signs in with ${signIn}.` };
}

function azure(env: Env): CloudProviderStatus {
  const problems: string[] = [];
  if (!has(env, 'AZURE_API_KEY')) problems.push('No Azure key. Save one above, or set AZURE_API_KEY.');
  if (!has(env, 'AZURE_RESOURCE_NAME') && !has(env, 'AZURE_OPENAI_BASE_URL')) problems.push('Set AZURE_RESOURCE_NAME or AZURE_OPENAI_BASE_URL.');
  if (problems.length) return { provider: 'Azure OpenAI', tone: 'bad', text: problems.join(' ') };
  const where = has(env, 'AZURE_OPENAI_BASE_URL') ? 'the address in AZURE_OPENAI_BASE_URL' : `the resource ${val(env, 'AZURE_RESOURCE_NAME')}`;
  return { provider: 'Azure OpenAI', tone: 'ok', text: `Using the Azure key (saved above, or AZURE_API_KEY) with ${where}.` };
}

export function cloudProviderStatus(env: Env): CloudProviderStatus[] {
  return [bedrock(env), vertex(env), azure(env)];
}
