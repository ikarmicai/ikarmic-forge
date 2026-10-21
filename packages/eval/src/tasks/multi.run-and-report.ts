import { defineTask, commandRuns, contains, toolWasCalled, completed } from '../graders/index.js';

/**
 * multi-step / run-and-report: agent must run a command and report its
 * output. Verifies the model uses run_command (not just hallucinating the
 * answer) and that it surfaces the result correctly.
 */
export default defineTask({
  id: 'multi-run-and-report',
  name: 'Run a command and report output',
  category: 'multi-step',
  description: 'Agent runs a shell command and reports its stdout.',
  task:
    'Run the command `node -e "console.log(2 + 2)"` in the current directory using ' +
    'the run_command tool and tell me what it printed.',
  setup: async () => {
    // No fixtures needed.
  },
  graders: [
    completed(),
    toolWasCalled('run_command'),
    // Sanity: the command grader proves the command actually works in cwd.
    commandRuns({ command: ['node', '-e', 'console.log(2 + 2)'], contains: '4' }),
    // The model's reply should mention 4 too.
    contains('4'),
  ],
});
