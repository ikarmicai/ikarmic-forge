/** Title of the nth chat tab opened this session (the first is plain "Forge"). */
export function chatTabTitle(n: number): string {
  return n <= 1 ? 'Forge' : `Forge ${n}`;
}
