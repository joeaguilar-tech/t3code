import { useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import {
  VoiceModeController,
  voiceInputBlocksSubmission,
  type VoiceModeState,
} from "@t3tools/client-runtime/voice-input";
import { splitSpokenReply } from "@t3tools/shared/spokenReply";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";
import * as Dialog from "../../components/ui/Dialog";
import { useAppForeground } from "../../lib/appState";
import { uuidv4 } from "../../lib/uuid";
import { mobilePreferencesAtom } from "../../state/preferences";
import { keepScreenAwake, useVoiceInputCapture } from "../voice-input/VoiceInputProvider";
import { deriveVoiceRunEvents, voiceModeAutoMute, type ThreadVoiceState } from "./threadVoiceMode";
import { createVoiceModeAudio } from "./voiceModeAudio";

type Session = {
  readonly threadKey: string;
  readonly controller: VoiceModeController;
  readonly dispose: () => void;
  previous: ThreadVoiceState;
};

export function useVoiceMode(input: {
  readonly threadKey: string | null;
  readonly enabled: boolean;
  readonly runs: ThreadVoiceState["runs"] | undefined;
  readonly messages: ThreadVoiceState["messages"] | undefined;
  readonly needsUser: boolean;
  readonly sendSpokenMessage: (text: string) => Promise<string>;
}) {
  const voiceInput = useVoiceInputCapture();
  const foreground = useAppForeground();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const [state, setState] = useState<VoiceModeState | null>(null);
  const [recording, setRecording] = useState(false);
  const active = useRef<Session | null>(null);
  const latest = useRef(input);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the long-lived controller must use committed thread and permission state when a transcript arrives
  useLayoutEffect(() => {
    latest.current = input;
  });

  const end = useCallback(() => {
    const session = active.current;
    if (!session) return;
    active.current = null;
    session.dispose();
    setState(null);
  }, []);

  const threadKey = input.threadKey;
  useFocusEffect(useCallback(() => end, [end]));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases native audio and keep-awake when leaving the thread or the foreground
  useLayoutEffect(() => {
    if (!foreground || !input.enabled || active.current?.threadKey !== threadKey) end();
  }, [end, foreground, input.enabled, threadKey]);

  const { runs, messages, needsUser } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- forwards server projection transitions to the session controller
  useEffect(() => {
    const session = active.current;
    if (!session || !runs || !messages) return;
    const thread = { runs, messages, needsUser };
    const events = deriveVoiceRunEvents(session.previous, thread);
    session.previous = thread;
    for (const event of events) void session.controller.handleRunEvent(event);
  }, [runs, messages, needsUser]);

  const available =
    Platform.OS === "ios" &&
    input.enabled &&
    threadKey !== null &&
    runs !== undefined &&
    messages !== undefined;
  const canStart =
    available &&
    foreground &&
    voiceInput.available &&
    AsyncResult.isSuccess(preferences) &&
    !preferences.waiting;

  const start = () => {
    if (
      !canStart ||
      !runs ||
      !messages ||
      threadKey === null ||
      active.current ||
      voiceInputBlocksSubmission(voiceInput.session.controller.currentState)
    )
      return;
    Keyboard.dismiss();
    const thread = { runs, messages, needsUser };
    const ownerKey = `voice-mode:${uuidv4()}`;
    const audio = createVoiceModeAudio({
      session: voiceInput.session,
      ownerKey,
      noteSpeechActivity: () => controller.noteSpeechActivity(),
      onCaptureChange: setRecording,
      onError(message) {
        end();
        Dialog.alert("Voice mode stopped", message);
      },
    });
    const controller = new VoiceModeController({
      microphone: audio.microphone,
      speech: audio.speech,
      autoMute: voiceModeAutoMute(preferences.value.voiceModeAutoMute),
      sendSpokenMessage: (text) => {
        const current = latest.current;
        if (
          active.current?.controller !== controller ||
          current.threadKey !== threadKey ||
          !current.enabled ||
          !current.runs ||
          current.needsUser
        ) {
          return Promise.reject(new Error("The thread cannot accept a voice message."));
        }
        return current.sendSpokenMessage(text);
      },
      timer: {
        schedule(delayMs, callback) {
          const timeout = setTimeout(() => void callback(), delayMs);
          return () => clearTimeout(timeout);
        },
      },
      toSpeech: (message) => splitSpokenReply(message).blurb,
    });
    const releaseAwake = keepScreenAwake(ownerKey);
    const unsubscribe = controller.subscribe(setState);
    voiceInput.session.setOwnerFocused(ownerKey, true);
    active.current = {
      threadKey,
      controller,
      previous: thread,
      dispose() {
        unsubscribe();
        controller.end();
        audio.dispose();
        voiceInput.session.setOwnerFocused(ownerKey, false);
        releaseAwake();
      },
    };
    controller.start();
    for (const event of deriveVoiceRunEvents(null, thread)) void controller.handleRunEvent(event);
  };

  return {
    available,
    canStart,
    state,
    recording,
    start,
    end,
    toggleMute: () => active.current?.controller.toggleMute(),
    cancelTurn: () => active.current?.controller.cancelTurn(),
    tapToSend: () => active.current?.controller.tapToSend(),
    interrupt: () => active.current?.controller.interrupt(),
  };
}

export type ThreadVoiceMode = ReturnType<typeof useVoiceMode>;
