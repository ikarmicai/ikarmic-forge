/**
 * Pure logic for the chat webview's voice input feature. The actual
 * SpeechRecognition lifecycle is browser-side (see `html.ts`), but every
 * pure decision lives here so we can unit-test it without a DOM.
 *
 * Architecture note: in the webview we instantiate a {@link VoiceController}
 * which delegates to a thin wrapper around `SpeechRecognition`. Tests inject
 * a mock via the {@link VoiceRuntime} argument so we never need a real DOM.
 */
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
  VoiceConfig,
  VoiceErrorCode,
  VoiceMessage,
  VoiceRuntime,
} from './voice-types.js';

// Feature detection + defaults

/**
 * Returns the SpeechRecognition constructor if the runtime supports the
 * Web Speech API, otherwise undefined. The webkit-prefixed variant covers
 * Safari + older Chromium builds; modern VS Code Electron has both.
 */
export function detectSpeechRecognition(rt: VoiceRuntime = globalThis): SpeechRecognitionConstructor | undefined {
  const ctor = rt.SpeechRecognition ?? rt.webkitSpeechRecognition;
  return typeof ctor === 'function' ? ctor : undefined;
}

/**
 * Resolve the effective BCP-47 language code. Empty config → runtime default
 * (typically `navigator.language`). Trims whitespace and falls back to
 * `'en-US'` if the runtime reports nothing usable.
 */
export function resolveLanguage(config: VoiceConfig, rt: VoiceRuntime = globalThis): string {
  const explicit = (config.language ?? '').trim();
  if (explicit) return explicit;
  const navLang = (rt.navigator?.language ?? '').trim();
  if (navLang) return navLang;
  return 'en-US';
}

/**
 * Map a raw `SpeechRecognitionErrorEvent.error` string into our narrower
 * {@link VoiceErrorCode} taxonomy. Anything unrecognized becomes `'unknown'`
 * so the UI can show a generic "voice input failed" message.
 */
export function mapErrorCode(raw: string): VoiceErrorCode {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return raw;
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    case 'language-not-supported':
      return 'language-not-supported';
    default:
      return 'unknown';
  }
}

/**
 * Friendly human message for each error code. Kept short: these show up
 * in a small banner inside the chat webview.
 */
export function errorMessageFor(code: VoiceErrorCode): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone permission denied. Allow access in your OS settings to use voice input.';
    case 'service-not-allowed':
      return 'Speech recognition is blocked in this environment (e.g. insecure origin or browser policy).';
    case 'no-speech':
      return 'No speech detected. Try again: the microphone may not have heard you.';
    case 'audio-capture':
      return 'No microphone available. Check that one is connected and not in use by another app.';
    case 'network':
      return 'Speech recognition requires a network connection (Chrome sends audio to a cloud STT service).';
    case 'aborted':
      return 'Voice input cancelled.';
    case 'language-not-supported':
      return 'Selected language is not supported by the speech engine.';
    case 'unknown':
    default:
      return 'Voice input failed. Try again or use the keyboard.';
  }
}

// Transcript utilities

/**
 * Walk a `SpeechRecognitionEvent` and return the *new* transcripts since
 * `resultIndex`. The browser fires `onresult` for both interim and final
 * results: the caller decides whether to surface interim text in the UI.
 *
 * Returns tuples of `{ transcript, isFinal }`. Empty transcripts are
 * filtered out (some engines emit them as padding).
 */
export function extractTranscripts(
  ev: SpeechRecognitionEventLike,
  options: { finalOnly?: boolean } = {}
): Array<{ transcript: string; isFinal: boolean }> {
  const out: Array<{ transcript: string; isFinal: boolean }> = [];
  for (let i = ev.resultIndex; i < ev.results.length; i++) {
    const result = ev.results[i];
    if (!result || result.length === 0) continue;
    const alt = result[0];
    if (!alt) continue;
    const transcript = (alt.transcript ?? '').trim();
    if (!transcript) continue;
    if (options.finalOnly && !result.isFinal) continue;
    out.push({ transcript, isFinal: result.isFinal });
  }
  return out;
}

/**
 * Concatenate a sequence of transcript chunks into a single utterance.
 * Trims + collapses internal whitespace so multiple interim segments
 * don't end up with extra spaces in the textarea.
 */
export function joinTranscripts(parts: Array<{ transcript: string }>): string {
  return parts.map((p) => p.transcript).join(' ').replace(/\s+/g, ' ').trim();
}

// Controller

/** Emitted by the controller. The webview UI subscribes to these. */
export interface VoiceControllerEvents {
  started: () => void;
  /**
   * @param transcript - the latest finalized text (single utterance).
   * @param interim   - the current interim text, if any (or '' when stable).
   */
  transcript: (transcript: string, interim: string) => void;
  stopped: (reason: VoiceStopReason) => void;
  errored: (msg: VoiceMessage & { type: 'voice_error' }) => void;
}

/**
 * Why a session ended.
 *  - `user`: we (or the user) called stop()/abort().
 *  - `silence`: engine ended the session because the user stopped talking.
 *  - `error`: engine ended after firing onerror.
 */
export type VoiceStopReason = 'user' | 'silence' | 'error';

/**
 * Thin wrapper around `SpeechRecognition` that:
 *  - guards against double-start (no-op if already listening)
 *  - restarts itself after `onend` when `continuous` is set (engine stopped
 *    because of silence, not because the user said stop)
 *  - normalizes errors into our {@link VoiceErrorCode} taxonomy
 *  - posts `VoiceMessage`s through `post` so the extension host can mirror
 *    status to the status bar / log
 *
 * All browser-y bits (event listeners, the SpeechRecognition instance) are
 * created lazily from the {@link VoiceRuntime} argument, so tests can swap
 * the runtime out for a stub that emits deterministic events.
 */
