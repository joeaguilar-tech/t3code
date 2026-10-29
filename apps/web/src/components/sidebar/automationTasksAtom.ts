import type { EnvironmentId, ScheduledTask } from "@t3tools/contracts";
import * as Option from "effect/Option";
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
          return [environmentId, AsyncResult.isSuccess(result) ? result.value.tasks : []] as const;
        }),
      ),
  );
}

export function createSidebarAutomationThreadKeysAtom<A>(
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
