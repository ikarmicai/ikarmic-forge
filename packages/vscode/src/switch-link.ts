export interface SwitchLink {
  model?: string;
  agent?: string;
}

const SAFE = /^[\w./:@+-]{1,200}$/;

function safe(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return SAFE.test(value) ? value : undefined;
}

/**
 * `vscode://ikarmic.ikarmic-forge/switch?model=<model>&agent=<mode>`: the model and mode a link asks for. Anything
 * outside plain id characters is dropped, since the link can come from any web page. vscode-free.
 */
export function parseSwitchLink(path: string, query: string): SwitchLink | undefined {
  if (path !== '/switch') return undefined;
  const params = new URLSearchParams(query);
  const model = safe(params.get('model'));
  const agent = safe(params.get('agent'));
  if (!model && !agent) return undefined;
  return { ...(model ? { model } : {}), ...(agent ? { agent } : {}) };
}
