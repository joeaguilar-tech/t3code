import { VoiceModeController, type VoiceModeMicrophone } from "@t3tools/client-runtime/voice-input";
import { describe, expect, it, vi } from "vite-plus/test";
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

import { createVoiceModeCover } from "./voiceModeCover";
import { createVoiceModeSessionStore } from "./voiceModeSessionStore";

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

  it("settles a stopped run silently, even with a partial answer", () => {
    expect(
      deriveVoiceRunEvents(busy, {
        ...busy,
        runs: [{ ...firstRun, status: "interrupted" }, queuedRun],
        messages: [message("partial", "first", "assistant"), message("steer", "first", "user")],
      }),
    ).toEqual([{ type: "finished", finalMessage: "", handledMessageIds: ["original", "steer"] }]);
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
    expect(buildSpokenSend(input).dispatchMode).toBe("steer");
    expect(buildSpokenSend({ ...input, followUpBehavior: "queue" }).dispatchMode).toBe("queue");
    expect(buildSpokenSend({ ...input, canSteer: false }).dispatchMode).toBe("queue");
  });
});

it("defaults auto-mute on while preserving an explicit opt-out", () => {
  expect(voiceModeAutoMute(undefined)).toBe(true);
  expect(voiceModeAutoMute(false)).toBe(false);
});

describe("voice mode covering screens", () => {
  it("keeps mute and end reachable with the current microphone state on a file page", () => {
    const cover = createVoiceModeCover();
    const toggleMute = vi.fn();
    const end = vi.fn();
    cover.update(
      [
        { key: "own", name: "Thread" },
        { key: "file", name: "ThreadFile" },
      ],
      "own",
    );
    expect(cover.placement).toBe("floating");
    const control = { phase: "listening", microphoneOpen: true, toggleMute, end } as const;
    expect(cover.control(control)).toBe(control);
    cover.control(control).toggleMute();
    expect(toggleMute).toHaveBeenCalledOnce();
    cover.control({ ...control, microphoneOpen: false }).end();
    expect(end).toHaveBeenCalledOnce();
  });

  it("silences a sheet and keeps capture muted after returning until explicitly unmuted", () => {
    const cover = createVoiceModeCover();
    const owner = { key: "own", name: "Thread" };
    cover.update([owner, { key: "queue", name: "ThreadQueue" }], "own");
    expect(cover.placement).toBe("silent");
    expect(cover.captureMuted).toBe(true);
    expect(cover.speechSuppressed).toBe(true);
    cover.unmute();
    expect(cover.captureMuted).toBe(true);

    cover.update([owner], "own");
    expect(cover.placement).toBe("inline");
    expect(cover.speechSuppressed).toBe(false);
    expect(cover.captureMuted).toBe(true);
    expect(cover.control({ phase: "listening", microphoneOpen: true })).toMatchObject({
      phase: "muted",
      microphoneOpen: false,
    });
    cover.unmute();
    expect(cover.captureMuted).toBe(false);
  });
});

it.each([
  { capture: "finished", finished: true, expected: [["queue a test run"]] },
  { capture: "in progress", finished: false, expected: [] },
])("mutes on a sheet when speech is $capture", async ({ finished, expected }) => {
  const cover = createVoiceModeCover();
  const sendSpokenMessage = vi.fn(async (_text: string) => "sent");
  const microphone = {
    open: vi.fn<VoiceModeMicrophone["open"]>(),
    finish: vi.fn(),
    cancel: vi.fn(),
  };
  const speak = vi.fn(async (_text: string) => {});
  const stopSpeaking = vi.fn();
  const controller = new VoiceModeController({
    microphone,
    speech: {
      speak: (text) => (cover.speechSuppressed ? Promise.resolve() : speak(text)),
      stopSpeaking,
    },
    sendSpokenMessage,
    timer: { schedule: () => () => {} },
    toSpeech: (text) => text,
  });

  controller.start();
  controller.noteSpeechActivity();
  if (finished) controller.tapToSend();
  cover.update(
    [
      { key: "own", name: "Thread" },
      { key: "queue", name: "ThreadQueue" },
    ],
    "own",
  );
  cover.silence(controller, stopSpeaking);

  await microphone.open.mock.calls[0]?.[0]("queue a test run");
  expect(sendSpokenMessage.mock.calls).toEqual(expected);
  await controller.handleRunEvent({
    type: "finished",
    finalMessage: "Reply",
    handledMessageIds: ["sent"],
  });
  expect(speak).not.toHaveBeenCalled();
  expect(controller.currentState).toMatchObject({ manuallyMuted: true, microphoneOpen: false });
  expect(microphone.cancel).toHaveBeenCalledTimes(finished ? 0 : 1);
});

it("reserves the live session and its floating control for one owner", () => {
  const sessions = createVoiceModeSessionStore();
  const control = { microphoneOpen: false, toggleMute: vi.fn(), end: vi.fn() };

  expect(sessions.acquire("thread")).toBe(true);
  expect(sessions.acquire("file")).toBe(false);
  expect(sessions.getOwner()).toBe("thread");
  sessions.publish("thread", control);
  sessions.publish("file", null);
  sessions.release("file");
  expect(sessions.getControl()).toBe(control);
  sessions.release("thread");
  expect(sessions.getControl()).toBeNull();
  expect(sessions.acquire("file")).toBe(true);
  sessions.release("thread");
  expect(sessions.getOwner()).toBe("file");
});
