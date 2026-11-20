// Fork-only: sidebar environment filter.
import { resolveEffectiveSidebarEnvironmentId } from "../components/Sidebar.environment";
import { useEnvironmentIdentities } from "../state/environments";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSummaries } from "../state/presentation";
import { useUiStateStore } from "../uiStateStore";

export function useSidebarEnvironmentScope() {
  const environments = useEnvironmentIdentities();
  const savedEnvironmentId = useUiStateStore((state) => state.sidebarEnvironmentId);
  const setEnvironmentId = useUiStateStore((state) => state.setSidebarEnvironmentId);
  const knownEnvironmentIds = new Set(environments.map((environment) => environment.environmentId));
  return {
    effectiveEnvironmentId: resolveEffectiveSidebarEnvironmentId(
      savedEnvironmentId,
      knownEnvironmentIds,
    ),
    savedEnvironmentId,
    setEnvironmentId,
  };
}

export function readSidebarEnvironmentId() {
  return resolveEffectiveSidebarEnvironmentId(
    useUiStateStore.getState().sidebarEnvironmentId,
    new Set(
      appAtomRegistry
        .get(environmentSummaries.identitiesAtom)
        .map((environment) => environment.environmentId),
    ),
  );
}