export class VoiceController {
  private recognition: SpeechRecognitionLike | null = null;
  private state: 'idle' | 'starting' | 'listening' | 'stopping' = 'idle';
  /** Accumulated final transcripts since the current start(). */
  private finalBuffer = '';
  /** Latest interim transcript (cleared on each new final). */
  private interim = '';
  /** True after we've called abort(): suppresses auto-restart on onend. */
  private aborted = false;
  /** Set when the engine fired onerror before onend. */
  private hadError = false;
  private config: VoiceConfig;
  private rt: VoiceRuntime;
  private ctor: SpeechRecognitionConstructor | undefined;
  private events: VoiceControllerEvents;
  /** Sink for messages that should travel back to the extension host. */
  private post: (msg: VoiceMessage) => void;

  constructor(args: {
    config: VoiceConfig;
    runtime?: VoiceRuntime;
    ctor?: SpeechRecognitionConstructor;
    events: VoiceControllerEvents;
    post?: (msg: VoiceMessage) => void;
  }) {
    this.config = args.config;
    this.rt = args.runtime ?? (globalThis as VoiceRuntime);
    this.ctor = args.ctor ?? detectSpeechRecognition(this.rt);
    this.events = args.events;
    this.post = args.post ?? (() => {});
  }

  /** Feature-detect support without touching the DOM. */
  isSupported(): boolean {
    return this.ctor !== undefined;
  }

  /** Current lifecycle state: useful for the UI to render the mic button. */
  getState(): 'idle' | 'starting' | 'listening' | 'stopping' {
    return this.state;
  }

  /**
   * Begin listening. No-op if already listening or if the API is unsupported.
   * Returns true if a new session was started.
   */
  start(): boolean {
    if (!this.ctor || !this.config.enabled) return false;
    if (this.state === 'listening' || this.state === 'starting') return false;

    const recog = new this.ctor();
    recog.lang = resolveLanguage(this.config, this.rt);
    recog.continuous = this.config.continuous;
    recog.interimResults = this.config.interimResults;
    recog.maxAlternatives = 1;

    this.recognition = recog;
    this.state = 'starting';
    this.aborted = false;
    this.hadError = false;
    this.finalBuffer = '';
    this.interim = '';

    recog.onstart = () => {
      this.state = 'listening';
      this.events.started();
      this.post({ type: 'voice_started' });
    };

    recog.onresult = (ev: SpeechRecognitionEventLike) => {
      const chunks = extractTranscripts(ev, { finalOnly: false });
      let interim = '';
      for (const chunk of chunks) {
        if (chunk.isFinal) {
          this.finalBuffer = joinTranscripts([
            { transcript: this.finalBuffer },
            { transcript: chunk.transcript },
          ]);
        } else {
          interim = chunk.transcript;
        }
      }
      this.interim = interim;
      this.events.transcript(this.finalBuffer, this.interim);
    };

    recog.onerror = (ev: SpeechRecognitionErrorEventLike) => {
      const code = mapErrorCode(ev.error);
      const message = errorMessageFor(code);
      this.hadError = true;
      this.events.errored({ type: 'voice_error', code, message });
      this.post({ type: 'voice_error', code, message });
      // The engine always fires `onend` after `onerror`, so leave final
      // teardown to the onend handler.
    };

    recog.onend = () => {
      const wasAborted = this.aborted;
      const wasStopping = this.state === 'stopping';
      this.recognition = null;
      this.state = 'idle';

      // When `continuous: true`, the engine may end the session because of
      // silence. We honor `continuous` by restarting unless the user (or an
      // error) explicitly aborted.
      if (this.config.continuous && !wasAborted && !wasStopping && !this.hadError) {
        this.start();
        return;
      }

      let reason: VoiceStopReason;
      if (wasAborted || wasStopping) reason = 'user';
      else if (this.hadError) reason = 'error';
      else reason = 'silence';

      this.events.stopped(reason);
      this.post({ type: 'voice_stopped', reason });
    };

    try {
      recog.start();
      return true;
    } catch {
      // start() throws if already started: we already guarded, so this is
      // an engine-level error. Treat as no-op.
      this.recognition = null;
      this.state = 'idle';
      return false;
    }
  }

  /**
   * Stop the current session. The engine finalizes any pending utterance,
   * fires `onresult` (with the final transcript), then `onend`. We don't
   * restart regardless of `continuous`.
   */
  stop(): void {
    if (this.state !== 'listening' && this.state !== 'starting') return;
    this.state = 'stopping';
    try {
      this.recognition?.stop();
    } catch {
      // If stop() throws we still want to mark state idle: defensive.
      this.state = 'idle';
      this.recognition = null;
    }
  }

  /**
   * Cancel immediately without waiting for a final transcript. Used by the
   * Cancel button or by config toggling while listening.
   */
  abort(): void {
    if (this.state === 'idle') return;
    this.aborted = true;
    this.state = 'stopping';
    try {
      this.recognition?.abort();
    } catch {
      this.state = 'idle';
      this.recognition = null;
    }
  }

  /** Update config at runtime: takes effect on the next start(). */
  updateConfig(patch: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /** Read-only snapshot for tests. */
  debug(): { state: string; finalBuffer: string; interim: string } {
    return {
      state: this.state,
      finalBuffer: this.finalBuffer,
      interim: this.interim,
    };
  }
}