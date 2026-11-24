import { expect, it, vi } from "vite-plus/test";

import { speak, stopSpeaking } from "./speech";

type SpeechCallbacks = {
  onDone: () => void;
  onStopped: () => void;
  onError: (error: Error) => void;
};

const native = vi.hoisted(() => ({
  speak: vi.fn<(text: string, callbacks: SpeechCallbacks) => void | Promise<void>>(),
  stop: vi.fn(async () => {}),
}));

vi.mock("expo-speech", () => ({
  maxSpeechInputLength: 12,
  speak: (text: string, callbacks: SpeechCallbacks) => {
    void native.speak(text, callbacks);
  },
  stop: native.stop,
}));

vi.mock("expo", () => ({
  requireNativeModule: () => {
    const listeners = new Map<string, (event: { id: string }) => void>();
    return {
      addListener: (event: string, listener: (event: { id: string }) => void) => {
        listeners.set(event, listener);
        return { remove: () => listeners.delete(event) };
      },
      speak: (id: string, text: string) =>
        Promise.resolve(
          native.speak(text, {
            onDone: () => listeners.get("Exponent.speakingDone")?.({ id }),
            onStopped: () => listeners.get("Exponent.speakingStopped")?.({ id }),
            onError: () => listeners.get("Exponent.speakingError")?.({ id }),
          }),
        ),
      stop: native.stop,
    };
  },
}));

it("waits for the previous native stop before speaking again", async () => {
  native.speak.mockReset();
  native.stop.mockReset();
  const firstStarted = Promise.withResolvers<SpeechCallbacks>();
  const secondStarted = Promise.withResolvers<SpeechCallbacks>();
  const stopStarted = Promise.withResolvers<void>();
  const stopped = Promise.withResolvers<void>();
  native.speak
    .mockImplementationOnce((_text, callbacks) => firstStarted.resolve(callbacks))
    .mockImplementationOnce((_text, callbacks) => secondStarted.resolve(callbacks));
  native.stop.mockImplementationOnce(() => {
    stopStarted.resolve();
    return stopped.promise;
  });

  const first = speak("First");
  expect(await Promise.race([first.then(() => null), firstStarted.promise])).not.toBeNull();
  const second = speak("Second");
  await stopStarted.promise;
  expect(native.speak).toHaveBeenCalledTimes(1);
  stopped.resolve();
  await first;
  const callbacks = await secondStarted.promise;
  callbacks.onDone();
  await second;
  expect(native.speak.mock.calls.map(([text]) => text)).toEqual(["First", "Second"]);
});

it.each(["stop", "native stop", "error"])("resolves the utterance on %s", async (outcome) => {
  native.speak.mockReset();
  native.stop.mockReset();
  const started = Promise.withResolvers<SpeechCallbacks>();
  native.speak.mockImplementationOnce((_text, callbacks) => started.resolve(callbacks));
  const utterance = speak("Reply");
  const callbacks = await Promise.race([utterance.then(() => null), started.promise]);
  expect(callbacks).not.toBeNull();
  if (outcome === "stop") {
    await stopSpeaking();
    expect(native.stop).toHaveBeenCalledOnce();
  } else if (outcome === "native stop") {
    callbacks?.onStopped();
  } else {
    callbacks?.onError(new Error("Speech failed"));
  }
  await utterance;
});

it("stops before native speech starts", async () => {
  native.speak.mockReset();
  native.stop.mockReset();
  const utterance = speak("Reply");
  await stopSpeaking();
  await utterance;
  expect(native.speak).not.toHaveBeenCalled();
  expect(native.stop).not.toHaveBeenCalled();
});

it.each(["over-limit text", "native rejection"])("settles speech with %s", async (outcome) => {
  native.speak.mockReset();
  native.stop.mockReset();
  const started = Promise.withResolvers<SpeechCallbacks>();
  const failure = Promise.reject(new Error("Native speech failed"));
  // Observe the rejected fixture even when the public Expo wrapper discards it.
  const rejection = failure.catch(() => {});
  native.speak.mockImplementationOnce((_text, callbacks) => {
    started.resolve(callbacks);
    if (outcome === "native rejection") return failure;
    callbacks.onDone();
  });

  const text = outcome === "over-limit text" ? "Read this long reply" : "Reply";
  const utterance = speak(text);
  try {
    await started.promise;
    if (outcome === "over-limit text") {
      expect(native.speak).toHaveBeenCalledWith(text.slice(0, 12), expect.anything());
      await utterance;
    } else {
      await rejection;
      await Promise.resolve();
      const pending = Symbol("pending");
      expect(await Promise.race([utterance, Promise.resolve(pending)])).toBeUndefined();
    }
  } finally {
    await stopSpeaking();
  }
});
