import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

describe('chatHtml foundation controls', () => {
  const html = chatHtml();

  it('renders mode select and New chat / History / Checkpoints buttons', () => {
    expect(html).toContain('id="mode"');
    expect(html).toContain('id="new-chat"');
    expect(html).toContain('id="history-btn"');
    expect(html).toContain('id="checkpoints-btn"');
    expect(html).toContain('id="panel"');
  });

  it('handles every new host message type', () => {
    for (const t of ['user_message', 'modes', 'session', 'transcript', 'sessionsListed', 'sessionDeleted', 'checkpointsListed', 'checkpointRestored', 'cancelled', 'warning', 'steering_applied']) {
      expect(html).toContain(`case '${t}':`);
    }
  });

  it('posts the new webview messages', () => {
    for (const t of ['new_chat', 'set_mode', 'open_diff', 'listSessions', 'resumeSession', 'deleteSession', 'listCheckpoints', 'restoreCheckpoint']) {
      expect(html).toContain(`type: '${t}'`);
    }
  });

  it('builds panel rows with textContent, not innerHTML', () => {
    const panelFn = html.slice(html.indexOf('function renderPanelRows'), html.indexOf('function renderPanelRows') + 1500);
    expect(panelFn).toContain('textContent');
    expect(panelFn).not.toContain('innerHTML');
  });
});

describe('chatHtml agent-power controls', () => {
  const html = chatHtml();

  it('emits an inline script that parses (template-literal escaping regressions)', () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });

  it('renders meter, condense, mention list and review-hunks controls', () => {
    for (const id of ['meter', 'condense-btn', 'mention-list']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('class="link hunks">Review changes');
  });

  it('handles the new host messages and posts the new webview messages', () => {
    for (const t of ['cost', 'meter_reset', 'compaction', 'verify', 'approval_resolved', 'mentions_attached', 'mention_suggestions', 'insert_text']) {
      expect(html).toContain(`case '${t}':`);
    }
    for (const t of ['review_hunks', 'condense', 'mention_query', 'attach_file', 'attach_uris', 'pick_attachments', 'remove_attachment', 'copy_resume']) expect(html).toContain(`type: '${t}'`);
  });

  it('never resends a host-resolved approval', () => {
    expect(html).toContain("if (d === '__host__') return;");
  });
});

describe('chatHtml accessibility', () => {
  const html = chatHtml();

  it('exposes the transcript as a live log and labels the main controls', () => {
    expect(html).toContain('id="messages" role="log" aria-live="polite"');
    for (const label of ['aria-label="Message to Forge"', 'aria-label="Send message"', 'aria-label="Stop the running task"']) {
      expect(html).toContain(label);
    }
  });

  it('announces approvals as alert dialogs', () => {
    expect(html).toContain("setAttribute('role', 'alertdialog')");
  });

  it('shows keyboard focus, respects reduced motion and forced colors', () => {
    expect(html).toContain(':focus-visible');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('forced-colors: active');
  });

  it('marks the mention list as a listbox tied to the input', () => {
    expect(html).toContain('id="mention-list" role="listbox"');
    expect(html).toContain('aria-controls="mention-list"');
  });

  it('closes the history panel on Escape, labels it and moves focus into it', () => {
    expect(html).toContain("panelEl.addEventListener('keydown'");
    expect(html).toContain("panelEl.setAttribute('aria-label', title)");
    expect(html).toContain('close.focus();');
  });

  it('shows loading and failure states in the history panel with a next step when empty', () => {
    expect(html).toContain("renderPanelMessage('Sessions', 'Loading…', true)");
    expect(html).toContain("'Could not load: ' + msg.message");
    expect(html).toContain('No sessions yet. Send a message to start one.');
  });

  it('gives the more menu arrow-key navigation', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect(html).toContain(key);
  });

  it('keeps a visible focus indicator on the approval note and uses text-safe state colors', () => {
    expect(html).not.toMatch(/\.approval \.note \{[^}]*outline: none/);
    expect(html).toContain('--vscode-charts-green');
    expect(html).not.toContain('--vscode-testing-iconPassed');
  });

  it('names the run-card step icons', () => {
    for (const label of ['aria-label="done"', 'aria-label="failed"', 'aria-label="waiting"']) expect(html).toContain(label);
  });
});

