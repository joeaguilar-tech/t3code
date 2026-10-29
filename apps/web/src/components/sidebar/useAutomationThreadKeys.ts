import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { environmentSummaries } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { automationThreadKeys } from "../Sidebar.automations";
import { createSidebarAutomationTasksAtom } from "./automationTasksAtom";

const tasksByEnvironmentAtom = createSidebarAutomationTasksAtom({
  environmentsAtom: environmentSummaries.identitiesAtom,
  tasksAtom: (environmentId) => serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
});

const threadKeysAtom = Atom.make((get) => automationThreadKeys(get(tasksByEnvironmentAtom)));

export function useAutomationThreadKeys() {
  return useAtomValue(threadKeysAtom);
}
