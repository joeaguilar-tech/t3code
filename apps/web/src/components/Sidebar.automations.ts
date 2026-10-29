import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  threadRaisedHandWhileSnoozed,
  type ThreadSnoozeShell,
} from "@t3tools/client-runtime/state/thread-settled";

// Fork-only: threads that a scheduled task sends into collect in the Automations shelf.

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
  // Reuse the snooze rule, with the last visit as the edge.
  return threadRaisedHandWhileSnoozed({ ...shell, snoozedAt: shell.lastVisitedAt ?? null });
}
