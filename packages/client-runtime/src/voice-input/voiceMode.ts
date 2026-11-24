export const VOICE_MODE_LISTEN_WINDOW_MS = 8_000;
export const VOICE_MODE_WORKING_DELAY_MS = 4_000;
export const VOICE_MODE_WORKING_PHRASE = "Working on it";
export const VOICE_MODE_NEEDS_USER_PHRASE = "The agent needs you. Check the screen.";
export const VOICE_MODE_FAILED_PHRASE = "That run failed. Check the screen.";

export type VoiceModePhase =
  | "idle"
  | "listening"
  | "sending"
  | "waiting"
  | "speaking"
  | "paused"
  | "muted"
  | "ended";

export type VoiceModeState = {
  readonly phase: VoiceModePhase;
  readonly microphoneOpen: boolean;
  readonly manuallyMuted: boolean;
};

export type VoiceModeRunEvent =
  | { readonly type: "running" | "needs-user" | "failed" }
  | {
      readonly type: "finished";
      readonly finalMessage: string;
      readonly handledMessageIds: readonly string[];
    };

export type VoiceModeMicrophone = {
  readonly open: (onTranscript: (text: string) => Promise<void>) => void;
  readonly cancel: () => void;
  readonly finish: () => void;
};

export type VoiceModeSpeech = {
  readonly speak: (text: string) => Promise<void>;
  readonly stopSpeaking: () => void;
};

export type VoiceModeTimer = {
  readonly schedule: (delayMs: number, callback: () => void | Promise<void>) => () => void;
};

export type VoiceModeDependencies = {
  readonly microphone: VoiceModeMicrophone;
  readonly speech: VoiceModeSpeech;
  readonly sendSpokenMessage: (text: string) => Promise<string>;
  readonly timer: VoiceModeTimer;
  readonly toSpeech: (finalMessage: string) => string;
  readonly autoMute?: boolean;
};

export class VoiceModeController {
  constructor(_dependencies: VoiceModeDependencies) {}

  get currentState(): VoiceModeState {
    return { phase: "idle", microphoneOpen: false, manuallyMuted: false };
  }

  subscribe(_listener: (state: VoiceModeState) => void): () => void {
    return () => {};
  }

  start() {}
  end() {}
  toggleMute() {}
  interrupt() {}
  cancelTurn() {}
  tapToSend() {}
  async handleRunEvent(_event: VoiceModeRunEvent) {}
}
