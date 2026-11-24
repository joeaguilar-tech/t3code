import { expect, it, vi } from "vite-plus/test";

import { speak, stopSpeaking } from "./speech";

type SpeechCallbacks = {
  onDone: () => void;
  onStopped: () => void;
  onError: (error: Error) => void;
};

const native = vi.hoisted(() => ({
  speak: vi.fn<(text: string, callbacks: SpeechCallbacks) => void>(),
  stop: vi.fn(async () => {}),
}));

vi.mock("expo-speech", () => native);

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
  expect(native.speak).not.toHaveBeenCalledWith("Second", expect.anything());
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
