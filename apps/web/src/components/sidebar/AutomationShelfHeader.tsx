import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { hasUnseenCompletion, resolveThreadLastVisitedAt } from "../Sidebar.logic";
import { useUiStateStore } from "../../uiStateStore";
import { SidebarSectionHeader } from "./SidebarListMarkers";

export function AutomationShelfHeader(props: {
  threads: readonly EnvironmentThreadShell[];
  className?: string;
  toggle: { expanded: boolean; onToggle: () => void };
}) {
  const unread = useUiStateStore((state) =>
    props.threads.some((thread) =>
      hasUnseenCompletion({
        ...thread,
        lastVisitedAt: resolveThreadLastVisitedAt(
          thread.lastVisitedAt,
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ],
        ),
      }),
    ),
  );
  return (
    <SidebarSectionHeader
      marker="automations-header"
      label="Automations"
      count={props.threads.length}
      className={props.className ?? ""}
      toggle={props.toggle}
      unread={unread}
    />
  );
}
