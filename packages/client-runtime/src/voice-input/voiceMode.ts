export const VOICE_MODE_LISTEN_WINDOW_MS = 8_000;
export const VOICE_MODE_WORKING_DELAY_MS = 4_000;
export const VOICE_MODE_WORKING_PHRASE = "Working on it";
export const VOICE_MODE_NEEDS_USER_PHRASE = "The agent needs you. Check the screen.";
export const VOICE_MODE_FAILED_PHRASE = "That run failed. Check the screen.";
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

type FinishedRun = Extract<VoiceModeRunEvent, { type: "finished" }>;

type MicrophoneWindow = {
  heardSpeech: boolean;
  finishing?: PromiseWithResolvers<void>;
};

export class VoiceModeController {
  private readonly autoMute: boolean;
  private readonly dependencies: VoiceModeDependencies;
  private readonly listeners = new Set<(state: VoiceModeState) => void>();
  private state: VoiceModeState = {
    phase: "idle",
    microphoneOpen: false,
    manuallyMuted: false,
  };
  private lifecycle: "idle" | "active" | "ended" = "idle";
  private run: "idle" | "running" | "paused" = "idle";
  private wantsMicrophone = true;
  private manuallyMuted = false;
  private microphoneWindow: MicrophoneWindow | undefined;
  private playback: object | undefined;
  private sending: object | undefined;
  private latestMessageId: string | undefined;
  private finishedDuringSend: FinishedRun[] = [];
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
    this.sending = undefined;
    this.finishedDuringSend = [];
    this.clearListenTimer();
    this.clearWorkingTimer();
    this.stopPlayback();
    this.refresh();
  }

  toggleMute(): void {
    if (this.lifecycle !== "active") return;
    this.clearListenTimer();
    this.manuallyMuted =
      !this.manuallyMuted && (this.state.microphoneOpen || this.canOpenMicrophone());
    if (!this.manuallyMuted) this.wantsMicrophone = true;
    this.refresh();
  }

  interrupt(): void {
    if (!this.playback) return;
    this.stopPlayback();
    this.manuallyMuted = false;
    this.wantsMicrophone = true;
    this.clearListenTimer();
    this.refresh();
  }

  cancelTurn(): void {
    if (!this.microphoneWindow) return;
    this.closeMicrophone();
    this.refresh();
  }

  noteSpeechActivity(): void {
    const window = this.microphoneWindow;
    if (!window) return;
    window.heardSpeech = true;
    this.clearListenTimer();
  }

  tapToSend(): void {
    const window = this.microphoneWindow;
    if (!window || window.finishing) return;
    window.finishing = Promise.withResolvers<void>();
    this.clearListenTimer();
    this.dependencies.microphone.finish();
  }

  async handleRunEvent(event: VoiceModeRunEvent): Promise<void> {
    if (this.lifecycle !== "active") return;
    switch (event.type) {
      case "running":
        this.run = "running";
        this.scheduleWorkingTimer();
        this.refresh();
        break;
      case "needs-user":
        if (this.run === "paused") return;
        this.run = "paused";
        this.clearWorkingTimer();
        await this.speak(VOICE_MODE_NEEDS_USER_PHRASE);
        break;
      case "failed":
        this.run = "idle";
        this.latestMessageId = undefined;
        this.finishedDuringSend = [];
        this.clearWorkingTimer();
        await this.speak(VOICE_MODE_FAILED_PHRASE, true);
        break;
      case "finished":
        this.run = "idle";
        this.clearWorkingTimer();
        if (this.sending) this.finishedDuringSend.push(event);
        if (!this.sending && (await this.speakReply(event))) return;
        this.refresh();
    }
  }

  private async speakReply(event: FinishedRun): Promise<boolean> {
    if (
      this.latestMessageId === undefined ||
      !event.handledMessageIds.includes(this.latestMessageId)
    ) {
      return false;
    }
    this.latestMessageId = undefined;
    await this.speak(this.dependencies.toSpeech(event.finalMessage), true);
    return true;
  }

  private closeMicrophone(): void {
    const window = this.microphoneWindow;
    if (!window) return;
    this.microphoneWindow = undefined;
    this.dependencies.microphone.cancel();
    window.finishing?.resolve();
  }

  private async receiveTranscript(window: MicrophoneWindow, transcript: string): Promise<void> {
    if (window !== this.microphoneWindow) return;
    this.microphoneWindow = undefined;
    window.finishing?.resolve();
    const text = transcript.trim();
    if (!text) {
      this.refresh();
      return;
    }

    const send = {};
    this.sending = send;
    this.clearListenTimer();
    if (this.autoMute) this.wantsMicrophone = false;
    this.refresh();

    let messageId: string;
    try {
      messageId = await this.dependencies.sendSpokenMessage(text);
    } catch {
      if (this.sending !== send) {
        await this.speak(VOICE_MODE_SEND_FAILED_PHRASE);
        return;
      }
      this.sending = undefined;
      const finished = this.takeBufferedReply();
      await this.speak(VOICE_MODE_SEND_FAILED_PHRASE, true);
      if (finished) await this.speakReply(finished);
      return;
    }
    if (this.sending !== send) return;

    if (this.latestMessageId === undefined) this.workingAnnounced = false;
    this.latestMessageId = messageId;
    this.sending = undefined;
    const finished = this.takeBufferedReply();
    if (finished) {
      await this.speakReply(finished);
      return;
    }
    this.scheduleWorkingTimer();
    this.refresh();
  }

  private takeBufferedReply(): FinishedRun | undefined {
    const messageId = this.latestMessageId;
    const finished = this.finishedDuringSend.find(
      (event) => messageId !== undefined && event.handledMessageIds.includes(messageId),
    );
    this.finishedDuringSend = [];
    return finished;
  }

  private async speak(text: string, reopen = false): Promise<void> {
    const finishing = this.microphoneWindow?.finishing;
    if (finishing) await finishing.promise;
    if (this.lifecycle !== "active") return;
    this.stopPlayback();
    if (text) {
      const playback = {};
      this.playback = playback;
      this.refresh();
      try {
        await this.dependencies.speech.speak(text);
      } catch {
        // A playback failure still releases the microphone.
      }
      if (this.playback !== playback) return;
      this.playback = undefined;
    }

    if (reopen && !this.sending && this.latestMessageId === undefined) {
      this.wantsMicrophone = true;
      this.clearListenTimer();
      if (this.autoMute && !this.manuallyMuted && this.run !== "paused") {
        this.cancelListenTimer = this.dependencies.timer.schedule(
          VOICE_MODE_LISTEN_WINDOW_MS,
          () => {
            this.cancelListenTimer = undefined;
            this.wantsMicrophone = false;
            this.refresh();
          },
        );
      }
    }
    this.refresh();
  }

  private stopPlayback(): void {
    if (!this.playback) return;
    this.playback = undefined;
    this.dependencies.speech.stopSpeaking();
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
      if (this.microphoneWindow?.heardSpeech || this.microphoneWindow?.finishing) return;
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
      !this.manuallyMuted &&
      this.wantsMicrophone
    );
  }

  private refresh(): void {
    if (this.canOpenMicrophone()) {
      if (!this.microphoneWindow) {
        const window = { heardSpeech: false };
        this.microphoneWindow = window;
        this.dependencies.microphone.open((text) => this.receiveTranscript(window, text));
      }
    } else if (this.lifecycle === "ended" || !this.microphoneWindow?.finishing) {
      this.closeMicrophone();
    }

    const microphoneOpen = this.microphoneWindow !== undefined;
    const phase = this.phase(microphoneOpen);
    if (
      this.state.phase === phase &&
      this.state.microphoneOpen === microphoneOpen &&
      this.state.manuallyMuted === this.manuallyMuted
    ) {
      return;
    }
    this.state = { phase, microphoneOpen, manuallyMuted: this.manuallyMuted };
    for (const listener of this.listeners) listener(this.state);
  }

  private phase(microphoneOpen: boolean): VoiceModePhase {
    if (this.lifecycle !== "active") return this.lifecycle;
    if (this.run === "paused") return "paused";
    if (this.playback) return "speaking";
    if (this.sending) return "sending";
    if (this.latestMessageId !== undefined) return "waiting";
    return microphoneOpen ? "listening" : "muted";
  }
}
