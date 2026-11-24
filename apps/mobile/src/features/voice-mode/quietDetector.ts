import { VOICE_METERING_INTERVAL_MS } from "../voice-input/voiceInputMetering";

export const VOICE_QUIET_THRESHOLD = 0.1;
export const VOICE_QUIET_SAMPLE_COUNT = Math.ceil(1_800 / VOICE_METERING_INTERVAL_MS);

export function createQuietDetector() {
  let heardSpeech = false;
  let quietSamples = 0;

  return {
    sample(level: number): boolean {
      if (quietSamples === VOICE_QUIET_SAMPLE_COUNT) return false;
      if (level >= VOICE_QUIET_THRESHOLD) {
        heardSpeech = true;
        quietSamples = 0;
        return false;
      }
      return heardSpeech && ++quietSamples === VOICE_QUIET_SAMPLE_COUNT;
    },
    reset() {
      heardSpeech = false;
      quietSamples = 0;
    },
  };
}
