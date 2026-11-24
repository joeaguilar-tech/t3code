import * as Speech from "expo-speech";

let current: { started: boolean; finish: () => void } | null = null;
let stopping = Promise.resolve();

export async function speak(text: string): Promise<void> {
  const previousStop = stopSpeaking();
  const completion = Promise.withResolvers<void>();
  const utterance = { started: false, finish: completion.resolve };
  current = utterance;

  await previousStop;
  if (current === utterance) {
    const finish = () => {
      if (current !== utterance) return;
      current = null;
      utterance.finish();
    };

    try {
      utterance.started = true;
      Speech.speak(text, {
        useApplicationAudioSession: true,
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
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
