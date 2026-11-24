import { useAtomValue } from "@effect/atom-react";
import { useRoute } from "@react-navigation/native";
import {
  VoiceModeController,
  voiceInputBlocksSubmission,
  type VoiceInputPhase,
  type VoiceModeState,
} from "@t3tools/client-runtime/voice-input";
import { splitSpokenReply } from "@t3tools/shared/spokenReply";
import { AsyncResult } from "effect/reactivity";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Keyboard, Platform } from "react-native";
import * as Dialog from "../../components/ui/Dialog";
import { useAppForeground } from "../../lib/appState";
import { rootNavigationRef } from "../../lib/rootNavigation";
import { uuidv4 } from "../../lib/uuid";
import { mobilePreferencesAtom } from "../../state/preferences";
import { keepScreenAwake, useVoiceInputCapture } from "../voice-input/VoiceInputProvider";
import { deriveVoiceRunEvents, voiceModeAutoMute, type ThreadVoiceState } from "./threadVoiceMode";
import { createVoiceModeCover } from "./voiceModeCover";
import { createVoiceModeAudio } from "./voiceModeAudio";
import { voiceModeSessions } from "./voiceModeSessionStore";

type Session = {
  readonly ownerKey: string;
  readonly threadKey: string;
  readonly controller: VoiceModeController;
  readonly dispose: () => void;
  readonly toggleMute: () => void;
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
  const route = useRoute();
  const liveOwner = useSyncExternalStore(voiceModeSessions.subscribe, voiceModeSessions.getOwner);
  const voiceInput = useVoiceInputCapture();
  const foreground = useAppForeground();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const [view, setView] = useState<{
    state: VoiceModeState;
    placement: ReturnType<typeof createVoiceModeCover>["placement"];
  } | null>(null);
  const [capturePhase, setCapturePhase] = useState<VoiceInputPhase>("idle");
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
    voiceModeSessions.release(session.ownerKey);
    setView(null);
  }, []);

  const threadKey = input.threadKey;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- disposes the native session when its owning screen unmounts
  useLayoutEffect(() => end, [end]);
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
    liveOwner === null &&
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
    const cover = createVoiceModeCover();
    const updateCover = () => {
      const root = rootNavigationRef.getRootState();
      if (root) cover.update(root.routes.slice(0, root.index + 1), route.key);
    };
    updateCover();
    if (cover.placement !== "inline") return;
    const ownerKey = `voice-mode:${uuidv4()}`;
    if (!voiceModeSessions.acquire(ownerKey)) return;
    Keyboard.dismiss();
    const thread = { runs, messages, needsUser };
    const audio = createVoiceModeAudio({
      session: voiceInput.session,
      ownerKey,
      noteSpeechActivity: () => controller.noteSpeechActivity(),
      requestFinish: () => controller.tapToSend(),
      onCaptureChange: setCapturePhase,
      onError(message) {
        end();
        Dialog.alert("Voice mode stopped", message);
      },
    });
    const controller = new VoiceModeController({
      microphone: {
        ...audio.microphone,
        open(onTranscript) {
          if (!cover.captureMuted) audio.microphone.open(onTranscript);
        },
      },
      speech: {
        ...audio.speech,
        speak: (text) => (cover.speechSuppressed ? Promise.resolve() : audio.speech.speak(text)),
      },
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
      toSpeech: (message) => (message.trim() ? splitSpokenReply(message).blurb : ""),
    });
    const releaseAwake = keepScreenAwake(ownerKey);
    const toggleMute = () => {
      if (cover.speechSuppressed) return;
      if (cover.captureMuted) {
        cover.unmute();
        if (controller.currentState.microphoneOpen) controller.cancelTurn();
        else controller.toggleMute();
        publish();
        return;
      }
      controller.toggleMute();
    };
    const publish = () => {
      const state = cover.control(controller.currentState);
      setView({ state, placement: cover.placement });
      voiceModeSessions.publish(
        ownerKey,
        cover.placement === "floating"
          ? { microphoneOpen: state.microphoneOpen, toggleMute, end }
          : null,
      );
    };
    const unsubscribe = controller.subscribe(publish);
    const unsubscribeNavigation = rootNavigationRef.addListener("state", () => {
      const previous = cover.placement;
      updateCover();
      if (cover.placement === previous) return;
      if (cover.placement === "away") {
        end();
        return;
      }
      if (cover.speechSuppressed) cover.silence(controller, audio.speech.stopSpeaking);
      publish();
    });
    voiceInput.session.setOwnerFocused(ownerKey, true);
    active.current = {
      ownerKey,
      threadKey,
      controller,
      previous: thread,
      toggleMute,
      dispose() {
        unsubscribeNavigation();
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
    state: view?.state ?? null,
    placement: view?.placement ?? "inline",
    capturePhase,
    start,
    end,
    toggleMute: () => active.current?.toggleMute(),
    cancelTurn: () => active.current?.controller.cancelTurn(),
    tapToSend: () => active.current?.controller.tapToSend(),
    interrupt: () => active.current?.controller.interrupt(),
  };
}

export type ThreadVoiceMode = ReturnType<typeof useVoiceMode>;
