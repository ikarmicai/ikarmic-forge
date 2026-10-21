# Forge GitHub Action

Run Forge in a workflow: on a schedule, on a label, or when someone writes `@forge <task>` in an issue or PR comment. When the run changes files, the action commits them to a new branch and opens a **draft** pull request; it can also reply on the thread with Forge's answer.

## Respond to `@forge` comments

```yaml
# .github/workflows/forge.yml
name: forge
on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  forge:
    # Only people with write access may start a run: the comment becomes the agent's task.
    if: >-
      contains(github.event.comment.body, '@forge') &&
      contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ikarmicai/ikarmic-forge@v4
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        with:
          max-cost: '2'
```

Then comment on an issue: `@forge add a --json flag to the export command`. Forge reads the issue for context, makes the change, opens a draft PR and links it in a reply. On a PR, `@forge address the review comments` can read the PR's reviews and checks (the agent gets the read-only `github_pr_read` tool).

## Run a fixed task

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'
jobs:
  deps:
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: ikarmicai/ikarmic-forge@v4
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          prompt: Update outdated dev dependencies, run the tests, and fix what breaks.
          comment: 'false'
```

## Inputs

| input | default | |
|---|---|---|
| `prompt` | (from the comment) | The task. Empty: the text after `@forge` in the triggering comment, or the new issue's body. |
| `model`, `provider` | auto | As `--model` / `--provider`. The provider key comes from the job's `env`. |
| `max-cost` | `2` | Stop once the run has cost this many USD. |
| `create-pr` | `true` | Commit changed files to `forge/<run id>` and open a draft PR. |
| `comment` | `true` | Reply on the issue or PR with the answer and the PR link. |
| `github-token` | `github.token` | Pushes, opens the PR, comments, and backs `github_pr_read`. |
| `forge-version` | `latest` | npm version of the `ikarmic-forge` CLI. |

Outputs: `result` (the final reply), `reason` (why the run ended) and `pr-url`.

## Safety

- The run is autonomous (`--auto`) inside the job's runner: Forge can edit files and run commands there. Keep the `author_association` check above so strangers can't spend your API budget or steer the agent, and give the job only the permissions it needs.
- The agent can't open PRs or push by itself; the action does that afterwards from the real diff, always as a draft.
- Inputs reach the script through environment variables, never through shell interpolation.
- A PR opened with the default `github.token` does not trigger other workflows (GitHub's rule). Use a PAT or app token in `github-token` if CI must run on it.