describe('chatHtml webview library', () => {
  it('loads forge-ui.js before the inline script', () => {
    const html = chatHtml({ forgeUiScriptUri: 'vscode-resource:/dist/webview/forge-ui.js', cspSource: 'vscode-resource:' });
    const lib = html.indexOf('src="vscode-resource:/dist/webview/forge-ui.js"');
    const inline = html.indexOf('<script>');
    expect(lib).toBeGreaterThan(-1);
    expect(lib).toBeLessThan(inline);
    expect(html).toContain('window.__forgeUiLoadFailed=true');
  });

  it('falls back when ForgeUI is missing', () => {
    expect(chatHtml()).toContain('window.ForgeUI || null');
  });
});

describe('chatHtml toolbar and composer (direction A)', () => {
  const html = chatHtml();

  it('keeps every id the tests and smoke test rely on', () => {
    for (const id of ['mode', 'model-label', 'meter', 'new-chat', 'history-btn', 'checkpoints-btn', 'condense-btn', 'panel', 'messages', 'input', 'send', 'cancel', 'mic', 'approval', 'mention-list', 'voice-status', 'toolbar']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('puts Checkpoints and Condense in the ⋯ menu', () => {
    const menu = html.slice(html.indexOf('id="more-menu"'), html.indexOf('</div>', html.indexOf('id="more-menu"')));
    expect(html).toContain('id="more-btn"');
    expect(menu).toContain('id="checkpoints-btn"');
    expect(menu).toContain('id="condense-btn"');
  });

  it('has the context meter, attach button and one-box composer', () => {
    for (const id of ['meter-text', 'meter-wave-a', 'meter-cost', 'meter-stat', 'attach']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('class="composer"');
    expect(html).not.toContain('id="header"');
  });

  it('swaps Send and Stop instead of showing both', () => {
    expect(html).toContain('sendBtn.hidden = running');
    expect(html).toContain('cancelBtn.hidden = !running');
  });
});

describe('chatHtml markdown replies and tool rows', () => {
  const html = chatHtml();

  it('renders replies through ForgeUI.renderMarkdown with a plain-text fallback', () => {
    expect(html).toContain('UI.renderMarkdown(');
    expect(html).toContain('requestAnimationFrame(');
    expect(html).toContain("body.classList.remove('md')");
  });

  it('builds tool rows from ForgeUI.summarizeTool and handles sub_agent progress', () => {
    expect(html).toContain('UI.summarizeTool(');
    expect(html).toContain('UI.isProgressResult(');
    expect(html).toContain("'tool-row");
    expect(html).not.toContain('JSON.stringify(args)) + \'</span>');
  });

  it('wires the code-block copy button with a failure label', () => {
    expect(html).toContain("closest('button.copy')");
    expect(html).toContain("'Copy failed'");
  });
});

describe('chatHtml diff rendering', () => {
  it('treats empty before/after text as no lines (new files show no phantom deleted line)', () => {
    const html = chatHtml();
    const fn = html.slice(html.indexOf('function simpleDiffLines'), html.indexOf('function renderDiffHtml'));
    const simpleDiffLines = new Function(fn + '; return simpleDiffLines;')() as (b: string, a: string) => { text: string; kind: string }[];
    expect(simpleDiffLines('', 'forge-ui-test')).toEqual([{ text: 'forge-ui-test', kind: 'add' }]);
    expect(simpleDiffLines('gone', '')).toEqual([{ text: 'gone', kind: 'del' }]);
  });
});

describe('chatHtml brand mark', () => {
  const html = chatHtml();

  it('paints the mandala mask with the accent colour, and the CSP allows data images only', () => {
    expect(html).toMatch(/--mandala: url\("data:image\/png;base64,/);
    expect(html).toMatch(/\.empty-state \.mark \{[^}]*background: var\(--ion\)[^}]*mask: var\(--mandala\)/);
    expect(html).toContain("img-src data:;");
    expect(html).not.toMatch(/img-src[^;]*https?:/);
  });
});

describe('chatHtml select popups', () => {
  it('gives the transparent mode select a themed option background (else the popup is white with pale text)', () => {
    expect(chatHtml()).toMatch(/\.cchips select option \{ background: var\(--vscode-dropdown-background/);
  });
});

describe('chatHtml inline approvals', () => {
  const html = chatHtml();

  it('renders approvals inline in the transcript, not in a pinned dock', () => {
    expect(html).toMatch(/messagesEl\.appendChild\(div\);\s+div\.scrollIntoView/);
    expect(html).not.toContain('id="dock"');
    expect(html).toContain('UI.approvalCopy(');
  });

  it('offers a reason box and sends the note with the denial', () => {
    for (const s of ['Deny', 'Deny and tell Forge', 'Just deny', 'What should Forge do instead?', 'Try a different approach', 'Ask me first']) {
      expect(html).toContain(s);
    }
    expect(html).toMatch(/type: 'approval_response', id: msg\.id, approved: d\.approved/);
    expect(html).toContain('note: d.note');
  });

  it('uses hold-to-run for destructive calls', () => {
    expect(html).toContain('Hold to run');
    expect(html).toContain('Press and hold to run');
    expect(html).toContain('900');
  });

  const caseBody = (t: string) => html.slice(html.indexOf(`case '${t}':`), html.indexOf('break;', html.indexOf(`case '${t}':`)));

  // Release 1, feature 1: the step-group header says what ran without asking; each row says why inside its details.
  it('passes the reason a tool ran unasked to the row and rebuilds the group header from parts', () => {
    expect(caseBody('tool_call')).toContain('appendToolCall(msg.id, msg.name, msg.args, msg.why)');
    const step = html.slice(html.indexOf('function appendStep'), html.indexOf('function appendStep') + 1400);
    expect(step).toContain('UI.stepsHeadParts(');
    expect(step).toContain('dataset.why');
    const call = html.slice(html.indexOf('function appendToolCall'), html.indexOf('function appendToolCall') + 900);
    expect(call).toContain('row.dataset.why = why');
    const note = html.slice(html.indexOf('function addWhyNote'), html.indexOf('function addWhyNote') + 600);
    expect(note).toContain('UI.WHY_ROW[why]');
    expect(html).toMatch(/\.steps-head\.auto \{[^}]*color: var\(--err\)/);
  });

  // The result rebuilds the row's innerHTML, which dropped the reason added when the call started (found by why-ran.spec).
  it('keeps the reason on the row after its result replaces the row body', () => {
    const result = html.slice(html.indexOf('function appendToolResult'), html.indexOf('function appendToolResult') + 4000);
    expect(result).toContain('addWhyNote(row)');
    const call = html.slice(html.indexOf('function appendToolCall'), html.indexOf('function appendToolCall') + 900);
    expect(call).toContain('addWhyNote(row)');
  });

  it('offers Continue after a run stopped at a limit or an error, not only after Stop', () => {
    const actions = html.slice(html.indexOf('const CONTINUABLE'), html.indexOf('const CONTINUABLE') + 200);
    for (const r of ['aborted', 'max_iterations', 'max_duration', 'error']) expect(actions).toContain(`'${r}'`);
    expect(html).toContain('CONTINUABLE.includes(lastRunReason)');
  });

  // Core asks a failed or empty step again (provider-retry.test.ts) and discards it; the half answer it streamed
  // must not stay on screen in front of the real one.
  it('drops the partial text of a step that is retried, then says why', () => {
    expect(caseBody('step_retry')).toContain('discardPartialStep()');
    expect(caseBody('step_retry')).toContain('appendNotice(msg.message)');
    const fn = html.slice(html.indexOf('function discardPartialStep'), html.indexOf('function discardPartialStep') + 600);
    expect(fn).toContain('streamingEl.remove()');
    expect(fn).toContain('reasoningEl.remove()');
    expect(fn).toContain("streamText = ''");
  });

  it('clears pending approvals when a task finishes or another transcript loads (new chat, resume)', () => {
    expect(caseBody('task_finished')).toContain('cancelPendingApprovals()');
    expect(caseBody('transcript')).toContain('cancelPendingApprovals()');
  });

  it("leaves approvals alone on 'cancelled' (a dismissed history/checkpoint confirm, not a run ending)", () => {
    expect(caseBody('cancelled')).not.toContain('cancelPendingApprovals()');
  });

  it('announces new approvals to screen readers and restores focus when a focused row settles', () => {
    expect(html).toMatch(/id="approval-announcer"[^>]*aria-live="assertive"/);
    const append = html.slice(html.indexOf('function appendApproval('), html.indexOf('function settleApproval('));
    expect(append).toContain('announcer.textContent =');
    const settle = html.slice(html.indexOf('function settleApproval('), html.indexOf('function resolveApproval('));
    expect(settle).toContain('a.el.contains(document.activeElement)');
  });

  it('does not add a second, target-less row for a denied call (the approval log already records it)', () => {
    const fn = html.slice(html.indexOf('function appendToolResult('), html.indexOf('function appendReasoningDelta('));
    expect(fn).toContain("if (!existing && s.meta === 'denied') return;");
  });

  it('leaves a transcript line for every settled approval', () => {
    expect(html).toContain("'approval-log ");
    expect(html).toContain('UI.approvalLogText(');
  });
});

describe('chatHtml parallel run card', () => {
  const html = chatHtml();

  it('renders run_update cards with escaped text and posts run_action', () => {
    expect(html).toContain("case 'run_update':");
    const fn = html.slice(html.indexOf('function renderRunCard('), html.indexOf('function renderRunCard(') + 4000);
    expect(fn).toContain('escapeHtml(v.task)');
    expect(fn).toContain('escapeHtml(s.task)');
    expect(html).toMatch(/type: 'run_action', runId: /);
  });
});

describe('chatHtml host notices', () => {
  const html = chatHtml();
  it('renders a lasting, non-warning status line for a host "notice" message', () => {
    expect(html).toContain("case 'notice':");
    expect(html).toContain('function appendNotice(');
    // Unlike a warning it is not removed after a timeout.
    const body = html.slice(html.indexOf('function appendNotice('), html.indexOf('function appendNotice(') + 400);
    expect(body).not.toContain('setTimeout');
  });
});

describe('chat UX: retry, queue, diagrams', () => {
  it('sends retry_last for Retry and for an edited last message', () => {
    const html = chatHtml();
    expect(html).toContain("type: 'retry_last', text, level");
    expect(html).toContain("type: 'retry_last', level");
    expect(html).toContain('id="edit-banner" hidden');
  });

  it('queues Enter during a run and sends the next message when a run finishes', () => {
    const html = chatHtml();
    expect(html).toContain('if (taskRunning) { enqueue(); return; }');
    expect(html).toContain('if (queued.length > 0) setTimeout(sendNextQueued, 0);');
  });

  it('Stop returns queued messages to the input instead of letting them run', () => {
    const html = chatHtml();
    expect(html).toContain("const parked = queued.splice(0).join('\\n');");
    expect(html.indexOf("const parked = queued.splice(0)")).toBeLessThan(html.indexOf("vscode.postMessage({ type: 'cancel' })"));
  });

  it('follows new content only while you are near the bottom, and jumps down when you send', () => {
    const html = chatHtml();
    expect(html).toContain('let stickToBottom = true;');
    expect(html).toContain('if (stickToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;');
    // Sending a message and loading a chat force the jump.
    expect(html).toMatch(/function appendUserMessage[\s\S]*?autoscroll\(true\);/);
    expect(html).toContain('stickToBottom = true; // a loaded chat opens at its end');
  });

  it('checks a diagram parses before rendering it and removes Mermaid\'s leftovers when it does not', () => {
    const html = chatHtml();
    expect(html).toContain('m.parse(source, { suppressErrors: true })');
    expect(html).toContain("[diagramId, 'd' + diagramId].forEach");
  });

  it('keeps long unbroken text inside warnings and run-card errors', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.warning \{[^}]*overflow-wrap: anywhere/);
    expect(html).toMatch(/\.run \.rerr \{[^}]*overflow-wrap: anywhere/);
  });

  it('wraps long names and notes in the Specs and Steering panels instead of scrolling sideways', () => {
    const html = chatHtml();
    expect(html).toMatch(/#panel \.wk-note \{[^}]*overflow-wrap: anywhere/);
    expect(html).toMatch(/#panel \.trow \.desc \{[^}]*overflow-wrap: anywhere/);
    expect(html).toMatch(/#panel \.trow \.req \{(?![^}]*nowrap)[^}]*overflow-wrap: anywhere/);
  });

  it('wraps the per-step status bar and status lines', () => {
    const html = chatHtml();
    expect(html).toMatch(/\.status-bar \{[^}]*flex-wrap: wrap/);
    expect(html).toMatch(/\.status-bar > span \{[^}]*overflow-wrap: anywhere/);
    expect(html).toContain("div.style.overflowWrap = 'anywhere';");
  });

  it('lets the row menu be driven by keyboard and keeps it in view', () => {
    const html = chatHtml();
    expect(html).toContain("ev.key === 'ArrowDown'");
    expect(html).toContain("ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeRowMenus(); more.focus(); }");
    expect(html).toContain("menu.scrollIntoView({ block: 'nearest' });");
  });

  it('does not reopen a panel that was closed (or replaced) while its list was loading', () => {
    const html = chatHtml();
    expect(html).toContain("if (!panelShows('Sessions')) break;");
    expect(html).toContain("if (!panelShows('Checkpoints')) break;");
  });

  it('drops messages queued behind the old chat when a transcript is loaded', () => {
    const html = chatHtml();
    expect(html).toMatch(/case 'transcript':[\s\S]*?queued\.length = 0;\s*renderQueue\(\);\s*renderTranscript\(msg\.items\);/);
  });

  it('keeps keyboard focus on the same run-card button when the card is rebuilt', () => {
    const html = chatHtml();
    expect(html).toContain('keep keyboard focus on the same button');
    expect(html).toMatch(/b\.dataset\.action === keep\.action && b\.dataset\.index === keep\.index/);
  });

  it('only starts the hold-to-run timer from the primary mouse button', () => {
    const html = chatHtml();
    expect(html).toContain("if (e.type === 'pointerdown' && e.button !== 0) return;");
  });

  it('loads mermaid lazily from the given URI with strict security', () => {
    const html = chatHtml({ mermaidScriptUri: 'https://file+.vscode-resource/dist/webview/mermaid.js', cspSource: 'https://file+.vscode-resource' });
    expect(html).toContain('const MERMAID_URI = "https://file+.vscode-resource/dist/webview/mermaid.js";');
    expect(html).toContain("securityLevel: 'strict'");
    // Not loaded up front: only a script element created on demand.
    expect(html).not.toContain('<script src="https://file+.vscode-resource/dist/webview/mermaid.js"');
  });
});

describe('chatHtml layout guards', () => {
  const html = chatHtml();

  it('styles every button marked "link" as a link, not a filled primary button', () => {
    expect(html).toMatch(/button\.link \{[^}]*background: none/);
  });

  it('keeps the icon buttons in one group so a narrow header never orphans an icon', () => {
    const group = html.match(/<div class="tb-end">([\s\S]*?)<\/div>/)?.[1] ?? '';
    for (const id of ['new-chat', 'history-btn', 'more-btn']) expect(group).toContain(`id="${id}"`);
    expect(group).not.toContain('id="meter"');
  });
});

describe('the /cmd card', () => {
  const html = chatHtml();
  it('handles the host messages and posts Insert and Copy with the whole command', () => {
    for (const t of ['cmd_pending', 'cmd_result', 'compose_cmd']) expect(html).toContain(`case '${t}':`);
    expect(html).toContain("type: 'cmd_insert', command: it.command");
    expect(html).toContain("type: 'cmd_copy', command: it.command");
    expect(html).toContain('code.textContent = it.command');
  });
  it('shows "Risky:" and the reason as separate text nodes so each can be translated', () => {
    expect(html).toContain("label.textContent = 'Risky:'");
    expect(html).toContain('why.textContent = it.risk');
    expect(html).toContain("risk.title = 'A hint from known patterns, not a guarantee.'");
  });
  it('is drawn with a border in forced-colors mode', () => {
    expect(html).toMatch(/forced-colors: active\) \{[^}]*\.cmd-card/);
  });
  it('draws the first-run approval card with a border in forced-colors mode', () => {
    expect(html).toMatch(/forced-colors: active\) \{[^}]*\.approval-default-card/);
  });
  it('does not double the /cmd prefix when the draft already starts with it', () => {
    expect(html).toContain("startsWith('/cmd ')");
  });
});
