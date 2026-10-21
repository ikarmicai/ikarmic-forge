import { describe, expect, it } from 'vitest';

import { looksLarge } from '../src/chat/large-request.js';

describe('looksLarge', () => {
  it.each([
    'Help me to build a CRM',
    'build a CRM',
    'Create an e-commerce platform',
    'I want to develop a task management app',
    'Can you scaffold a REST API for me?',
    'set up a blog website',
    'Design and implement a booking system',
    'make me a dashboard',
    'Build an app with auth, a shopping cart, payments and an admin panel',
  ])('fires for a whole-system request: %s', (text) => {
    expect(looksLarge(text)).toBe(true);
  });

  it('fires for a long message that lists several features', () => {
    const text = [
      'I need a tool for my team. It should let people sign in, create projects,',
      'assign tasks to each other, comment on tasks, attach files, get email reminders,',
      'see a calendar of deadlines, and export a weekly report as a PDF. Add roles so that',
      'managers can see everything and members only see their own projects.',
    ].join(' ');
    expect(looksLarge(text)).toBe(true);
  });

  it.each([
    'Fix the login bug',
    'rename foo to bar',
    'add a button to the settings page',
    'Explain how the CRM module works',
    'why does the build fail?',
    'build',
    'Create a function that parses dates',
    'create src/app.ts with a hello world export',
    'refactor the app to use async/await',
    'update the README',
    'write a test for the checkout system',
    '',
  ])('stays quiet for a scoped request: %s', (text) => {
    expect(looksLarge(text)).toBe(false);
  });

  it('stays quiet for /spec commands and @mentions', () => {
    expect(looksLarge('/spec build a CRM')).toBe(false);
    expect(looksLarge('build a CRM like @src/crm/index.ts')).toBe(false);
  });

  it('stays quiet for a long message that is not a feature list', () => {
    const text = 'Please look at the stack trace below and tell me what is going on. '.repeat(10);
    expect(looksLarge(text)).toBe(false);
  });
});
