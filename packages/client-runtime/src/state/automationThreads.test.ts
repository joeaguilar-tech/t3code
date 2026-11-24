import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import { scopedThreadKey, scopeThreadRef } from "../environment/scoped.ts";
import {
  automationThreadKeys,
  automationThreadNeedsYou,
  createAutomationTasksAtom,
  createAutomationThreadKeysAtom,
} from "./automationThreads.ts";
import type { ThreadSnoozeShell } from "./threadSettled.ts";

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

describe("automation task subscriptions", () => {
  it.each([false, true])("includes successful tasks while waiting: %s", (waiting) => {
    const id = EnvironmentId.make("live");
    const tasks = [{ threadId: ThreadId.make("bound") }];
    const collected = createAutomationTasksAtom({
      environmentsAtom: Atom.make([{ environmentId: id }]),
      tasksAtom: () => Atom.make(AsyncResult.success({ tasks }, { waiting })),
    });
    const registry = AtomRegistry.make();
    try {
      expect(registry.get(collected).get(id)).toEqual(tasks);
    } finally {
      registry.dispose();
    }
  });

  it("collects each shown environment, updates tasks, and drops removed environments", () => {
    const first = EnvironmentId.make("first");
    const second = EnvironmentId.make("second");
    const environmentsAtom = Atom.make<readonly { environmentId: EnvironmentId }[]>([
      { environmentId: first },
      { environmentId: second },
    ]);
    const tasks = [{ threadId: ThreadId.make("bound") }];
    const firstQuery = Atom.make(AsyncResult.success({ tasks }));
    const secondQuery = Atom.make(AsyncResult.success({ tasks: [] as typeof tasks }));
    const collected = createAutomationTasksAtom({
      environmentsAtom,
      tasksAtom: (id) => (id === first ? firstQuery : secondQuery),
    });
    const registry = AtomRegistry.make();
    const release = registry.mount(collected);
    try {
      const initial = registry.get(collected);
      expect([...initial]).toEqual([
        [first, tasks],
        [second, []],
      ]);
      expect(registry.get(collected)).toBe(initial);
      registry.set(secondQuery, AsyncResult.success({ tasks }));
      expect([...registry.get(collected)]).toEqual([
        [first, tasks],
        [second, tasks],
      ]);
      registry.set(firstQuery, AsyncResult.success({ tasks: [] }));
      expect(registry.get(collected).get(first)).toEqual([]);
      registry.set(environmentsAtom, [{ environmentId: second }]);
      expect([...registry.get(collected)]).toEqual([[second, tasks]]);
    } finally {
      release();
      registry.dispose();
    }
  });

  it("preserves membership identity across task metadata updates and changes it for bindings", () => {
    const source = Atom.make([{ threadId: "first", lastRunAt: "before" }]);
    const keys = createAutomationThreadKeysAtom(
      source,
      (tasks) => new Set(tasks.map((task) => task.threadId)),
    );
    const registry = AtomRegistry.make();
    const release = registry.mount(keys);
    try {
      const initial = registry.get(keys);
      registry.set(source, [{ threadId: "first", lastRunAt: "after" }]);
      expect(registry.get(keys)).toBe(initial);
      registry.set(source, [{ threadId: "second", lastRunAt: "after" }]);
      expect(registry.get(keys)).not.toBe(initial);
      expect([...registry.get(keys)]).toEqual(["second"]);
    } finally {
      release();
      registry.dispose();
    }
  });

  it.each([
    AsyncResult.initial<{ tasks: readonly { threadId: ThreadId | null }[] }, string>(),
    AsyncResult.failure<{ tasks: readonly { threadId: ThreadId | null }[] }, string>(
      Cause.fail("no permission"),
    ),
  ])("treats unavailable queries as no tasks (%s)", (result) => {
    const id = EnvironmentId.make("offline");
    const collected = createAutomationTasksAtom({
      environmentsAtom: Atom.make([{ environmentId: id }]),
      tasksAtom: () => Atom.make(result),
    });
    const registry = AtomRegistry.make();
    try {
      expect([...registry.get(collected)]).toEqual([[id, []]]);
    } finally {
      registry.dispose();
    }
  });
});
