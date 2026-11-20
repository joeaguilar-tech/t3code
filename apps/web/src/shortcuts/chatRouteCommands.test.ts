import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import * as commandPalette from "../commandPaletteBus";
import * as settings from "../hooks/useSettings";
import * as threadActions from "../lib/chatThreadActions";
import * as entities from "../state/entities";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentSummaries } from "../state/presentation";
import { useUiStateStore } from "../uiStateStore";
import type { Project } from "../types";
import { installChatRouteCommands } from "./chatRouteCommands";
import * as dispatcher from "./dispatcher";

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("new thread commands", () => {
  it.each([
    { mode: "normal", count: 2, command: "chat.new", picker: true },
    { mode: "boring", count: 2, command: "chat.new", picker: true },
    { mode: "boring", count: 1, command: "chat.new", picker: false },
    { mode: "boring", count: 2, command: "chat.newLocal", picker: false },
  ] as const)("$mode sidebar, $count projects, $command: picker=$picker", (scenario) => {
    using _settings = vi.spyOn(settings, "getClientSettings").mockReturnValue({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
    });
    using _projects = vi
      .spyOn(entities, "readProjects")
      .mockReturnValue([project("active"), project("idle")].slice(0, scenario.count));
    using openPicker = vi.spyOn(commandPalette, "openCommandPalette").mockImplementation(() => {});
    using startLocal = vi.spyOn(threadActions, "startNewThreadFromContext").mockResolvedValue(true);
    using register = vi.spyOn(dispatcher, "registerCommands").mockReturnValue(() => {});
    const router = { state: { matches: [] } } as unknown as AnyRouter;
    using stack = new DisposableStack();
    stack.defer(installChatRouteCommands(router));
    const commands = register.mock.calls[0]![0];
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    commands[scenario.command]!(event);

    if (scenario.picker) {
      expect(openPicker).toHaveBeenCalledWith({ open: "new-thread-in" });
      expect(startLocal).not.toHaveBeenCalled();
    } else {
      expect(openPicker).not.toHaveBeenCalled();
      expect(startLocal).toHaveBeenCalledOnce();
      expect(startLocal.mock.calls[0]?.[1]).toEqual(
        scenario.command === "chat.new" ? { environmentId: null } : undefined,
      );
    }
  });
});

describe("sidebar environment commands", () => {
  it.each([
    { command: "sidebar.environment.1", expected: "work", claimed: true },
    { command: "sidebar.environment.2", expected: "personal", claimed: true },
    { command: "sidebar.environment.9", expected: "initial", claimed: false },
    { command: "sidebar.environment.all", expected: null, claimed: true },
  ] as const)("$command selects $expected", ({ command, expected, claimed }) => {
    const initial = useUiStateStore.getState().sidebarEnvironmentId;
    using stack = new DisposableStack();
    stack.defer(() => useUiStateStore.getState().setSidebarEnvironmentId(initial));
    useUiStateStore.getState().setSidebarEnvironmentId(EnvironmentId.make("initial"));
    const identities = ["work", "personal"].map((id) => ({
      environmentId: EnvironmentId.make(id),
      label: id,
    }));
    const originalGet = appAtomRegistry.get.bind(appAtomRegistry);
    using _identities = vi
      .spyOn(appAtomRegistry, "get")
      .mockImplementation((atom) =>
        atom === environmentSummaries.identitiesAtom ? identities : originalGet(atom),
      );
    using register = vi.spyOn(dispatcher, "registerCommands").mockReturnValue(() => {});
    stack.defer(installChatRouteCommands({ state: { matches: [] } } as unknown as AnyRouter));
    const commands = register.mock.calls[0]![0];
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const handled = commands[command]!({
      preventDefault,
      stopPropagation,
    } as unknown as KeyboardEvent);
    if (!claimed) expect(handled).toBe(false);
    expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(expected);
    expect(preventDefault).toHaveBeenCalledTimes(claimed ? 1 : 0);
    expect(stopPropagation).toHaveBeenCalledTimes(claimed ? 1 : 0);
  });
});
