import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import * as DateTime from "effect/DateTime";
import type { ThreadSnoozeShell } from "@t3tools/client-runtime/state/thread-settled";
import { describe, expect, it } from "vite-plus/test";
import { automationThreadKeys, automationThreadNeedsYou } from "./Sidebar.automations";

type Shell = Parameters<typeof automationThreadNeedsYou>[0];
const before = "2026-10-28T10:00:00.000Z";
const failure = "2026-10-28T11:00:00.000Z";
const after = "2026-10-28T12:00:00.000Z";
const failed: ThreadSnoozeShell = {
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  runtime: { status: "error", updatedAt: after },
  latestRun: { status: "failed", completedAt: failure },
};

describe("automationThreadKeys", () => {
  it("includes enabled and paused bindings, deduplicates, and scopes by environment", () => {
    const enabled = { threadId: ThreadId.make("shared"), enabled: true };
    const paused = { threadId: ThreadId.make("paused"), enabled: false };
    const tasks = new Map([
      [EnvironmentId.make("local"), [enabled, paused, enabled, { threadId: null }]],
      [EnvironmentId.make("remote"), [enabled]],
    ]);
    expect(automationThreadKeys(tasks)).toEqual(
      new Set([
        scopedThreadKey(scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("shared"))),
        scopedThreadKey(scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("paused"))),
        scopedThreadKey(scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("shared"))),
      ]),
    );
  });
});

describe("automationThreadNeedsYou", () => {
  it.each([
    ["approval", { hasPendingApprovals: true }],
    ["user input", { hasPendingUserInput: true }],
    [
      "runtime request",
      {
        source: {
          pendingRuntimeRequest: {
            id: RuntimeRequestId.make("request"),
            kind: "user_input",
            createdAt: DateTime.makeUnsafe(failure),
          },
        },
      },
    ],
    ["subagent approval", { pendingSubagentRequest: "approval" }],
    ["subagent input", { pendingSubagentRequest: "user_input" }],
    ["guest message", { pendingGuestMessageCount: 1 }],
  ] satisfies ReadonlyArray<readonly [string, Partial<Shell>]>)(
    "raises attention for %s even after a visit",
    (_name, overrides) => {
      const shell = {
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        lastVisitedAt: after,
        ...overrides,
      };
      expect(automationThreadNeedsYou(shell)).toBe(true);
    },
  );

  it.each([
    ["unvisited", { ...failed }, true],
    ["null visit", { ...failed, lastVisitedAt: null }, true],
    ["older visit", { ...failed, lastVisitedAt: before }, true],
    ["equal visit", { ...failed, lastVisitedAt: failure }, false],
    [
      "newer visit ignores metadata writes",
      { ...failed, lastVisitedAt: "2026-10-28T11:30:00.000Z" },
      false,
    ],
    [
      "legacy session",
      {
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        session: { status: "failed", updatedAt: failure },
        lastVisitedAt: before,
      },
      true,
    ],
    [
      "runtime fallback",
      {
        ...failed,
        latestRun: null,
        runtime: { status: "failed", updatedAt: failure },
        lastVisitedAt: before,
      },
      true,
    ],
    [
      "legacy turn completion",
      {
        ...failed,
        latestRun: null,
        latestTurn: { status: "failed", completedAt: failure },
        lastVisitedAt: "2026-10-28T11:30:00.000Z",
      },
      false,
    ],
    [
      "unknown failure time unvisited",
      { ...failed, latestRun: null, runtime: { status: "error" } },
      true,
    ],
    [
      "unknown failure time visited",
      { ...failed, latestRun: null, runtime: { status: "error" }, lastVisitedAt: before },
      false,
    ],
    [
      "success",
      {
        ...failed,
        runtime: { status: "idle" },
        latestRun: { status: "completed", completedAt: after },
      },
      false,
    ],
    ["running", { ...failed, runtime: { status: "running" } }, false],
    [
      "no requests",
      { hasPendingApprovals: false, hasPendingUserInput: false, pendingGuestMessageCount: 0 },
      false,
    ],
  ] satisfies ReadonlyArray<readonly [string, Shell, boolean]>)(
    "handles %s",
    (_name, shell, expected) => {
      expect(automationThreadNeedsYou(shell)).toBe(expected);
    },
  );
});
