/**
 * Unit tests for the voice input controller. We exercise the pure logic in
 * `voice-input.ts` against a hand-rolled SpeechRecognition mock — no DOM,
 * no Electron, no VS Code host required.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  VoiceController,
  detectSpeechRecognition,
  errorMessageFor,
  extractTranscripts,
  joinTranscripts,
  mapErrorCode,
  resolveLanguage,
} from '../src/chat/voice-input.js';
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionLike,
  VoiceConfig,
  VoiceMessage,
  VoiceRuntime,
} from '../src/chat/voice-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function defaultConfig(): VoiceConfig {
  return {
    enabled: true,
    language: '',
    autoSubmit: false,
    continuous: false,
    interimResults: true,
  };
}

/**
 * Build a `SpeechRecognitionResult`-shaped object: an ArrayLike of
 * alternatives plus an `isFinal` flag.
 */
function resultOf(transcript: string, isFinal: boolean) {
  const alternatives = [{ transcript, confidence: 0.9 }];
  return Object.assign(alternatives, { isFinal });
}

/** Mock that records callbacks and lets the test fire events deterministically. */
function makeMockRecognition(): SpeechRecognitionLike & {
  fireStart: () => void;
  fireResult: (transcript: string, isFinal: boolean) => void;
  fireError: (code: string) => void;
  fireEnd: () => void;
  calls: { start: number; stop: number; abort: number };
} {
  const recog: SpeechRecognitionLike = {
    lang: '',
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  const calls = { start: 0, stop: 0, abort: 0 };
  (recog.start as ReturnType<typeof vi.fn>).mockImplementation(() => {
    calls.start++;
  });
  (recog.stop as ReturnType<typeof vi.fn>).mockImplementation(() => {
    calls.stop++;
  });
  (recog.abort as ReturnType<typeof vi.fn>).mockImplementation(() => {
    calls.abort++;
  });

  const fireStart = () => recog.onstart?.(new Event('start'));
  const fireResult = (transcript: string, isFinal: boolean) => {
    // Per W3C: SpeechRecognitionResult is an ArrayLike of alternatives
    // AND has `isFinal` on the result itself (not the alternative).
    const alternatives = [{ transcript, confidence: 0.9 }];
    const result = Object.assign(alternatives, { isFinal: !!isFinal });
    recog.onresult?.({
      resultIndex: 0,
      results: [result],
    });
  };
  const fireError = (code: string) =>
    recog.onerror?.({ error: code, message: `mock ${code}` });
  const fireEnd = () => recog.onend?.(new Event('end'));

  return Object.assign(recog, { fireStart, fireResult, fireError, fireEnd, calls });
}

/** Make a controller pre-wired with a mock recognition instance. */
function makeController(
  overrides: Partial<{
    config: Partial<VoiceConfig>;
    runtime: VoiceRuntime;
    events: Partial<{
      started: () => void;
      transcript: (t: string, i: string) => void;
      stopped: (r: 'user' | 'silence' | 'error') => void;
      errored: (m: VoiceMessage & { type: 'voice_error' }) => void;
    }>;
    messages: VoiceMessage[];
  }> = {}
) {
  const recog = makeMockRecognition();
  const ctor: SpeechRecognitionConstructor = function () {
    return recog;
  } as unknown as SpeechRecognitionConstructor;
  const messages: VoiceMessage[] = [];
  const events = {
    started: overrides.events?.started ?? vi.fn(),
    transcript: overrides.events?.transcript ?? vi.fn(),
    stopped: overrides.events?.stopped ?? vi.fn(),
    errored: overrides.events?.errored ?? vi.fn(),
  };
  const ctrl = new VoiceController({
    config: { ...defaultConfig(), ...overrides.config },
    runtime: overrides.runtime ?? {},
    ctor,
    events,
    post: (m) => messages.push(m),
  });
  return { ctrl, recog, events, messages };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure-function tests
// ─────────────────────────────────────────────────────────────────────────────

describe('detectSpeechRecognition', () => {
  it('returns the standard constructor when present', () => {
    const ctor: SpeechRecognitionConstructor = function () {
      return {} as SpeechRecognitionLike;
    } as unknown as SpeechRecognitionConstructor;
    expect(detectSpeechRecognition({ SpeechRecognition: ctor })).toBe(ctor);
  });

  it('falls back to webkitSpeechRecognition', () => {
    const ctor: SpeechRecognitionConstructor = function () {
      return {} as SpeechRecognitionLike;
    } as unknown as SpeechRecognitionConstructor;
    expect(detectSpeechRecognition({ webkitSpeechRecognition: ctor })).toBe(ctor);
  });

  it('prefers SpeechRecognition over webkitSpeechRecognition', () => {
    const std: SpeechRecognitionConstructor = function () {
      return { tag: 'std' } as unknown as SpeechRecognitionLike;
    } as unknown as SpeechRecognitionConstructor;
    const wk: SpeechRecognitionConstructor = function () {
      return { tag: 'wk' } as unknown as SpeechRecognitionLike;
    } as unknown as SpeechRecognitionConstructor;
    expect(detectSpeechRecognition({ SpeechRecognition: std, webkitSpeechRecognition: wk })).toBe(std);
  });

  it('returns undefined when neither is present', () => {
    expect(detectSpeechRecognition({})).toBeUndefined();
    expect(detectSpeechRecognition({ SpeechRecognition: undefined })).toBeUndefined();
  });

  it('ignores non-function values', () => {
    expect(detectSpeechRecognition({ SpeechRecognition: 'not-a-fn' as unknown as SpeechRecognitionConstructor })).toBeUndefined();
  });
});

describe('resolveLanguage', () => {
  it('uses explicit config language when set', () => {
    expect(resolveLanguage({ ...defaultConfig(), language: 'fr-FR' }, {})).toBe('fr-FR');
  });

  it('trims whitespace from explicit config', () => {
    expect(resolveLanguage({ ...defaultConfig(), language: '  de-DE  ' }, {})).toBe('de-DE');
  });

  it('falls back to navigator.language when config is empty', () => {
    expect(resolveLanguage(defaultConfig(), { navigator: { language: 'es-ES' } })).toBe('es-ES');
  });

  it('falls back to en-US when both are missing', () => {
    expect(resolveLanguage(defaultConfig(), {})).toBe('en-US');
  });

  it('prefers config over navigator', () => {
    expect(
      resolveLanguage(
        { ...defaultConfig(), language: 'ja-JP' },
        { navigator: { language: 'en-US' } }
      )
    ).toBe('ja-JP');
  });
});

describe('mapErrorCode', () => {
  it('passes through every W3C code we care about', () => {
    expect(mapErrorCode('not-allowed')).toBe('not-allowed');
    expect(mapErrorCode('no-speech')).toBe('no-speech');
    expect(mapErrorCode('audio-capture')).toBe('audio-capture');
    expect(mapErrorCode('network')).toBe('network');
    expect(mapErrorCode('aborted')).toBe('aborted');
    expect(mapErrorCode('language-not-supported')).toBe('language-not-supported');
    expect(mapErrorCode('service-not-allowed')).toBe('service-not-allowed');
  });

  it('returns "unknown" for unrecognized codes', () => {
    expect(mapErrorCode('wat')).toBe('unknown');
    expect(mapErrorCode('')).toBe('unknown');
  });
});

describe('errorMessageFor', () => {
  it('returns a non-empty message for every code', () => {
    const codes = [
      'not-allowed',
      'no-speech',
      'audio-capture',
      'network',
      'aborted',
      'language-not-supported',
      'service-not-allowed',
      'unknown',
    ] as const;
    for (const c of codes) {
      const msg = errorMessageFor(c);
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('mentions microphone for not-allowed', () => {
    expect(errorMessageFor('not-allowed').toLowerCase()).toContain('microphone');
  });
});

describe('extractTranscripts', () => {
  it('returns empty array when no results', () => {
    expect(extractTranscripts({ resultIndex: 0, results: [] })).toEqual([]);
  });

  it('extracts a single transcript', () => {
    const out = extractTranscripts({
      resultIndex: 0,
      results: [resultOf('  hello world  ', true)],
    });
    expect(out).toEqual([{ transcript: 'hello world', isFinal: true }]);
  });

  it('respects resultIndex to return only new chunks', () => {
    const out = extractTranscripts({
      resultIndex: 1,
      results: [resultOf('first', true), resultOf('second', false)],
    });
    expect(out).toEqual([{ transcript: 'second', isFinal: false }]);
  });

  it('filters out empty transcripts', () => {
    expect(
      extractTranscripts({
        resultIndex: 0,
        results: [resultOf('   ', true)],
      })
    ).toEqual([]);
  });

  it('filters interim results when finalOnly is set', () => {
    const out = extractTranscripts(
      {
        resultIndex: 0,
        results: [resultOf('one', true), resultOf('two', false)],
      },
      { finalOnly: true }
    );
    expect(out).toEqual([{ transcript: 'one', isFinal: true }]);
  });

  it('skips results with no alternatives', () => {
    const empty = Object.assign([] as Array<unknown>, { isFinal: true });
    expect(
      extractTranscripts({
        resultIndex: 0,
        results: [empty as unknown as ArrayLike<{ transcript: string; confidence: number }>],
      })
    ).toEqual([]);
  });
});

describe('joinTranscripts', () => {
  it('joins chunks with single spaces', () => {
    expect(joinTranscripts([{ transcript: 'hello' }, { transcript: 'world' }])).toBe('hello world');
  });

  it('collapses internal whitespace', () => {
    expect(joinTranscripts([{ transcript: 'hello   world' }])).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(joinTranscripts([{ transcript: '  hello  ' }, { transcript: '  world  ' }])).toBe('hello world');
  });

  it('returns empty for empty input', () => {
    expect(joinTranscripts([])).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Controller tests
// ─────────────────────────────────────────────────────────────────────────────

describe('VoiceController', () => {
  it('reports unsupported when no constructor is provided', () => {
    const ctrl = new VoiceController({
      config: defaultConfig(),
      events: { started: vi.fn(), transcript: vi.fn(), stopped: vi.fn(), errored: vi.fn() },
    });
    expect(ctrl.isSupported()).toBe(false);
    expect(ctrl.start()).toBe(false);
  });

  it('does not start when disabled in config', () => {
    const { ctrl, recog } = makeController({ config: { enabled: false } });
    expect(ctrl.start()).toBe(false);
    expect(recog.calls.start).toBe(0);
  });

  it('starts, fires started, and transitions through starting→listening', () => {
    const { ctrl, recog, events, messages } = makeController();
    expect(ctrl.start()).toBe(true);
    expect(ctrl.getState()).toBe('starting');
    expect(recog.calls.start).toBe(1);
    recog.fireStart();
    expect(ctrl.getState()).toBe('listening');
    expect(events.started).toHaveBeenCalledTimes(1);
    expect(messages[0]).toEqual({ type: 'voice_started' });
  });

  it('treats double-start as no-op', () => {
    const { ctrl, recog } = makeController();
    expect(ctrl.start()).toBe(true);
    expect(ctrl.start()).toBe(false);
    expect(recog.calls.start).toBe(1);
  });

  it('writes interim transcripts to the transcript callback', () => {
    const { ctrl, recog, events } = makeController();
    ctrl.start();
    recog.fireStart();
    recog.fireResult('hel', false);
    expect(events.transcript).toHaveBeenLastCalledWith('', 'hel');
  });

  it('accumulates final transcripts across multiple results', () => {
    const { ctrl, recog, events } = makeController();
    ctrl.start();
    recog.fireStart();
    recog.fireResult('hello', true);
    recog.fireResult('world', true);
    // Final buffer should accumulate: 'hello world'
    expect(events.transcript).toHaveBeenLastCalledWith('hello world', '');
  });

  it('clears interim when a new final arrives', () => {
    const { ctrl, recog, events } = makeController();
    ctrl.start();
    recog.fireStart();
    recog.fireResult('foo', true);
    recog.fireResult('bar', false); // interim
    recog.fireResult('baz', true); // final
    expect(events.transcript).toHaveBeenLastCalledWith('foo baz', '');
  });

  it('resolves config language into recognition.lang on start', () => {
    const { ctrl, recog } = makeController({ config: { language: 'fr-FR' } });
    ctrl.start();
    expect(recog.lang).toBe('fr-FR');
  });

  it('maps config flags to recognition properties', () => {
    const { ctrl, recog } = makeController({
      config: { continuous: true, interimResults: false },
    });
    ctrl.start();
    expect(recog.continuous).toBe(true);
    expect(recog.interimResults).toBe(false);
    expect(recog.maxAlternatives).toBe(1);
  });

  it('stops cleanly and emits "user" reason', () => {
    const { ctrl, recog, events, messages } = makeController();
    ctrl.start();
    recog.fireStart();
    ctrl.stop();
    expect(ctrl.getState()).toBe('stopping');
    expect(recog.calls.stop).toBe(1);
    recog.fireEnd();
    expect(ctrl.getState()).toBe('idle');
    expect(events.stopped).toHaveBeenCalledWith('user');
    expect(messages.find((m) => m.type === 'voice_stopped')).toEqual({
      type: 'voice_stopped',
      reason: 'user',
    });
  });

  it('aborts without waiting for transcript', () => {
    const { ctrl, recog, events } = makeController();
    ctrl.start();
    recog.fireStart();
    ctrl.abort();
    expect(recog.calls.abort).toBe(1);
    recog.fireEnd();
    expect(events.stopped).toHaveBeenCalledWith('user');
  });

  it('emits "silence" reason when engine ends naturally', () => {
    const { ctrl, recog, events } = makeController();
    ctrl.start();
    recog.fireStart();
    recog.fireEnd();
    expect(events.stopped).toHaveBeenCalledWith('silence');
  });

  it('emits "error" reason when onerror fired before onend', () => {
    const { ctrl, recog, events, messages } = makeController();
    ctrl.start();
    recog.fireStart();
    recog.fireError('not-allowed');
    expect(events.errored).toHaveBeenCalledWith({
      type: 'voice_error',
      code: 'not-allowed',
      message: expect.stringContaining('permission'),
    });
    expect(messages.find((m) => m.type === 'voice_error')).toMatchObject({ code: 'not-allowed' });
    recog.fireEnd();
    expect(events.stopped).toHaveBeenCalledWith('error');
  });

  it('restarts automatically when continuous is true and engine ends due to silence', () => {
    const { ctrl, recog, events } = makeController({ config: { continuous: true } });
    ctrl.start();
    recog.fireStart();
    recog.fireEnd(); // engine stops due to silence
    // Controller should immediately call start() again — verify a second session
    expect(recog.calls.start).toBe(2);
    // No 'stopped' event in continuous-restart path
    expect(events.stopped).not.toHaveBeenCalled();
  });

  it('does NOT auto-restart after an error even with continuous=true', () => {
    const { ctrl, recog, events } = makeController({ config: { continuous: true } });
    ctrl.start();
    recog.fireStart();
    recog.fireError('network');
    recog.fireEnd();
    expect(recog.calls.start).toBe(1);
    expect(events.stopped).toHaveBeenCalledWith('error');
  });

  it('does NOT auto-restart after abort even with continuous=true', () => {
    const { ctrl, recog } = makeController({ config: { continuous: true } });
    ctrl.start();
    recog.fireStart();
    ctrl.abort();
    recog.fireEnd();
    expect(recog.calls.start).toBe(1);
  });

  it('updates config without restarting', () => {
    const { ctrl, recog } = makeController({ config: { language: 'en-US' } });
    ctrl.start();
    ctrl.updateConfig({ language: 'de-DE' });
    expect(recog.lang).toBe('en-US'); // not picked up until next start
    ctrl.stop();
    recog.fireEnd();
    ctrl.start();
    // We need a fresh mock instance for the second start — verify by checking
    // that the constructor is called twice, but since we share a mock here we
    // can only assert config is now updated.
    expect(ctrl.getState()).toBe('starting');
  });

  it('treats a throwing start() as no-op and resets state', () => {
    const throwing = makeMockRecognition();
    (throwing.start as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('already started');
    });
    const ctrl = new VoiceController({
      config: defaultConfig(),
      ctor: function () {
        return throwing;
      } as unknown as SpeechRecognitionConstructor,
      events: { started: vi.fn(), transcript: vi.fn(), stopped: vi.fn(), errored: vi.fn() },
    });
    expect(ctrl.start()).toBe(false);
    expect(ctrl.getState()).toBe('idle');
  });

  it('treats a throwing stop() defensively', () => {
    const { ctrl, recog } = makeController();
    ctrl.start();
    recog.fireStart();
    (recog.stop as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not listening');
    });
    ctrl.stop();
    expect(ctrl.getState()).toBe('idle');
  });
});