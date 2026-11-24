import { describe, expect, it, vi } from "vite-plus/test";

import {
  VoiceModeController,
  VOICE_MODE_FAILED_PHRASE,
  VOICE_MODE_LISTEN_WINDOW_MS,
  VOICE_MODE_NEEDS_USER_PHRASE,
  VOICE_MODE_WORKING_DELAY_MS,
  VOICE_MODE_WORKING_PHRASE,
  type VoiceModeMicrophone,
  type VoiceModeState,
} from "./index.ts";

function setup(autoMute = true) {
  let transcript: Parameters<VoiceModeMicrophone["open"]>[0] | undefined;
  const microphone = {
    open: vi.fn<VoiceModeMicrophone["open"]>((callback) => {
      transcript = callback;
    }),
    cancel: vi.fn(),
    finish: vi.fn(),
  };
  const speech = {
    speak: vi.fn(async (_text: string) => {}),
    stopSpeaking: vi.fn(),
  };
  const timers = new Map<() => void | Promise<void>, number>();
  const send = vi.fn(async (text: string) => `id:${text}`);
  const controller = new VoiceModeController({
    microphone,
    speech,
    timer: {
      schedule: (delay, callback) => {
        timers.set(callback, delay);
        return () => timers.delete(callback);
      },
    },
    sendSpokenMessage: send,
    toSpeech: (text) => `spoken: ${text}`,
    autoMute,
  });
  controller.start();
  return {
    controller,
    microphone,
    speech,
    send,
    timers,
    say: (text: string) => transcript?.(text),
    currentTranscript: () => transcript,
    running: () => controller.handleRunEvent({ type: "running" }),
    finish: (...handledMessageIds: string[]) =>
      controller.handleRunEvent({ type: "finished", finalMessage: "reply", handledMessageIds }),
    async elapse(delay: number) {
      const pending = [...timers];
      for (const [callback, scheduled] of pending) {
        if (scheduled !== delay || !timers.delete(callback)) continue;
        await callback();
      }
    },
  };
}

