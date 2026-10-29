import { useAtomValue } from "@effect/atom-react";
import { environmentSummaries } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { automationThreadKeys } from "../Sidebar.automations";
import {
  createSidebarAutomationTasksAtom,
  createSidebarAutomationThreadKeysAtom,
} from "./automationTasksAtom";

const tasksByEnvironmentAtom = createSidebarAutomationTasksAtom({
  environmentsAtom: environmentSummaries.identitiesAtom,
  tasksAtom: (environmentId) => serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
});

const threadKeysAtom = createSidebarAutomationThreadKeysAtom(
  tasksByEnvironmentAtom,
  automationThreadKeys,
);

export function useAutomationThreadKeys() {
  return useAtomValue(threadKeysAtom);
}
