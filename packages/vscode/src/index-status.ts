import type { SemanticStatus } from '@ikarmic/forge-core';

/** The status bar text and tooltip for the code index, in words. */
export function statusItemFor(s: SemanticStatus): { text: string; tooltip: string } {
  switch (s.phase) {
    case 'indexing':
      return { text: `$(sync~spin) Indexing ${s.done}/${s.total}`, tooltip: 'Forge is reading your code to rank search results by meaning.' };
    case 'ready': {
      const files = `${s.files} file${s.files === 1 ? '' : 's'}`;
      return { text: `$(database) ${files} indexed`, tooltip: `The code index holds ${s.chunks} pieces of ${files}. Click to delete it and forget your choices about where code may be sent.` };
    }
    case 'error':
      return { text: '$(warning) Index problem', tooltip: s.message };
    case 'off':
      return { text: '$(circle-slash) Search by meaning is off', tooltip: 'You did not allow sending code to the embedding provider, so Forge matches by words instead.' };
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What the code index is doing, in a sentence that starts with a word (never colour alone), for the Settings page. */
export function indexStatusLine(enabled: boolean, s: SemanticStatus | undefined): { tone: 'off' | 'idle' | 'ok' | 'bad' | 'run'; text: string } {
  if (!enabled) return { tone: 'off', text: 'Off. Forge matches by words. Turn on Search by meaning to build an index.' };
  if (!s) return { tone: 'idle', text: 'Not built yet. Forge builds it the first time it searches by meaning.' };
  switch (s.phase) {
    case 'indexing':
      return { tone: 'run', text: `Reading your code: ${s.done} of ${plural(s.total, 'file', 'files')}.` };
    case 'ready':
      return { tone: 'ok', text: `Ready: ${plural(s.chunks, 'piece', 'pieces')} of ${plural(s.files, 'file', 'files')}.` };
    case 'error':
      return { tone: 'bad', text: `Problem: ${s.message}` };
    case 'off':
      return { tone: 'off', text: 'Off. You did not allow sending code to the embedding provider, so Forge matches by words.' };
  }
}
