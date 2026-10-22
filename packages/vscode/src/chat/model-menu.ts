/** Price and window hints and favourites for the chat's model picker. vscode-free so it is unit-testable. */
import { getModelWindowTokens, lookupPricing } from '@ikarmic/forge-core';
import type { ModelConfig } from '@ikarmic/forge-core';

export const MAX_FAVOURITES = 30;

export function favouriteKey(provider: string, model: string): string {
  return `${provider}|${model}`;
}

/** Add to the front, or remove when already there; capped so the list stays a shortlist. */
export function toggleFavourite(list: readonly string[], provider: string, model: string): string[] {
  const key = favouriteKey(provider, model);
  return list.includes(key) ? list.filter((k) => k !== key) : [key, ...list].slice(0, MAX_FAVOURITES);
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}K`;
}

function price(usd: number): string {
  return `$${+usd.toFixed(usd < 1 ? 2 : 1)}`;
}

/** A short line for the picker row: context window, then input/output price per million tokens when known. */
export function modelHint(provider: string, model: string): { text: string; title: string } {
  const cfg = { provider, model } as ModelConfig;
  const window = getModelWindowTokens(cfg);
  const p = lookupPricing(cfg);
  const parts = [`${tokens(window)}`];
  const titles = [`Context window ${window.toLocaleString('en-US')} tokens.`];
  if (p.known && (p.input > 0 || p.output > 0)) {
    parts.push(`${price(p.input)}/${price(p.output)}`);
    titles.push(`${price(p.input)} per million input tokens, ${price(p.output)} per million output tokens.`);
  }
  return { text: parts.join(' · '), title: titles.join(' ') };
}
