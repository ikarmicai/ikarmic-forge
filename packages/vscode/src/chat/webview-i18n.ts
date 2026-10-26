/**
 * Translation for the chat webview. The page's labels are plain English in
 * the HTML and in the script that builds rows at runtime, so instead of
 * threading a lookup through every literal the host sends a dictionary
 * (English -> localized) and a small script swaps exact matches in text nodes
 * and in `title` / `aria-label` / `placeholder` attributes, including nodes
 * added later. vscode-free so it is unit-testable.
 */

/** Every English label the swap may need to translate. Keep in step with l10n/bundle.l10n.*.json. */
export const WEBVIEW_STRINGS: readonly string[] = [
  'How much should Forge do on its own?',
  'Approve each file edit and command. Safest while you get to know Forge.',
  'File edits just happen. Commands still ask.',
  'No approval cards. For trusted projects.',
  'You can change this any time in the composer.',
  'Use this',
  'Chat actions',
  'Always allow this command',
  'Revert this run',
  'Big request',
  'A spec turns this into requirements, a design and tasks you approve, then runs them one by one.',
  'Draft a spec',
  'Plan first',
  'Just do it',
  "Don't ask again",
  'This looks like a big build',
  'Mode',
  'Model',
  'no model',
  'Chat cost and context usage',
  'Cost of this chat and how full the context window is',
  'New chat',
  'History',
  'More actions',
  'Restore checkpoint…',
  'Condense conversation',
  'Summarize older turns to free up context',
  'Panel',
  'Conversation',
  'Message input',
  'Mention suggestions',
  'Message to Forge',
  'Ask Forge… (@ to attach context)',
  'Autonomous',
  'Approvals',
  'Ask first',
  'Accept edits',
  'Forge asks before it changes files or runs commands',
  'File edits run without asking. Commands still ask.',
  'Forge runs tools without asking you first',
  'Run tools without asking for approval',
  'Attach context (@)',
  'Attach context',
  'Attached files',
  'Attach files (or paste / drop them)',
  'Attach files',
  'Enhance prompt',
  'Voice input (Ctrl+Shift+Space)',
  'Voice input',
  'Send message',
  "Context and cost details",
  "Close details",
  "Context window",
  "Chat cost",
  "Input tokens",
  "Output tokens",
  "Run time",
  "Step",
  "Condense",
  "Cost is an estimate from known pricing.",
  'Type a message to send',
  'Forge is still working',
  'Send',
  'Stop the running task',
  'Stop',
  'Stop all',
  'Dismiss',
  'Background agents',
  'Close',
  'Copy',
  'Insert in terminal',
  'Writing a command…',
  'Risky:',
  'A hint from known patterns, not a guarantee.',
  'deletes files',
  'forces',
  'runs as administrator',
  'rewrites git history',
  'drops data',
  'formats a disk',
  'Forge could not write a command for that; try rephrasing.',
  'Say what you want after /cmd, for example: /cmd list files larger than 10 MB',
  'Show more',
  'Show less',
  'Clear finished',
  'Open diff',
  'Review changes',
  'Context',
  'Files',
  'Open',
  'Copy resume command',
  'Delete…',
  'Search',
  'Approvals are off: Forge runs tools without asking.',
  'Deny',
  'Hold to run',
  'Specs…',
  'Steering…',
  'Specs',
  'Steering',
  'Drafts',
  'Project',
  'Global',
  'New spec',
  'New file',
  'Generate a spec',
  'Create a steering file',
  'Requirements',
  'Design',
  'Tasks',
  'Discard',
  'Run',
  'Retry',
  'Queued messages',
  'Queued',
  'Remove from queue',
  'Editing your last message',
  'Cancel',
  'Edit',
  'Run your last message again',
  'Edit your last message and send it again',
  'Diagram',
  'Diagram source',
  'Search all sessions',
  'No session mentions that.',
  'Run in this chat',
  'Convert…',
  'Sync with code',
  'Update this spec to match the code: tick done tasks, fix paths, add missing work',
  'No checkbox tasks yet.',
  'Open a folder to use specs.',
  'Open a folder to use steering.',
  'A spec turns a task into requirements, a design and a checklist that Forge works through.',
  'You can also type /spec followed by the task in the chat.',
  'No steering files yet. Steering files hold guidance Forge reads at the start of every chat, such as how this project is built and tested.',
  'Turn a task into requirements, a design and a checklist',
  'Guidance Forge reads at the start of every chat',
  'Thinking…',
  'Thought',
  'What should Forge work on?',
  'Forge asks before it edits files or runs commands.',
  'Explain how this project is organized',
  'Find why a test is failing and fix it',
  'Add tests for the file I have open',
  'Enter sends. Shift+Enter adds a line. @ attaches files.',
  'Choose a model',
  'Search models',
  'Loading models…',
  'No models match.',
  'No models yet. Add an API key in Settings.',
  'Refresh',
  'Settings…',
  'File edit',
  'Destructive',
  'Request',
  'Press and hold to run',
  'What should Forge do instead?',
  'Deny and tell Forge',
  'Just deny',
  'Resume',
  'CLI command',
  'Delete',
  'Restore',
  'you',
  'running',
  'done',
  'failed',
  // Why a tool ran without asking (why-ran.ts): the step-group header and the sentence in each row.
  'step',
  'steps',
  'ran without asking:',
  'auto-approve list',
  'Accept edits',
  'always allowed',
  'permission rule',
  'memory writes allowed',
  'Autonomous',
  'Ran without asking: it is on your auto-approve list.',
  'Ran without asking: the approval level is Accept edits.',
  'Ran without asking: you chose Always allow for this command.',
  'Ran without asking: a permission rule allows it.',
  'Ran without asking: you allowed memory writes without asking.',
  'Ran without asking: the approval level is Autonomous.',
  // Announcements of the mode and approval shortcuts; the option label follows as its own text node.
  'Mode:',
  'Approvals:',
  // Reply speed badge: the unit; the number stays its own text node.
  'tok/s',
];

/** The entries of `WEBVIEW_STRINGS` whose translation differs from the English text. */
export function webviewDictionary(translate: (english: string) => string): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const english of WEBVIEW_STRINGS) {
    const localized = translate(english);
    if (localized && localized !== english) dict[english] = localized;
  }
  return dict;
}

/** Inline script body that applies `dict`; empty when there is nothing to translate. */
export function i18nScript(dict: Record<string, string>): string {
  if (Object.keys(dict).length === 0) return '';
  // `<` is escaped so a translation can never close the script element.
  const json = JSON.stringify(dict).replace(/</g, String.fromCharCode(92) + 'u003c');
  return `(function () {
  var D = ${json};
  var ATTRS = ['title', 'aria-label', 'placeholder'];
  function swap(s) { var k = s.trim(); return Object.prototype.hasOwnProperty.call(D, k) ? s.replace(k, D[k]) : s; }
  function walk(n) {
    if (n.nodeType === 3) { var v = swap(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; return; }
    if (n.nodeType !== 1) return;
    ATTRS.forEach(function (a) { var cur = n.getAttribute(a); if (cur) { var nv = swap(cur); if (nv !== cur) n.setAttribute(a, nv); } });
    for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  walk(document.body);
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else walk(r.target);
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
})();`;
}
