import { useAtomValue } from "@effect/atom-react";
import {
  automationThreadKeys,
  createAutomationTasksAtom,
  createAutomationThreadKeysAtom,
} from "@t3tools/client-runtime/state/automation-threads";
import { environmentSummaries } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";

const tasksByEnvironmentAtom = createAutomationTasksAtom({
  environmentsAtom: environmentSummaries.identitiesAtom,
  tasksAtom: (environmentId) => serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
});

const threadKeysAtom = createAutomationThreadKeysAtom(tasksByEnvironmentAtom, automationThreadKeys);

export function useAutomationThreadKeys() {
  return useAtomValue(threadKeysAtom);
}
