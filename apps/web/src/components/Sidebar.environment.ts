// Fork-only: sidebar environment filter.
import {
  SIDEBAR_ENVIRONMENT_KEYBINDING_COMMANDS,
  type EnvironmentId,
  type ScopedProjectRef,
} from "@t3tools/contracts";
import type { ReactNode } from "react";
import type { CommandPaletteActionItem } from "./CommandPalette.logic";
import { useUiStateStore } from "../uiStateStore";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "./Sidebar.logic";

export function resolveEffectiveSidebarEnvironmentId(
  saved: EnvironmentId | null,
  knownEnvironmentIds: ReadonlySet<EnvironmentId>,
): EnvironmentId | null {
  return saved !== null && knownEnvironmentIds.has(saved) ? saved : null;
}

export function filterToEnvironment<T extends { readonly environmentId: EnvironmentId }>(
  items: readonly T[],
  environmentId: EnvironmentId | null,
): readonly T[] {
  return environmentId === null
    ? items
    : items.filter((item) => item.environmentId === environmentId);
}

type EnvironmentDotThread = Parameters<typeof resolveSidebarFolderDot>[0][number] &
  Pick<EnvironmentThreadShell, "environmentId" | "id">;

export function resolveHiddenEnvironmentDots(
  threads: readonly EnvironmentDotThread[],
  effectiveEnvironmentId: EnvironmentId | null,
  lastVisitedAtById: Readonly<Record<string, string>>,
): ReadonlyMap<EnvironmentId, "attention" | "unread"> {
  const dots = new Map<EnvironmentId, "attention" | "unread">();
  if (effectiveEnvironmentId === null) return dots;
  const hiddenByEnvironment = new Map<EnvironmentId, EnvironmentDotThread[]>();
  for (const thread of threads) {
    if (thread.environmentId === effectiveEnvironmentId) continue;
    const hidden = hiddenByEnvironment.get(thread.environmentId) ?? [];
    hidden.push(thread);
    hiddenByEnvironment.set(thread.environmentId, hidden);
  }
  for (const [environmentId, hidden] of hiddenByEnvironment) {
    const dot = resolveSidebarFolderDot(
      hidden.map((thread) => ({
        ...thread,
        lastVisitedAt: resolveThreadLastVisitedAt(
          thread.lastVisitedAt,
          lastVisitedAtById[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))],
        ),
      })),
    );
    if (dot === "attention" || dot === "failed") dots.set(environmentId, "attention");
    else if (dot === "unread") dots.set(environmentId, "unread");
  }
  return dots;
}

export function environmentForShortcutIndex(
  environments: readonly { environmentId: EnvironmentId }[],
  index: number,
): EnvironmentId | null {
  return environments[index - 1]?.environmentId ?? null;
}

export function buildSidebarEnvironmentPaletteItems(
  environments: readonly { environmentId: EnvironmentId; label: string }[],
  icon: ReactNode,
): CommandPaletteActionItem[] {
  if (environments.length <= 1) return [];
  return [
    {
      kind: "action",
      value: "action:sidebar-environment:all",
      title: "Show all environments",
      searchTerms: ["sidebar", "environment", "filter"],
      icon,
      shortcutCommand: "sidebar.environment.all",
      run: async () => useUiStateStore.getState().setSidebarEnvironmentId(null),
    },
    ...environments.map((environment, index): CommandPaletteActionItem => {
      const shortcutCommand = SIDEBAR_ENVIRONMENT_KEYBINDING_COMMANDS[index + 1];
      return {
        kind: "action",
        value: `action:sidebar-environment:${environment.environmentId}`,
        title: `Show only ${environment.label}`,
        searchTerms: ["sidebar", "environment", "filter", environment.label],
        icon,
        ...(shortcutCommand ? { shortcutCommand } : {}),
        run: async () =>
          useUiStateStore.getState().setSidebarEnvironmentId(environment.environmentId),
      };
    }),
  ];
}

export function resolveSidebarNewThreadProjectRef(
  current: ScopedProjectRef | null,
  fallback: ScopedProjectRef | null,
  environmentId: EnvironmentId | null,
): ScopedProjectRef | null {
  return current && (environmentId === null || current.environmentId === environmentId)
    ? current
    : fallback;
}