describe("VoiceModeController", () => {
  it("opens on start and sends one final transcript, including tap-to-send", async () => {
    const h = setup();
    expect(h.controller.currentState).toMatchObject({ phase: "listening", microphoneOpen: true });
    h.controller.tapToSend();
    expect(h.microphone.finish).toHaveBeenCalledOnce();
    await h.say("hello");
    expect(h.send).toHaveBeenCalledExactlyOnceWith("hello");
  });

  it.each(["", " \t "])("resumes listening without sending %j", async (text) => {
    const h = setup();
    await h.say(text);
    expect(h.microphone.open).toHaveBeenCalledTimes(2);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it("auto-mutes on send and lets a tap reopen for a follow-up", async () => {
    const h = setup();
    const pending = h.say("first");
    expect(h.controller.currentState).toMatchObject({ phase: "sending", microphoneOpen: false });
    await pending;
    await h.running();
    expect(h.controller.currentState.microphoneOpen).toBe(false);
    h.controller.toggleMute();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
    await h.say("follow-up");
    expect(h.send).toHaveBeenLastCalledWith("follow-up");
    expect(h.controller.currentState.microphoneOpen).toBe(false);
  });

  it("reopens for a short window after the reply and mutes on silence", async () => {
    const h = setup();
    await h.say("hello");
    await h.finish("id:hello");
    expect(h.controller.currentState.microphoneOpen).toBe(true);
    await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
    expect(h.controller.currentState).toMatchObject({ phase: "muted", microphoneOpen: false });
  });

  it("keeps listening through runs with auto-mute off", async () => {
    const h = setup(false);
    await h.say("first");
    await h.running();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
    await h.say("follow-up");
    expect(h.send).toHaveBeenLastCalledWith("follow-up");
    await h.finish("id:follow-up");
    await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it.each([true, false])("respects manual mute with auto-mute %s", async (autoMute) => {
    const h = setup(autoMute);
    const snapshots: VoiceModeState[] = [];
    const unsubscribe = h.controller.subscribe((state) => snapshots.push(state));
    h.controller.toggleMute();
    expect(snapshots.at(-1)).toMatchObject({ manuallyMuted: true, microphoneOpen: false });
    h.controller.toggleMute();
    await h.say("first");
    if (autoMute) h.controller.toggleMute();
    h.controller.toggleMute();
    await h.finish("id:first");
    expect(h.controller.currentState).toMatchObject({ manuallyMuted: true, microphoneOpen: false });
    unsubscribe();
    const count = snapshots.length;
    h.controller.toggleMute();
    expect(h.controller.currentState).toMatchObject({ manuallyMuted: false, microphoneOpen: true });
    expect(snapshots).toHaveLength(count);
  });

  it("closes the microphone during playback and interrupts with an explicit unmute", async () => {
    const h = setup(false);
    const playback = Promise.withResolvers<void>();
    h.speech.speak.mockReturnValueOnce(playback.promise);
    await h.say("hello");
    h.controller.toggleMute();
    const finished = h.finish("id:hello");
    expect(h.controller.currentState).toMatchObject({ phase: "speaking", microphoneOpen: false });
    h.controller.interrupt();
    expect(h.speech.stopSpeaking).toHaveBeenCalledOnce();
    expect(h.controller.currentState).toMatchObject({ manuallyMuted: false, microphoneOpen: true });
    playback.resolve();
    await finished;
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it("waits quietly for the run answering the latest spoken message", async () => {
    const h = setup(false);
    await h.say("first");
    await h.running();
    await h.say("queued");
    await h.finish("id:first");
    expect(h.speech.speak).not.toHaveBeenCalled();
    await h.finish("id:queued");
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith("spoken: reply");
  });

  it("announces a slow run once per wait", async () => {
    const h = setup();
    await h.say("hello");
    await h.running();
    expect(h.speech.speak).not.toHaveBeenCalled();
    await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
    await h.running();
    await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith(VOICE_MODE_WORKING_PHRASE);
  });

  it("announces a request for input and pauses until the run resumes", async () => {
    const h = setup(false);
    await h.say("hello");
    await h.running();
    await h.controller.handleRunEvent({ type: "needs-user" });
    await h.controller.handleRunEvent({ type: "needs-user" });
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith(VOICE_MODE_NEEDS_USER_PHRASE);
    expect(h.controller.currentState).toMatchObject({ phase: "paused", microphoneOpen: false });
    await h.running();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it("announces failure and keeps listening after a pause", async () => {
    const h = setup();
    await h.say("hello");
    await h.controller.handleRunEvent({ type: "needs-user" });
    await h.controller.handleRunEvent({ type: "failed" });
    expect(h.speech.speak).toHaveBeenLastCalledWith(VOICE_MODE_FAILED_PHRASE);
    expect(h.controller.currentState).toMatchObject({ phase: "listening", microphoneOpen: true });
  });

  it("cancels a turn and ignores its late transcript", async () => {
    const h = setup();
    const canceledTranscript = h.currentTranscript();
    h.controller.cancelTurn();
    await canceledTranscript?.("discard me");
    expect(h.microphone.cancel).toHaveBeenCalledOnce();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it("ends during speech and ignores late playback and feed events", async () => {
    const h = setup();
    const playback = Promise.withResolvers<void>();
    h.speech.speak.mockReturnValueOnce(playback.promise);
    await h.say("hello");
    const finished = h.finish("id:hello");
    h.controller.end();
    expect(h.speech.stopSpeaking).toHaveBeenCalledOnce();
    playback.resolve();
    await finished;
    await h.running();
    await h.controller.handleRunEvent({ type: "failed" });
    expect(h.speech.speak).toHaveBeenCalledOnce();
    expect(h.controller.currentState).toMatchObject({ phase: "ended", microphoneOpen: false });
  });

  it("ends an open window and cancels its timer", async () => {
    const h = setup();
    await h.say("hello");
    await h.finish("id:hello");
    expect(h.timers.size).toBe(1);
    h.controller.end();
    expect(h.timers.size).toBe(0);
    expect(h.microphone.cancel).toHaveBeenCalled();
    expect(h.controller.currentState.microphoneOpen).toBe(false);
  });
});
