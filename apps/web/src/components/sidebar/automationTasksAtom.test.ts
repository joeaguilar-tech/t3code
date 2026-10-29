import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";
import { createSidebarAutomationTasksAtom } from "./automationTasksAtom";

describe("sidebar automation subscriptions", () => {
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
