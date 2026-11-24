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

  it.each(["timeout", "mute", "finished", "needs-user", "failed"] as const)(
    "sends a finishing transcript even after %s",
    async (transition) => {
      const h = setup(transition !== "finished");
      await h.say("first");
      if (transition !== "finished") await h.finish("id:first");
      const transcript = h.currentTranscript();
      h.controller.tapToSend();

      let feed: Promise<void> | undefined;
      if (transition === "timeout") {
        await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
      } else if (transition === "mute") {
        h.controller.toggleMute();
      } else if (transition === "finished") {
        feed = h.finish("id:first");
      } else {
        feed = h.controller.handleRunEvent({ type: transition });
      }

      expect(h.microphone.cancel).not.toHaveBeenCalled();
      expect(h.speech.speak).toHaveBeenCalledTimes(transition === "finished" ? 0 : 1);
      await transcript?.("redirect");
      await feed;
      expect(h.send).toHaveBeenLastCalledWith("redirect");
    },
  );

  it("keeps a post-reply window open once it hears speech", async () => {
    const h = setup();
    await h.say("first");
    await h.finish("id:first");
    const controller: VoiceModeController & { noteSpeechActivity?: () => void } = h.controller;
    controller.noteSpeechActivity?.();
    await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
    expect(h.controller.currentState.microphoneOpen).toBe(true);
    expect(h.microphone.cancel).not.toHaveBeenCalled();
  });

  it.each(["speech activity", "tap-to-send"])(
    "skips the working phrase during %s",
    async (activity) => {
      const h = setup(false);
      await h.say("first");
      await h.running();
      const transcript = h.currentTranscript();
      const controller: VoiceModeController & { noteSpeechActivity?: () => void } = h.controller;
      if (activity === "speech activity") controller.noteSpeechActivity?.();
      else controller.tapToSend();
      await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
      expect(h.speech.speak).not.toHaveBeenCalled();
      await transcript?.("follow-up");
      expect(h.send).toHaveBeenLastCalledWith("follow-up");
    },
  );

  it("speaks a matching finish that arrives before the send returns its ID", async () => {
    const h = setup();
    const send = Promise.withResolvers<string>();
    h.send.mockReturnValueOnce(send.promise);
    const pending = h.say("first");
    await h.finish("id:first");
    expect(h.speech.speak).not.toHaveBeenCalled();
    send.resolve("id:first");
    await pending;
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith("spoken: reply");
    expect(h.controller.currentState.phase).toBe("listening");
  });

  it("announces a rejected send and resumes listening", async () => {
    const h = setup();
    h.send.mockRejectedValueOnce(new Error("send failed"));
    await h.say("first");
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith(
      "That message didn't send. Check the screen.",
    );
    expect(h.controller.currentState.phase).toBe("listening");
  });

  it("speaks the previous message's buffered reply after a follow-up send rejects", async () => {
    const h = setup();
    await h.say("first");
    await h.running();
    h.controller.toggleMute();
    const send = Promise.withResolvers<string>();
    h.send.mockReturnValueOnce(send.promise);
    const pending = h.say("follow-up");
    await h.finish("id:first");
    expect(h.speech.speak).not.toHaveBeenCalled();
    send.reject(new Error("send failed"));
    await pending;
    expect(h.speech.speak).toHaveBeenCalledTimes(2);
    expect(h.speech.speak).toHaveBeenLastCalledWith("spoken: reply");
    expect(h.controller.currentState.phase).toBe("listening");
  });

  it("announces an earlier overlapping send failure and still reads the newer reply", async () => {
    const h = setup(false);
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    h.send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstSend = h.say("first");
    const secondSend = h.say("second");
    await h.finish("id:second");
    first.reject(new Error("send failed"));
    await firstSend;
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith(
      "That message didn't send. Check the screen.",
    );
    second.resolve("id:second");
    await secondSend;
    expect(h.speech.speak).toHaveBeenLastCalledWith("spoken: reply");
  });

  it.each([true, false])("taps to unmute while paused with auto-mute %s", async (autoMute) => {
    const h = setup(autoMute);
    await h.say("first");
    await h.controller.handleRunEvent({ type: "needs-user" });
    h.controller.toggleMute();
    expect(h.controller.currentState).toMatchObject({
      phase: "paused",
      microphoneOpen: false,
      manuallyMuted: false,
    });
    await h.running();
    expect(h.controller.currentState.microphoneOpen).toBe(true);
  });

  it("leaves the microphone unmuted after a mute toggle during playback", async () => {
    const h = setup(false);
    const playback = Promise.withResolvers<void>();
    h.speech.speak.mockReturnValueOnce(playback.promise);
    await h.say("first");
    const finished = h.finish("id:first");
    h.controller.toggleMute();
    playback.resolve();
    await finished;
    expect(h.controller.currentState).toMatchObject({ manuallyMuted: false, microphoneOpen: true });
  });

  it("resumes listening when the paused run finishes", async () => {
    const h = setup();
    await h.say("first");
    await h.controller.handleRunEvent({ type: "needs-user" });
    await h.finish("id:first");
    expect(h.speech.speak).toHaveBeenLastCalledWith("spoken: reply");
    expect(h.controller.currentState.phase).toBe("listening");
  });

  it("announces another slow run after the previous reply", async () => {
    const h = setup();
    await h.say("first");
    await h.running();
    await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
    await h.finish("id:first");
    await h.say("second");
    await h.running();
    await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
    expect(h.speech.speak.mock.calls).toEqual([
      [VOICE_MODE_WORKING_PHRASE],
      ["spoken: reply"],
      [VOICE_MODE_WORKING_PHRASE],
    ]);
  });

  it("keeps listening after a failed run with auto-mute off", async () => {
    const h = setup(false);
    await h.say("first");
    await h.running();
    await h.controller.handleRunEvent({ type: "failed" });
    expect(h.speech.speak).toHaveBeenCalledExactlyOnceWith(VOICE_MODE_FAILED_PHRASE);
    await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
    expect(h.controller.currentState.phase).toBe("listening");
  });

  it.each(["run", "listen window"])("discards the current utterance during a %s", async (phase) => {
    const h = setup();
    await h.say("first");
    if (phase === "run") {
      await h.running();
      h.controller.toggleMute();
    } else {
      await h.finish("id:first");
    }
    const canceledTranscript = h.currentTranscript();
    h.controller.cancelTurn();
    await canceledTranscript?.("discard me");
    expect(h.send).toHaveBeenCalledExactlyOnceWith("first");
    expect(h.controller.currentState.microphoneOpen).toBe(true);
    await h.elapse(VOICE_MODE_LISTEN_WINDOW_MS);
    expect(h.controller.currentState.microphoneOpen).toBe(phase === "run");
  });

  it("cancels the working timer on end", async () => {
    const h = setup();
    await h.say("first");
    await h.running();
    expect([...h.timers.values()]).toEqual([VOICE_MODE_WORKING_DELAY_MS]);
    h.controller.end();
    expect(h.timers.size).toBe(0);
    await h.elapse(VOICE_MODE_WORKING_DELAY_MS);
    expect(h.speech.speak).not.toHaveBeenCalled();
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
