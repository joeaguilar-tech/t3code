export const VOICE_MODE_LISTEN_WINDOW_MS = 8_000;
const VOICE_MODE_TRANSCRIPTION_TIMEOUT_MS = 15_000;
export const VOICE_MODE_WORKING_DELAY_MS = 4_000;
export const VOICE_MODE_WORKING_PHRASE = "Working on it";
export const VOICE_MODE_NEEDS_USER_PHRASE = "The agent needs you. Check the screen.";
export const VOICE_MODE_FAILED_PHRASE = "That run failed. Check the screen.";
/** @public */
export const VOICE_MODE_EARLIER_REQUEST_FAILED_PHRASE =
  "An earlier request failed. Check the screen.";
/** @public */
export const VOICE_MODE_SEND_FAILED_PHRASE = "That message didn't send. Check the screen.";

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
  readonly playing: boolean;
  readonly manuallyMuted: boolean;
};

export type VoiceModeRunEvent =
  | { readonly type: "running" | "needs-user" }
  | { readonly type: "failed"; readonly handledMessageIds: readonly string[] }
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

type RunResult = Extract<VoiceModeRunEvent, { type: "finished" | "failed" }>;

type SpeechRequest = {
  text: string;
  reopen: boolean;
  resolve: () => void;
};

type MicrophoneWindow = {
  timed: boolean;
  finishing: boolean;
  cancelTranscriptionTimer?: () => void;
  protection?: {
    settled: Promise<void>;
    release: () => void;
  };
};

export class VoiceModeController {
  private readonly autoMute: boolean;
  private readonly dependencies: VoiceModeDependencies;
  private readonly listeners = new Set<(state: VoiceModeState) => void>();
  private state: VoiceModeState = {
    phase: "idle",
    microphoneOpen: false,
    playing: false,
    manuallyMuted: false,
  };
  private lifecycle: "idle" | "active" | "ended" = "idle";
  private run: "idle" | "running" | "paused" = "idle";
  private wantsMicrophone = true;
  private manuallyMuted = false;
  private microphoneWindow: MicrophoneWindow | undefined;
  private playback: SpeechRequest | undefined;
  private readonly speechQueue: SpeechRequest[] = [];
  private sendSequence = 0;
  private readonly pendingSends = new Set<number>();
  private latestMessageId: string | undefined;
  private resultsDuringSend: RunResult[] = [];
  private workingAnnounced = false;
  private cancelWorkingTimer: (() => void) | undefined;
  private cancelListenTimer: (() => void) | undefined;

  constructor(dependencies: VoiceModeDependencies) {
    this.dependencies = dependencies;
    this.autoMute = dependencies.autoMute ?? true;
  }

  get currentState(): VoiceModeState {
    return this.state;
  }

  subscribe(listener: (state: VoiceModeState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.lifecycle !== "idle") return;
    this.lifecycle = "active";
    this.refresh();
  }

  end(): void {
    if (this.lifecycle === "ended") return;
    this.lifecycle = "ended";
    this.pendingSends.clear();
    this.resultsDuringSend = [];
    this.clearListenTimer();
    this.clearWorkingTimer();
    this.stopPlayback();
    this.refresh();
  }

  mute(): void {
    if (!this.manuallyMuted) this.setManualMute(true);
  }

  toggleMute(): void {
    this.setManualMute(this.state.microphoneOpen);
  }

  private setManualMute(muted: boolean): void {
    if (this.lifecycle !== "active") return;
    this.clearListenTimer();
    const window = this.microphoneWindow;
    this.manuallyMuted = muted;
    if (this.manuallyMuted && window?.protection && !window.finishing) {
      this.cancelTurn();
      return;
    }
    if (window) window.timed = false;
    if (!this.manuallyMuted) this.wantsMicrophone = true;
    this.refresh();
  }

  interrupt(): void {
    if (!this.playback && this.speechQueue.length === 0) return;
    this.stopPlayback();
    this.manuallyMuted = false;
    if (this.run !== "paused") this.requestListenWindow();
    this.refresh();
  }

  cancelTurn(): void {
    const window = this.microphoneWindow;
    if (!window) return;
    this.muteAfterIncompleteWindow(window);
    this.closeMicrophone();
    this.refresh();
  }

  noteSpeechActivity(): void {
    const window = this.microphoneWindow;
    if (!window) return;
    this.protectWindow(window);
  }

