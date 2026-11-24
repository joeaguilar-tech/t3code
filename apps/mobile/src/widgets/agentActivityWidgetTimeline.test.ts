import { describe, expect, it, onTestFinished, vi } from "vite-plus/test";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { RelayAgentActivityAggregateState } from "@t3tools/contracts/relay";

import {
  AGENT_ACTIVITY_WIDGET_STALE_AFTER_MS,
  agentActivityWidgetTimeline,
} from "./agentActivityWidgetTimeline";

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { brand: process.env.T3CODE_BRAND } };
    },
  },
}));

const now = Date.parse("2026-10-18T10:00:00.000Z");

type Row = RelayAgentActivityAggregateState["activities"][number];

function row(phase: Row["phase"], status: string): Row {
  return {
    environmentId: "env-1" as EnvironmentId,
    threadId: `thread-${phase}` as ThreadId,
    projectTitle: "t3code",
    threadTitle: `Thread ${phase}`,
    modelTitle: "GPT-5.5",
    phase,
    status,
    updatedAt: "2026-10-18T09:59:00.000Z",
    deepLink: `/threads/env-1/thread-${phase}`,
  };
}

function aggregate(activities: ReadonlyArray<Row>): RelayAgentActivityAggregateState {
  return {
    title: "T3 Code",
    subtitle: "Agent work in progress",
    activeCount: activities.length,
    updatedAt: "2026-10-18T09:59:00.000Z",
    activities,
  };
}

describe("agentActivityWidgetTimeline", () => {
  it.each([
    [undefined, "T3 Code"],
    ["j3", "J3 Code"],
  ])("uses the mobile product name with brand %j", async (brand, title) => {
    vi.resetModules();
    vi.stubEnv("T3CODE_BRAND", brand);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const { agentActivityWidgetTimeline } = await import("./agentActivityWidgetTimeline");
    expect(agentActivityWidgetTimeline({ kind: "loading" }, now)[0]?.props.title).toBe(title);
    expect(
      agentActivityWidgetTimeline({ kind: "snapshot", aggregate: aggregate([]) }, now)[0]?.props
        .title,
    ).toBe(title);
  });

  it("marks unfinished rows out of date once the widget can no longer vouch for them", () => {
    const timeline = agentActivityWidgetTimeline(
      {
        kind: "snapshot",
        aggregate: aggregate([row("running", "Working"), row("completed", "Done")]),
      },
      now,
    );

    expect(timeline.map((entry) => entry.date.getTime())).toEqual([
      now,
      now + AGENT_ACTIVITY_WIDGET_STALE_AFTER_MS,
    ]);
    expect(timeline[0]?.props.activities.map((entry) => entry.phase)).toEqual([
      "running",
      "completed",
    ]);
    expect(timeline[1]?.props.activities.map((entry) => [entry.phase, entry.status])).toEqual([
      ["stale", "Out of date"],
      ["completed", "Done"],
    ]);
  });

  it("keeps finished outcomes on a single entry", () => {
    const timeline = agentActivityWidgetTimeline(
      { kind: "snapshot", aggregate: aggregate([row("failed", "Failed")]) },
      now,
    );

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.props.activities[0]?.phase).toBe("failed");
  });
});
