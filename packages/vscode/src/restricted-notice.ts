/**
 * In a workspace the person has not trusted, what the repository supplies as instructions to the model is left out
 * (RB-112). This words what was left out, for the one sentence the chat shows. Pure; the chat view wraps the list in
 * the translated sentence, because `l10n.ts` needs `vscode`.
 */
export function restrictedIgnoredList(ignored: { instructionFiles: readonly string[]; skills: number }): string {
  const parts: string[] = [];
  if (ignored.instructionFiles.length > 0) parts.push(ignored.instructionFiles.join(', '));
  if (ignored.skills > 0) parts.push(`${ignored.skills} project skill${ignored.skills === 1 ? '' : 's'}`);
  return parts.join(' and ');
}
