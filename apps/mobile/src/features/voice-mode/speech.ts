import { requireNativeModule } from "expo";
import * as Speech from "expo-speech";

const nativeSpeech = requireNativeModule<{
  speak(id: string, text: string, options: Speech.SpeechOptions): Promise<void>;
  addListener(event: string, listener: (event: { id: string }) => void): { remove(): void };
}>("ExpoSpeech");
const terminalEvents = [
  "Exponent.speakingDone",
  "Exponent.speakingStopped",
  "Exponent.speakingError",
];

let current: { started: boolean; finish: () => void } | null = null;
let stopping = Promise.resolve();
let nextUtteranceId = 0;

export async function speak(text: string): Promise<void> {
  const previousStop = stopSpeaking();
  const completion = Promise.withResolvers<void>();
  const subscriptions: Array<{ remove(): void }> = [];
  const utterance = {
    started: false,
    finish: () => {
      for (const subscription of subscriptions) subscription.remove();
      completion.resolve();
    },
  };
  current = utterance;

  await previousStop;
  if (current === utterance) {
    const finish = () => {
      if (current !== utterance) return;
      current = null;
      utterance.finish();
    };

    try {
      const id = `voice-mode:${++nextUtteranceId}`;
      for (const event of terminalEvents) {
        subscriptions.push(
          nativeSpeech.addListener(event, (result) => {
            if (result.id === id) finish();
          }),
        );
      }
      utterance.started = true;
      const boundedText =
        text.length > Speech.maxSpeechInputLength
          ? text.slice(0, Speech.maxSpeechInputLength).replace(/[\uD800-\uDBFF]$/u, "")
          : text;
      // Expo's public speak wrapper discards the native rejection.
      void nativeSpeech.speak(id, boundedText, { useApplicationAudioSession: true }).catch(finish);
    } catch {
      finish();
    }
  }
  await completion.promise;
}

export function stopSpeaking(): Promise<void> {
  const utterance = current;
  if (!utterance) return stopping;
  current = null;

  if (utterance.started) {
    stopping = Speech.stop()
      .catch(() => {})
      .finally(utterance.finish);
  } else {
    utterance.finish();
  }
  return stopping;
}
