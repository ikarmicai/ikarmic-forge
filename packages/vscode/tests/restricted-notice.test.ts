import { describe, expect, it } from 'vitest';

import { restrictedIgnoredList } from '../src/restricted-notice.js';

describe('restrictedIgnoredList (RB-112)', () => {
  it('names the instruction files and the project skills that were ignored', () => {
    expect(restrictedIgnoredList({ instructionFiles: ['AGENTS.md', 'CLAUDE.md'], skills: 2 })).toBe('AGENTS.md, CLAUDE.md and 2 project skills');
  });

  it('says one skill in the singular', () => {
    expect(restrictedIgnoredList({ instructionFiles: [], skills: 1 })).toBe('1 project skill');
  });

  it('names just the files when there are no skills, and just the skills when there are no files', () => {
    expect(restrictedIgnoredList({ instructionFiles: ['AGENTS.md'], skills: 0 })).toBe('AGENTS.md');
    expect(restrictedIgnoredList({ instructionFiles: [], skills: 3 })).toBe('3 project skills');
  });

  it('is empty when nothing was ignored, so no notice is shown', () => {
    expect(restrictedIgnoredList({ instructionFiles: [], skills: 0 })).toBe('');
  });

  it('shows no identifier a person would not type: only file names and plain words', () => {
    const text = restrictedIgnoredList({ instructionFiles: ['AGENTS.md', 'CLAUDE.md', 'CONVENTIONS.md'], skills: 4 });
    const withoutFiles = text.replace(/[A-Z]+\.md/g, '');
    expect(withoutFiles).not.toMatch(/_|[a-z][A-Z]/);
  });
});
