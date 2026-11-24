import type {
  VoiceInputPhase,
  VoiceModeMicrophone,
  VoiceModeSpeech,
} from "@t3tools/client-runtime/voice-input";
import {
  acquireAudioSession,
  activateAudioSession,
  releaseAudioSession,
} from "../../lib/audioSession";
import { createVoiceInputTarget, type VoiceInputSession } from "../voice-input/voiceInputSession";
import { createQuietDetector, VOICE_QUIET_THRESHOLD } from "./quietDetector";
import { speak, stopSpeaking } from "./speech";

type Window = {
  unsubscribe?: () => void;
  stop: () => void;
  finishRequested: boolean;
};

let audioReady = Promise.resolve();

export function createVoiceModeAudio(input: {
  session: VoiceInputSession;
  ownerKey: string;
  requestFinish: () => void;
  noteSpeechActivity: () => void;
  onError: (message: string) => void;
  onCaptureChange: (phase: VoiceInputPhase) => void;
}) {
  const { session, ownerKey } = input;
  let window: Window | null = null;
  let playback: { stopped: boolean } | null = null;
  let recordingOperation = Promise.resolve();
  let heldToken: ReturnType<typeof acquireAudioSession> | null = null;

  const releaseHeldToken = async () => {
    const token = heldToken;
    heldToken = null;
    if (token) await releaseAudioSession(token).catch(() => {});
  };

  const ownsInput = () => session.ownerKey === ownerKey;
  const closeWindow = () => {
    window?.unsubscribe?.();
    window = null;
    input.onCaptureChange("idle");
  };
  const finish: VoiceModeMicrophone["finish"] = () => {
    if (!window || window.finishRequested) return;
    window.finishRequested = true;
    window.stop();
  };

  const microphone: VoiceModeMicrophone = {
    open(onTranscript) {
      const current: Window = {
        finishRequested: false,
        stop() {
          if (
            window !== current ||
            !ownsInput() ||
            session.controller.currentState.phase !== "recording"
          )
            return;
          recordingOperation = session.controller.stop().catch(() => {
            complete("Could not finish voice recording.", "");
          });
        },
      };
      const quiet = createQuietDetector();
      let heardSpeech = false;
      let transcript = "";
      window = current;

      let completing = false;
      const complete = (error: string | null, text = transcript) => {
        if (completing || window !== current) return;
        completing = true;
        queueMicrotask(() => {
          const settled = Promise.allSettled([recordingOperation, session.nativeRecordingSettled]);
          audioReady = Promise.all([audioReady, settled]).then(() => {});
          void settled.then(() => {
            if (window !== current) return;
            closeWindow();
            if (error && ownsInput()) session.cancel(ownerKey);
            void onTranscript(text);
            if (error && error !== "No speech was detected.") input.onError(error);
          });
        });
      };
      input.onCaptureChange("preparing");
      const start = audioReady.then(async () => {
        if (window !== current) return;
        const target = {
          ...createVoiceInputTarget(
            ownerKey,
            () => "",
            (text) => {
              transcript = text;
            },
            { start: 0, end: 0 },
          ),
          voiceMode: true,
          onAudioSessionAcquired: () => void releaseHeldToken(),
          retainAudioSession(token: ReturnType<typeof acquireAudioSession>) {
            if (!playback || playback.stopped) return false;
            heldToken = token;
            return true;
          },
          onMeteringSample(level: number) {
            if (window !== current) return;
            if (!heardSpeech && level >= VOICE_QUIET_THRESHOLD) {
              heardSpeech = true;
              input.noteSpeechActivity();
            }
            if (quiet.sample(level)) input.requestFinish();
          },
        };
        let started = false;
        current.unsubscribe = session.subscribe(() => {
          if (window !== current) return;
          if (!ownsInput()) {
            if (started) complete("Another voice recording is already active.", "");
            return;
          }
          const { phase, error } = session.controller.currentState;
          input.onCaptureChange(phase);
          if (phase === "preparing") started = true;
          if (!started) return;
          if (phase === "recording" && current.finishRequested) {
            queueMicrotask(current.stop);
          }
          if (phase === "transcribing") input.requestFinish();
          if (phase === "idle" || phase === "error") complete(error);
        });
        await session.start(target);
        if (!started) complete("Another voice recording is already active.", "");
      });
      recordingOperation = start.catch(() => {
        complete("Could not start voice recording.", "");
      });
    },
    cancel() {
      if (!window) return;
      closeWindow();
      if (!playback) void releaseHeldToken();
      if (!ownsInput()) return;
      const stop =
        session.controller.currentState.phase === "recording"
          ? session.controller.interruptRecording()
          : undefined;
      session.cancel(ownerKey);
      audioReady = Promise.allSettled([
        audioReady,
        recordingOperation,
        session.nativeRecordingSettled,
        stop,
      ]).then(() => {});
    },
    finish,
  };

  const speech: VoiceModeSpeech = {
    speak(text) {
      const current = { stopped: false };
      playback = current;
      const speaking = audioReady.then(async () => {
        if (current.stopped) {
          if (playback === current) playback = null;
          if (!window && !playback) await releaseHeldToken();
          return;
        }
        const token = acquireAudioSession("voice-mode-speech", () => {
          current.stopped = true;
          void stopSpeaking();
        });
        await releaseHeldToken();
        heldToken = token;
        try {
          if ((await activateAudioSession(token)) && !current.stopped) await speak(text);
        } finally {
          if (current.stopped) await stopSpeaking();
          if (playback === current) playback = null;
        }
      });
      audioReady = speaking.catch(() => {});
      void audioReady.then(() => {
        // The controller has processed playback completion before this continuation.
        if (!window && !playback) return releaseHeldToken();
      });
      return speaking;
    },
    stopSpeaking() {
      if (!playback) return;
      playback.stopped = true;
      void stopSpeaking();
    },
  };
  return {
    microphone,
    speech,
    dispose() {
      audioReady = audioReady.then(releaseHeldToken);
    },
  };
}
