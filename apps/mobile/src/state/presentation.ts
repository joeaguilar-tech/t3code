import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentPresentation } from "@t3tools/client-runtime/connection";
import {
  automationThreadKeys,
  createAutomationTasksAtom,
  createAutomationThreadKeysAtom,
} from "@t3tools/client-runtime/state/automation-threads";
import {
  createEnvironmentPresentationAtoms,
  createEnvironmentSummaryAtoms,
} from "@t3tools/client-runtime/state/presentation";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { environmentServerConfigsAtom, serverEnvironment } from "./server";
import { createThreadListEnvironmentsAtom } from "./thread-list-environments";

export const environmentPresentations = createEnvironmentPresentationAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  stateAtom: environmentCatalog.stateAtom,
  serverConfigValueAtom: serverEnvironment.configValueAtom,
});

export const { connectedEnvironmentIdsAtom, identitiesAtom } = createEnvironmentSummaryAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  presentationAtom: environmentPresentations.presentationAtom,
});

/** Threads a scheduled task sends into, across every saved environment. */
export const automationThreadKeysAtom = createAutomationThreadKeysAtom(
  createAutomationTasksAtom({
    environmentsAtom: identitiesAtom,
    tasksAtom: (environmentId) =>
      serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  }),
  automationThreadKeys,
);

export const threadListEnvironmentsAtom = createThreadListEnvironmentsAtom(
  environmentServerConfigsAtom,
  connectedEnvironmentIdsAtom,
);

const EMPTY_ENVIRONMENT_PRESENTATION_ATOM = Atom.make<EnvironmentPresentation | null>(null).pipe(
  Atom.withLabel("mobile-environment-presentation:empty"),
);

export function useEnvironmentPresentation(environmentId: EnvironmentId | null) {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const presentation = useAtomValue(
    environmentId === null
      ? EMPTY_ENVIRONMENT_PRESENTATION_ATOM
      : environmentPresentations.presentationAtom(environmentId),
  );
  return {
    isReady: catalog.isReady,
    presentation,
  };
}
