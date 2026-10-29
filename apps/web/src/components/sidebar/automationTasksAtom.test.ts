import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";
import {
  createSidebarAutomationTasksAtom,
  createSidebarAutomationThreadKeysAtom,
} from "./automationTasksAtom";

describe("sidebar automation subscriptions", () => {
  it.each([false, true])("includes successful tasks while waiting: %s", (waiting) => {
    const id = EnvironmentId.make("live");
    const tasks = [{ threadId: ThreadId.make("bound") }];
    const collected = createSidebarAutomationTasksAtom({
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
    const collected = createSidebarAutomationTasksAtom({
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
    const keys = createSidebarAutomationThreadKeysAtom(
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
    const collected = createSidebarAutomationTasksAtom({
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
