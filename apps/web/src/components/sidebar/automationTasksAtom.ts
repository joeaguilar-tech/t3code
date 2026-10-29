import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

type Tasks = readonly Pick<ScheduledTask, "threadId">[];

export function createSidebarAutomationTasksAtom<E>(input: {
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
          return [
            environmentId,
            AsyncResult.isSuccess(result) && !result.waiting ? result.value.tasks : [],
          ] as const;
        }),
      ),
  );
}
