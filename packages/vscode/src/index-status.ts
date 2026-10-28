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
