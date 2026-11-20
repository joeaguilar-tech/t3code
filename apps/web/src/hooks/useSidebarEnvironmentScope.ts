// Fork-only: sidebar environment filter.
import { resolveEffectiveSidebarEnvironmentId } from "../components/Sidebar.environment";
import { useEnvironmentIdentities } from "../state/environments";
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
