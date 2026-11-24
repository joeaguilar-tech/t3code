import { describe, expect, it } from "vite-plus/test";
import {
  serializeComposerMessageForServer,
  uploadedComposerContext,
} from "../../lib/composerContext";
import {
  buildSpokenSend,
  deriveVoiceRunEvents,
  voiceModeAutoMute,
  type ThreadVoiceState,
} from "./threadVoiceMode";

const firstRun = { id: "first", userMessageId: "original", status: "running" } as const;
const queuedRun = { id: "next", userMessageId: "queued", status: "queued" } as const;
const busy: ThreadVoiceState = { runs: [firstRun, queuedRun], messages: [], needsUser: false };
const message = (id: string, runId: string, role: "user" | "assistant", text = id) => ({
  id,
  runId,
  role,
  text,
  streaming: false,
});

describe("voice mode run feed", () => {
  it("includes steering messages in the run that handled them and speaks its final answer", () => {
    const current: ThreadVoiceState = {
      ...busy,
      runs: [{ ...firstRun, status: "completed" }, queuedRun],
      messages: [
        message("interim", "first", "assistant"),
        message("steer", "first", "user"),
        message("reply", "first", "assistant"),
        message("queued", "next", "user"),
      ],
    };
    expect(deriveVoiceRunEvents(busy, current)).toEqual([
      { type: "finished", finalMessage: "reply", handledMessageIds: ["original", "steer"] },
    ]);
  });

  it("reports the queued message when its own run finishes", () => {
    expect(
      deriveVoiceRunEvents(busy, {
        ...busy,
        runs: [firstRun, { ...queuedRun, status: "completed" }],
        messages: [message("answer", "next", "assistant")],
      }),
    ).toContainEqual({ type: "finished", finalMessage: "answer", handledMessageIds: ["queued"] });
  });

  it("reports a request once and resumes the running feed when it clears", () => {
    const paused = { ...busy, needsUser: true };
    expect(deriveVoiceRunEvents(busy, paused)).toEqual([{ type: "needs-user" }]);
    expect(deriveVoiceRunEvents(paused, paused)).toEqual([]);
    expect(deriveVoiceRunEvents(paused, busy)).toEqual([{ type: "running" }]);
  });

  it("reports a newly failed run without replaying historical failures", () => {
    const failed: ThreadVoiceState = {
      ...busy,
      runs: [{ ...firstRun, status: "failed" }, queuedRun],
      messages: [message("steer", "first", "user"), message("queued", "next", "user")],
    };
    expect(deriveVoiceRunEvents(busy, failed)).toEqual([
      { type: "failed", handledMessageIds: ["original", "steer"] },
    ]);
    expect(deriveVoiceRunEvents(null, failed)).toEqual([]);
    expect(deriveVoiceRunEvents(failed, failed)).toEqual([]);
  });
});

describe("spoken dispatch", () => {
  it("marks the transcript without carrying composer context", () => {
    expect(buildSpokenSend({ text: "hello", running: false, canSteer: false })).toEqual({
      text: "hello",
      context: { version: 1, records: [], spoken: true },
    });
  });

  it("keeps the marker through outbox serialization with no attachments", () => {
    const context = uploadedComposerContext({ version: 1, records: [], spoken: true }, [], []);
    expect(serializeComposerMessageForServer("hello", context)).toEqual({
      text: "hello",
      context: { version: 1, records: [], spoken: true },
    });
  });

  it("steers by default and queues when configured or unable to steer", () => {
    const input = { text: "hello", running: true, canSteer: true };
    expect(buildSpokenSend(input).dispatchMode).toBe("auto");
    expect(buildSpokenSend({ ...input, followUpBehavior: "queue" }).dispatchMode).toBe("queue");
    expect(buildSpokenSend({ ...input, canSteer: false }).dispatchMode).toBe("queue");
  });
});

it("defaults auto-mute on while preserving an explicit opt-out", () => {
  expect(voiceModeAutoMute(undefined)).toBe(true);
  expect(voiceModeAutoMute(false)).toBe(false);
});
