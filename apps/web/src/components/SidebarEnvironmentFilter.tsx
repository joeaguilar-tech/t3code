// Fork-only: sidebar environment filter.
import type { EnvironmentId, EnvironmentMachineKind } from "@t3tools/contracts";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { SidebarHeaderIconButton } from "./sidebar/SidebarThreadHeader";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";

function EnvironmentDot({
  dot,
  summary = false,
}: {
  dot: "attention" | "unread";
  summary?: boolean;
}) {
  return (
    <span className={summary ? "absolute right-0.5 top-0.5" : "ml-auto"}>
      <span
        aria-hidden
        className={`block size-1.5 rounded-full ${dot === "attention" ? "bg-warning" : "bg-success"}`}
      />
      <span className="sr-only">
        {summary ? "Hidden environments have " : ""}
        {dot === "attention" ? "threads needing attention" : "unread threads"}
      </span>
    </span>
  );
}

export function SidebarEnvironmentFilter({
  environments,
  environmentId,
  machines,
  dots,
  onSelect,
}: {
  environments: readonly { environmentId: EnvironmentId; label: string }[];
  environmentId: EnvironmentId | null;
  machines: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
  dots: ReadonlyMap<EnvironmentId, "attention" | "unread">;
  onSelect: (id: EnvironmentId | null) => void;
}) {
  if (environments.length <= 1) return null;
  const selected = environments.find((environment) => environment.environmentId === environmentId);
  const dot = [...dots.values()].includes("attention")
    ? "attention"
    : dots.size > 0
      ? "unread"
      : null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarHeaderIconButton
            label={`Filter threads by environment${selected ? `: ${selected.label}` : ""}${dot === "attention" ? ", another environment needs you" : dot === "unread" ? ", another environment has finished threads" : ""}`}
          />
        }
      >
        {selected ? (
          <EnvironmentMachineIcon kind={machines.get(selected.environmentId) ?? "server"} />
        ) : (
          <GlobeIcon />
        )}
        {dot ? <EnvironmentDot dot={dot} summary /> : null}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={() => onSelect(null)}>
          <span className="size-4">
            {environmentId === null ? <CheckIcon className="size-4" /> : null}
          </span>
          All environments
        </MenuItem>
        {environments.map((environment) => (
          <MenuItem
            key={environment.environmentId}
            onClick={() => onSelect(environment.environmentId)}
          >
            <span className="size-4">
              {environmentId === environment.environmentId ? (
                <CheckIcon className="size-4" />
              ) : null}
            </span>
            <EnvironmentMachineIcon kind={machines.get(environment.environmentId) ?? "server"} />
            {environment.label}
            {dots.has(environment.environmentId) ? (
              <EnvironmentDot dot={dots.get(environment.environmentId)!} />
            ) : null}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
