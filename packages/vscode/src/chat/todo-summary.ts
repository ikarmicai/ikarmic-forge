/**
 * One line for the chat's todo chip: how many steps are done and the one in progress. Pure; the page calls it
 * through `window.ForgeUI.renderTodoSummary` (webview-lib.ts).
 */
export interface TodoLike {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

const MAX_CURRENT = 60;

export function renderTodoSummary(todos: readonly TodoLike[]): string {
  if (todos.length === 0) return '';
  const done = todos.filter((t) => t.status === 'completed').length;
  const doing = todos.find((t) => t.status === 'in_progress');
  const current = doing ? (doing.content.length > MAX_CURRENT ? doing.content.slice(0, MAX_CURRENT - 1) + '…' : doing.content) : '';
  return `${done}/${todos.length} done` + (current ? ` · ${current}` : '');
}