  tapToSend(): void {
    const window = this.microphoneWindow;
    if (!window || window.finishing) return;
    window.finishing = true;
    this.protectWindow(window);
    this.dependencies.microphone.finish();
    if (this.microphoneWindow !== window) return;
    window.cancelTranscriptionTimer = this.dependencies.timer.schedule(
      VOICE_MODE_TRANSCRIPTION_TIMEOUT_MS,
      () => {
        if (this.microphoneWindow === window) this.cancelTurn();
      },
    );
    this.refresh();
  }

  private protectWindow(window: MicrophoneWindow): void {
    if (window.protection) return;
    this.clearListenTimer();
    let release!: () => void;
    const settled = new Promise<void>((resolve) => {
      release = resolve;
    });
    window.protection = { settled, release };
  }

  async handleRunEvent(event: VoiceModeRunEvent): Promise<void> {
    if (this.lifecycle !== "active") return;
    switch (event.type) {
      case "running":
        this.run = "running";
        this.scheduleWorkingTimer();
        this.refresh();
        break;
      case "needs-user": {
        if (this.run === "paused") return;
        this.run = "paused";
        this.clearWorkingTimer();
        const announcement = this.speak(VOICE_MODE_NEEDS_USER_PHRASE);
        this.refresh();
        await announcement;
        break;
      }
      case "failed":
      case "finished":
        this.run = "idle";
        this.clearWorkingTimer();
        if (this.pendingSends.size > 0) {
          this.resultsDuringSend.push(event);
        } else {
          await this.announceRunResult(event);
        }
        this.refresh();
    }
  }

  private async announceRunResult(event: RunResult): Promise<void> {
    if (this.lifecycle !== "active") return;
    const messageId = this.latestMessageId;
    const matches = messageId !== undefined && event.handledMessageIds.includes(messageId);
    if (event.type === "finished" && !matches) return;
    if (event.type === "failed" && messageId !== undefined && !matches) {
      await this.speak(VOICE_MODE_EARLIER_REQUEST_FAILED_PHRASE);
      return;
    }
    this.latestMessageId = undefined;
    const text =
      event.type === "failed"
        ? VOICE_MODE_FAILED_PHRASE
        : this.dependencies.toSpeech(event.finalMessage);
    await this.speak(text, true);
  }

  private closeMicrophone(): void {
    const window = this.microphoneWindow;
    if (!window) return;
    this.releaseWindow(window);
    this.dependencies.microphone.cancel();
  }

  private releaseWindow(window: MicrophoneWindow): void {
    this.microphoneWindow = undefined;
    window.cancelTranscriptionTimer?.();
    window.protection?.release();
  }

  private muteAfterIncompleteWindow(window: MicrophoneWindow): void {
    if (window.timed && window.protection) this.wantsMicrophone = false;
  }

  private async receiveTranscript(window: MicrophoneWindow, transcript: string): Promise<void> {
    if (window !== this.microphoneWindow) return;
    this.releaseWindow(window);
    const text = transcript.trim();
    if (!text) {
      this.muteAfterIncompleteWindow(window);
      this.refresh();
      return;
    }

    const send = ++this.sendSequence;
    this.pendingSends.add(send);
    this.clearListenTimer();
    if (this.autoMute && window.timed) this.wantsMicrophone = false;
    this.refresh();

    let messageId: string;
    try {
      messageId = await this.dependencies.sendSpokenMessage(text);
    } catch {
      const wasPending = this.pendingSends.delete(send);
      const replay = wasPending ? this.resumeRunTracking() : undefined;
      const announcement = this.speak(VOICE_MODE_SEND_FAILED_PHRASE, wasPending);
      await Promise.all([replay, announcement]);
      return;
    }
    if (!this.pendingSends.has(send)) return;

    if (this.latestMessageId === undefined) this.workingAnnounced = false;
    this.latestMessageId = messageId;
    for (const pending of this.pendingSends) {
      if (pending <= send) this.pendingSends.delete(pending);
    }
    await this.resumeRunTracking();
  }

  private async resumeRunTracking(): Promise<void> {
    if (this.pendingSends.size > 0) return;
    await Promise.all(
      this.takeBufferedRunResults().map((result) => this.announceRunResult(result)),
    );
    if (this.lifecycle !== "active") return;
    this.scheduleWorkingTimer();
    this.refresh();
  }

  private takeBufferedRunResults(): RunResult[] {
    // The run can settle before the send port returns the message ID.
    const results = this.resultsDuringSend;
    this.resultsDuringSend = [];
    return results;
  }

