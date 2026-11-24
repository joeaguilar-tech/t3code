import { describe, expect, it } from "vite-plus/test";

import {
  createQuietDetector,
  VOICE_QUIET_SAMPLE_COUNT,
  VOICE_QUIET_THRESHOLD,
} from "./quietDetector";

const speech = VOICE_QUIET_THRESHOLD;
const noise = VOICE_QUIET_THRESHOLD / 2;

describe("voice-mode quiet detection", () => {
  it.each([0, noise])("ignores a stream at level %s before speech", (level) => {
    const detector = createQuietDetector();
    for (let i = 0; i < VOICE_QUIET_SAMPLE_COUNT * 2; i++) {
      expect(detector.sample(level)).toBe(false);
    }
  });

  it("ends the utterance once after a full quiet window", () => {
    const detector = createQuietDetector();
    expect(detector.sample(speech)).toBe(false);
    for (let i = 1; i < VOICE_QUIET_SAMPLE_COUNT; i++) {
      expect(detector.sample(noise)).toBe(false);
    }
    expect(detector.sample(noise)).toBe(true);
    expect(detector.sample(noise)).toBe(false);
    expect(detector.sample(speech)).toBe(false);
    for (let i = 0; i < VOICE_QUIET_SAMPLE_COUNT; i++) {
      expect(detector.sample(noise)).toBe(false);
    }
  });

  it("starts the quiet window again after a short dip", () => {
    const detector = createQuietDetector();
    detector.sample(speech);
    for (let i = 1; i < VOICE_QUIET_SAMPLE_COUNT; i++) {
      expect(detector.sample(noise)).toBe(false);
    }
    detector.sample(speech);
    for (let i = 1; i < VOICE_QUIET_SAMPLE_COUNT; i++) {
      expect(detector.sample(noise)).toBe(false);
    }
    expect(detector.sample(noise)).toBe(true);
  });

  it("requires fresh speech after reset, including after an utterance ends", () => {
    const detector = createQuietDetector();
    detector.sample(speech);
    detector.reset();
    for (let i = 0; i < VOICE_QUIET_SAMPLE_COUNT; i++) {
      expect(detector.sample(noise)).toBe(false);
    }
    for (let utterance = 0; utterance < 2; utterance++) {
      detector.sample(speech);
      for (let i = 1; i < VOICE_QUIET_SAMPLE_COUNT; i++) detector.sample(noise);
      expect(detector.sample(noise)).toBe(true);
      detector.reset();
    }
  });
});
