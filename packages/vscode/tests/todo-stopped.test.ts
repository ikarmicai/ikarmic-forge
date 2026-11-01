import { describe, expect, it } from 'vitest';

import { chatHtml } from '../src/chat/html.js';

/**
 * The todo list kept its spinner on the step "in progress" after the person pressed Stop, so a finished or cancelled
 * run looked as if it was still building. The spinner is for a run that is going: with none, the step stands still.
 */
const html = chatHtml();

describe('the todo list after the run has stopped', () => {
  it('marks the chip as stopped whenever no run is going, and keeps that when the list is redrawn', () => {
    expect(html).toMatch(/chip\.className = [^;]*\(taskRunning \? '' : ' stopped'\)/);
    expect(html).toMatch(/document\.getElementById\('todo-chip'\)\.classList\.toggle\('stopped', !running\)/);
  });

  it('does not spin the step or the chip icon when stopped', () => {
    expect(html).toMatch(/#todo-chip\.stopped \.todo-spin \{ animation: none; \}/);
    expect(html).toMatch(/#todo-chip\.s-doing\.stopped \.st-doing \{ display: none; \}/);
    expect(html).toMatch(/#todo-chip\.s-doing\.stopped \.st-idle \{ display: block; \}/);
  });
});
