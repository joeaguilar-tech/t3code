export const VOICE_QUIET_THRESHOLD = 0.1;
export const VOICE_QUIET_SAMPLE_COUNT = 23;

export function createQuietDetector() {
  return {
    sample: (_level: number) => false,
    reset() {},
  };
}
