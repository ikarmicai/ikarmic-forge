/**
 * Agent Manager page: start one prompt as up to four parallel sessions (each in its own worktree by default), watch
 * them, then open, stop, merge or discard each. Rows come from the host (`managerRows`); the page only renders them.
 * The script is inside a template literal: no backticks, no dollar-brace, no backslash-n in it (RB-11).
 */
import { BASE_CSS } from '../webview-base-css.js';

export function agentManagerHtml(opts: { cspSource?: string } = {}): string {
  const scriptSrc = opts.cspSource ? `'unsafe-inline' ${opts.cspSource}` : `'unsafe-inline'`;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptSrc};">
<style>${BASE_CSS}
  html, body { margin: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--fs-m); color: var(--fg); background: var(--vscode-editor-background); padding: 16px 20px; max-width: 920px; }
  h1 { font-size: var(--fs-xl); font-weight: 600; margin: 0 0 4px; }
  .lead { margin: 0 0 16px; }
  form { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--edge); border-radius: var(--r-m); box-shadow: var(--elev-1); }
  label { font-size: var(--fs-s); }
  textarea { width: 100%; box-sizing: border-box; min-height: 72px; resize: vertical; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--edge); border-radius: var(--r-s); padding: 6px 8px; }
  select { min-height: 24px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--edge); border-radius: var(--r-s); }
  .opts { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
  .opts .check { display: inline-flex; align-items: center; gap: 6px; }
  .opts .grow { flex: 1; }
  h2 { font-size: var(--fs-l); font-weight: 600; margin: 20px 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  li { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 8px 10px; border: 1px solid var(--hair); border-radius: var(--r-m); }
  .title { font-weight: 600; overflow-wrap: anywhere; }
  .meta { font-size: var(--fs-s); color: var(--muted); grid-column: 1; }
  .acts { grid-column: 2; grid-row: 1 / span 2; display: flex; gap: 8px; }
  .st { font-size: var(--fs-s); font-weight: 600; margin-right: 6px; }
  .st-starting, .st-running { color: var(--ion); }
  .st-done, .st-merged { color: var(--ok); }
  .st-failed { color: var(--err); }
  .st-stopped, .st-discarded { color: var(--warn); }
  #empty[hidden], #error[hidden] { display: none; }
  #error { color: var(--err); margin: 8px 0 0; }
</style>
</head>
<body>
<h1>Agent Manager</h1>
<p class="lead muted">Run one prompt as several sessions at once. Each session gets its own git worktree, so you can compare the results and merge the one you want.</p>
<form id="form">
  <label for="prompt">What should the sessions do?</label>
  <textarea id="prompt" placeholder="e.g. Add a dark mode toggle to the settings page"></textarea>
  <div class="opts">
    <span><label for="count">Versions</label> <select id="count"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></span>
    <span class="check"><input type="checkbox" id="worktree" checked /><label for="worktree">Own worktree per session</label></span>
    <span class="check"><input type="checkbox" id="auto" /><label for="auto">Autonomous (no approval cards)</label></span>
    <span class="grow"></span>
    <button type="submit" id="start" class="primary">Start</button>
  </div>
  <p id="error" role="alert" hidden></p>
</form>
<h2>Sessions</h2>
<p id="empty" class="muted">No sessions yet. Each session opens in a chat tab of its own, where you approve its steps and follow its work.</p>
<ul id="list" aria-live="polite"></ul>
<script>
(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('form');
  const promptEl = document.getElementById('prompt');
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const errorEl = document.getElementById('error');
  const LABELS = { open: 'Open', stop: 'Stop', merge: 'Merge', discard: 'Discard', remove: 'Remove' };
  const TITLES = {
    open: 'Show this session in its chat tab',
    stop: 'Stop this session',
    merge: 'Merge this session into your current branch and remove its worktree',
    discard: 'Delete this session worktree and branch',
    remove: 'Remove this entry from the list'
  };
  const STATUS = { starting: 'Starting', running: 'Running', done: 'Done', stopped: 'Stopped', failed: 'Failed', merged: 'Merged', discarded: 'Discarded' };

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const prompt = promptEl.value.trim();
    if (!prompt) {
      errorEl.textContent = 'Type what the sessions should do first.';
      errorEl.hidden = false;
      promptEl.focus();
      return;
    }
    errorEl.hidden = true;
    vscode.postMessage({
      type: 'start',
      prompt: prompt,
      count: Number(document.getElementById('count').value),
      useWorktree: document.getElementById('worktree').checked,
      auto: document.getElementById('auto').checked
    });
    promptEl.value = '';
  });

  function render(rows) {
    listEl.textContent = '';
    emptyEl.hidden = rows.length > 0;
    rows.forEach(function (r) {
      const li = document.createElement('li');
      const title = document.createElement('div');
      title.className = 'title';
      const st = document.createElement('span');
      st.className = 'st st-' + r.status;
      st.textContent = STATUS[r.status] || r.status;
      title.appendChild(st);
      title.appendChild(document.createTextNode(r.label));
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = r.detail + ' · ' + r.elapsed;
      const acts = document.createElement('div');
      acts.className = 'acts';
      r.actions.forEach(function (a) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        b.textContent = LABELS[a] || a;
        b.title = TITLES[a] || '';
        b.addEventListener('click', function () { vscode.postMessage({ type: 'action', id: r.id, action: a }); });
        acts.appendChild(b);
      });
      li.appendChild(title);
      li.appendChild(acts);
      li.appendChild(meta);
      listEl.appendChild(li);
    });
  }

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.type === 'sessions') render(msg.rows);
    if (msg.type === 'error') {
      errorEl.textContent = msg.message;
      errorEl.hidden = false;
    }
  });
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
