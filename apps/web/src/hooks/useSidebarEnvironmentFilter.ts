// Fork-only: sidebar environment filter.
import { useEffect } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { resolveListedAncestorThreadRef } from "@t3tools/client-runtime/state/threads";
import { filterSidebarV2VisibleThreads } from "../components/Sidebar.logic";
import { resolveHiddenEnvironmentDots } from "../components/Sidebar.environment";
import {
  pendingSidebarRouteReveal,
  type SidebarRouteReveal,
} from "../components/sidebar/routeReveal";
import type { ThreadRouteTarget } from "../threadRoutes";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useUiStateStore } from "../uiStateStore";
import { useSidebarEnvironmentScope } from "./useSidebarEnvironmentScope";

export function useSidebarEnvironmentFilter({
  routeReveal,
  routeTarget,
  allThreads,
  delegatedUnderParent,
}: {
  routeReveal: SidebarRouteReveal;
  routeTarget: ThreadRouteTarget | null;
  allThreads: readonly EnvironmentThreadShell[];
  delegatedUnderParent: ReadonlySet<string>;
}) {
  const environmentScope = useSidebarEnvironmentScope();
  const visibleThreads = filterSidebarV2VisibleThreads(allThreads, null, delegatedUnderParent);
  const environmentRouteKey =
    routeTarget?.kind === "server"
      ? scopedThreadKey(resolveListedAncestorThreadRef(routeTarget.threadRef, allThreads))
      : null;
  const environmentRevealPending =
    pendingSidebarRouteReveal(routeReveal, environmentRouteKey) !== null;
  const revealEnvironmentId =
    environmentRevealPending &&
    routeTarget?.kind === "server" &&
    visibleThreads.some(
      (thread) =>
        thread.environmentId === routeTarget.threadRef.environmentId &&
        thread.id === routeTarget.threadRef.threadId,
    ) &&
    environmentScope.effectiveEnvironmentId !== null &&
    environmentScope.effectiveEnvironmentId !== routeTarget.threadRef.environmentId
      ? routeTarget.threadRef.environmentId
      : null;
  const effectiveEnvironmentId = revealEnvironmentId ?? environmentScope.effectiveEnvironmentId;
  const lastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const hiddenEnvironmentDots = resolveHiddenEnvironmentDots(
    visibleThreads,
    effectiveEnvironmentId,
    lastVisitedAtById,
  );
  const { setEnvironmentId } = environmentScope;
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists the environment revealed by history, links or palette navigation and clears hidden selection
  useEffect(() => {
    if (revealEnvironmentId === null) return;
    clearSelection();
    setEnvironmentId(revealEnvironmentId);
  }, [clearSelection, revealEnvironmentId, setEnvironmentId]);
  return { effectiveEnvironmentId, hiddenEnvironmentDots, setEnvironmentId };
}
