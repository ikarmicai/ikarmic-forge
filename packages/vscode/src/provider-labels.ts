import type { ProviderName } from '@ikarmic/forge-core';

/** Display names, shared by the Settings page and the chat's model picker. */
export const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  ollama: 'Ollama (local)',
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
  bedrock: 'Amazon Bedrock',
  vertex: 'Google Vertex AI',
  azure: 'Azure OpenAI',
  lmstudio: 'LM Studio (local)',
  'openai-compatible': 'OpenAI-compatible endpoint',
};
