import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { scopedThreadKey, scopeThreadRef } from "../environment/scoped.ts";
import { threadRaisedHandWhileSnoozed, type ThreadSnoozeShell } from "./threadSettled.ts";

// Fork-only: threads that a scheduled task sends into collect in the Automations shelf
// (web sidebar and mobile thread list).

/** Keys (`scopedThreadKey(scopeThreadRef(environmentId, threadId))`) of threads bound to an existing task, enabled or paused. */
export function automationThreadKeys(
  tasksByEnvironment: ReadonlyMap<EnvironmentId, readonly Pick<ScheduledTask, "threadId">[]>,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [environmentId, tasks] of tasksByEnvironment) {
    for (const task of tasks) {
      if (task.threadId != null) {
        keys.add(scopedThreadKey(scopeThreadRef(environmentId, task.threadId)));
      }
    }
  }
  return keys;
}

/** A request for the user, or a failed run newer than the user's last visit. */
export function automationThreadNeedsYou(
  shell: ThreadSnoozeShell & { readonly lastVisitedAt?: string | null },
): boolean {
  // Unlike snoozing, a visit doesn't defer a question, so any open request still needs you.
  if (shell.hasPendingUserInput || shell.source?.pendingRuntimeRequest != null) return true;
  // Reuse the snooze rule, with the last visit as the edge.
  return threadRaisedHandWhileSnoozed({ ...shell, snoozedAt: shell.lastVisitedAt ?? null });
}

type Tasks = readonly Pick<ScheduledTask, "threadId">[];

export function createAutomationTasksAtom<E>(input: {
  readonly environmentsAtom: Atom.Atom<readonly { readonly environmentId: EnvironmentId }[]>;
  readonly tasksAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<AsyncResult.AsyncResult<{ readonly tasks: Tasks }, E>>;
}) {
  return Atom.make(
    (get): ReadonlyMap<EnvironmentId, Tasks> =>
      new Map(
        get(input.environmentsAtom).map(({ environmentId }) => {
          const result = get(input.tasksAtom(environmentId));
          return [environmentId, AsyncResult.isSuccess(result) ? result.value.tasks : []] as const;
        }),
      ),
  );
}

export function createAutomationThreadKeysAtom<A>(
  source: Atom.Atom<A>,
  keys: (value: A) => ReadonlySet<string>,
) {
  return Atom.make((get) => {
    const next = keys(get(source));
    const previous = Option.getOrUndefined(get.self<ReadonlySet<string>>());
    return previous && previous.size === next.size && [...next].every((key) => previous.has(key))
      ? previous
      : next;
  });
}
