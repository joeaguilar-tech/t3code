import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import type { ThreadSnoozeShell } from "@t3tools/client-runtime/state/thread-settled";

// Fork-only: threads that a scheduled task sends into collect in the Automations shelf.

/** Keys (`scopedThreadKey(scopeThreadRef(environmentId, threadId))`) of threads bound to an existing task, enabled or paused. */
export function automationThreadKeys(
  _tasksByEnvironment: ReadonlyMap<EnvironmentId, readonly Pick<ScheduledTask, "threadId">[]>,
): ReadonlySet<string> {
  return new Set();
}

/** A request for the user, or a failed run newer than the user's last visit. */
export function automationThreadNeedsYou(
  _shell: ThreadSnoozeShell & { readonly lastVisitedAt?: string | null },
): boolean {
  return false;
}