  private speak(text: string, reopen = false): Promise<void> {
    if (this.lifecycle !== "active") return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.speechQueue.push({ text, reopen, resolve });
      if (!this.playback && this.speechQueue.length === 1) void this.playQueuedSpeech();
    });
  }

  private async playQueuedSpeech(): Promise<void> {
    const first = this.speechQueue[0];
    const protection = this.microphoneWindow?.protection;
    if (protection) {
      this.refresh();
      await protection.settled;
      if (this.speechQueue[0] !== first) return;
    }

    let reopen = false;
    for (let request = this.speechQueue.shift(); request; request = this.speechQueue.shift()) {
      if (request.text) {
        this.playback = request;
        this.refresh();
        if (this.playback !== request) return;
        try {
          await this.dependencies.speech.speak(request.text);
        } catch {
          // A playback failure still releases the microphone.
        }
        if (this.playback !== request) return;
        this.playback = undefined;
      }
      reopen ||= request.reopen;
      request.resolve();
    }

    if (
      reopen &&
      this.run !== "paused" &&
      this.pendingSends.size === 0 &&
      this.latestMessageId === undefined
    ) {
      this.requestListenWindow();
    }
    this.refresh();
  }

  private requestListenWindow(): void {
    this.wantsMicrophone = true;
    this.clearListenTimer();
  }

  private armListenTimer(): void {
    if (!this.autoMute || this.cancelListenTimer) return;
    this.cancelListenTimer = this.dependencies.timer.schedule(VOICE_MODE_LISTEN_WINDOW_MS, () => {
      this.cancelListenTimer = undefined;
      this.wantsMicrophone = false;
      this.refresh();
    });
  }

  private stopPlayback(): void {
    for (const request of this.speechQueue.splice(0)) request.resolve();
    const playback = this.playback;
    if (!playback) return;
    this.playback = undefined;
    this.dependencies.speech.stopSpeaking();
    playback.resolve();
  }

  private scheduleWorkingTimer(): void {
    if (
      !this.latestMessageId ||
      this.run !== "running" ||
      this.cancelWorkingTimer ||
      this.workingAnnounced
    ) {
      return;
    }
    this.cancelWorkingTimer = this.dependencies.timer.schedule(VOICE_MODE_WORKING_DELAY_MS, () => {
      this.cancelWorkingTimer = undefined;
      this.workingAnnounced = true;
      if (this.microphoneWindow?.protection || this.playback || this.speechQueue.length > 0) return;
      return this.speak(VOICE_MODE_WORKING_PHRASE);
    });
  }

  private clearWorkingTimer(): void {
    this.cancelWorkingTimer?.();
    this.cancelWorkingTimer = undefined;
  }

  private clearListenTimer(): void {
    this.cancelListenTimer?.();
    this.cancelListenTimer = undefined;
  }

  private canOpenMicrophone(): boolean {
    return (
      this.lifecycle === "active" &&
      this.run !== "paused" &&
      !this.playback &&
      this.speechQueue.length === 0 &&
      !this.manuallyMuted &&
      this.wantsMicrophone
    );
  }

  private refresh(): void {
    const canOpenMicrophone = this.canOpenMicrophone();
    if (canOpenMicrophone) {
      if (!this.microphoneWindow) {
        this.armListenTimer();
        const window = {
          timed: this.cancelListenTimer !== undefined,
          finishing: false,
        };
        this.microphoneWindow = window;
        this.dependencies.microphone.open((text) => this.receiveTranscript(window, text));
      }
    } else if (this.lifecycle === "ended" || !this.microphoneWindow?.protection) {
      this.closeMicrophone();
    }

    const microphoneOpen = this.microphoneWindow !== undefined && !this.microphoneWindow.finishing;
    const playing = this.playback !== undefined;
    const phase = this.phase(microphoneOpen);
    if (
      this.state.phase === phase &&
      this.state.microphoneOpen === microphoneOpen &&
      this.state.playing === playing &&
      this.state.manuallyMuted === this.manuallyMuted
    ) {
      return;
    }
    this.state = { phase, microphoneOpen, playing, manuallyMuted: this.manuallyMuted };
    for (const listener of this.listeners) listener(this.state);
  }

  private phase(microphoneOpen: boolean): VoiceModePhase {
    if (this.lifecycle !== "active") return this.lifecycle;
    if (this.run === "paused") return "paused";
    if (this.playback) return "speaking";
    if (this.pendingSends.size > 0) return "sending";
    if (this.latestMessageId !== undefined) return "waiting";
    return microphoneOpen ? "listening" : "muted";
  }
}
