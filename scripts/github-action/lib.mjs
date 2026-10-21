// Pure helpers for the Forge GitHub Action (action.yml). No I/O: run.mjs does that.

/** Words that address Forge in a comment; the text after it is the task. */
export const TRIGGER = /(^|\s)[@/]forge\b[:,]?\s*/i;

/**
 * The task for this run: the `prompt` input, else the comment (or new issue) that
 * triggered the workflow, with the `@forge` trigger removed. Returns '' when there is none.
 */
export function taskFromEvent(input, eventName, event) {
  if (input && input.trim()) return input.trim();
  const body =
    eventName === 'issue_comment' || eventName === 'pull_request_review_comment'
      ? event?.comment?.body
      : eventName === 'issues'
        ? event?.issue?.body
        : eventName === 'pull_request_review'
          ? event?.review?.body
          : undefined;
  if (typeof body !== 'string') return '';
  // A new issue is a task as a whole; a comment only when it addresses Forge.
  if (eventName === 'issues') return body.trim();
  const m = TRIGGER.exec(body);
  return m ? body.slice(m.index + m[0].length).trim() : '';
}

/** The issue or PR the event is about, for context and the reply comment. */
export function threadFromEvent(event) {
  const issue = event?.issue ?? event?.pull_request;
  if (!issue || typeof issue.number !== 'number') return null;
  return {
    number: issue.number,
    title: typeof issue.title === 'string' ? issue.title : '',
    body: typeof issue.body === 'string' ? issue.body : '',
    isPullRequest: Boolean(event?.pull_request || issue.pull_request),
  };
}

/** The task with the issue or PR it came from, so the agent knows what is being discussed. */
export function taskWithContext(task, thread) {
  if (!thread) return task;
  const kind = thread.isPullRequest ? 'Pull request' : 'Issue';
  const body = thread.body.length > 8000 ? `${thread.body.slice(0, 8000)}\n… (truncated)` : thread.body;
  return `${task}\n\n<github-${thread.isPullRequest ? 'pr' : 'issue'} number="${thread.number}">\n${kind} #${thread.number}: ${thread.title}\n\n${body}\n</github-${thread.isPullRequest ? 'pr' : 'issue'}>`;
}

/** The `{"type":"final", …}` line of `forge --json` output, or null. */
export function finalFromJsonLines(stdout) {
  const lines = stdout.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.type === 'final') return obj;
    } catch {
      // not JSON: keep looking
    }
  }
  return null;
}

/** A one-line PR title from the task. */
export function prTitle(task) {
  const first = task.split('\n').find((l) => l.trim()) ?? 'Changes by Forge';
  const clean = first.replace(/\s+/g, ' ').trim();
  return `forge: ${clean.length > 70 ? `${clean.slice(0, 67)}...` : clean}`;
}

/** `name<<DELIM\nvalue\nDELIM` for $GITHUB_OUTPUT, with a delimiter the value cannot contain. */
export function outputEntry(name, value, random) {
  let delim = `FORGE_${random}`;
  while (value.includes(delim)) delim += '_';
  return `${name}<<${delim}\n${value}\n${delim}\n`;
}
