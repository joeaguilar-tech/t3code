import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ProjectId,
  ThreadId,
  RunId,
  ProviderInstanceId,
  ServerConfig,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import {
  useQuietThreadShells,
  useProjects,
  useServerConfigs,
  useDelegatedUnderParent,
} from "../state/entities";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import { useEnvironmentIdentities } from "../state/environments";
import { useUiStateStore } from "../uiStateStore";
import { useAutomationThreadKeys } from "./sidebar/useAutomationThreadKeys";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { makeThreadFixture } from "../test-fixtures";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";

vi.mock("../state/entities", { spy: true });
vi.mock("../state/environments", { spy: true });
vi.mock("../hooks/useThreadRouteTarget", { spy: true });
vi.mock("./sidebar/useAutomationThreadKeys", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
vi.mock("../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: () => null,
  SidebarChromeFooter: () => null,
}));

const decodeServerConfig = Schema.decodeSync(ServerConfig);

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

describe("sidebar header new thread", () => {
  it.each([
    { mode: "normal", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: true, picker: false },
    { mode: "boring", count: 1, shift: false, picker: false },
  ] as const)("$mode sidebar, $count projects, shift=$shift: picker=$picker", async (scenario) => {
    using stack = new DisposableStack();
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
    });
    const projects = [project("active"), project("idle")].slice(0, scenario.count);
    const currentProjectRef = {
      environmentId: projects[0]!.environmentId,
      projectId: projects[0]!.id,
    };
    const startThread = vi.fn().mockResolvedValue(null);
    vi.mocked(useProjects).mockReturnValue(projects);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: currentProjectRef,
      handleNewThread: startThread,
      routeDraftId: null,
      routeThreadRef: null,
    });
    vi.mocked(openCommandPalette).mockClear();
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New thread", exact: true }), {
      modifiers: scenario.shift ? ["Shift"] : [],
    });

    if (scenario.picker) {
      expect(openCommandPalette).toHaveBeenCalledExactlyOnceWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openCommandPalette).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith(currentProjectRef);
    }
  });
});

describe("sidebar environment UI", () => {
  it.each([
    { working: false, reveal: false, hidden: "visible" },
    { working: true, reveal: false, hidden: "visible" },
    { working: false, reveal: true, hidden: "visible" },
    { working: false, reveal: true, hidden: "delegated" },
    { working: false, reveal: true, hidden: "archived" },
    { working: false, reveal: false, hidden: "archived" },
    { working: false, reveal: false, hidden: "archived-failed" },
  ])(
    "filters environments (working=$working, reveal=$reveal, hidden=$hidden)",
    async ({ working, reveal, hidden }) => {
      const local = EnvironmentId.make("local");
      const remote = EnvironmentId.make("remote");
      using stack = new DisposableStack();
      for (const shelf of ["working", "settled", "automations", "snoozed"]) {
        const key = `t3code:sidebar:${shelf}-expanded`;
        const saved = localStorage.getItem(key);
        stack.defer(() =>
          saved === null ? localStorage.removeItem(key) : localStorage.setItem(key, saved),
        );
        localStorage.setItem(key, "false");
      }
      const previousSettings = getClientSettings();
      stack.defer(() => __setClientSettingsForTests(previousSettings));
      __setClientSettingsForTests({
        ...DEFAULT_CLIENT_SETTINGS,
        sidebarProjectGroupingMode: "repository",
      });
      const previous = useUiStateStore.getState();
      stack.defer(() => useUiStateStore.setState(previous, true));
      useUiStateStore.setState({
        sidebarEnvironmentId: local,
        sidebarProjectScopeKeys: ["missing-remote-project"],
      });
      vi.mocked(useEnvironmentIdentities).mockReturnValue([
        { environmentId: local, label: "Local" },
        { environmentId: remote, label: "Remote" },
      ]);
      vi.mocked(useServerConfigs).mockReturnValue(
        new Map(
          [local, remote].map((environmentId) => [
            environmentId,
            decodeServerConfig({
              environment: {
                environmentId,
                label: environmentId,
                platform: { os: "linux", arch: "x64" },
                serverVersion: "0.1.1",
                capabilities: {},
              },
              auth: {
                policy: "loopback-browser",
                bootstrapMethods: [],
                sessionMethods: [],
                sessionCookieName: "test",
              },
              cwd: "/test",
              keybindingsConfigPath: "/test/keybindings.json",
              keybindings: [],
              issues: [],
              providers: [],
              availableEditors: [],
              observability: {
                logsDirectoryPath: "/test/logs",
                localTracingEnabled: false,
                otlpTracesEnabled: false,
                otlpMetricsEnabled: false,
              },
              settings: {},
            }),
          ]),
        ),
      );
      const repositoryIdentity = {
        canonicalKey: "github.com/example/shared",
        locator: {
          source: "git-remote" as const,
          remoteName: "origin",
          remoteUrl: "https://github.com/example/shared.git",
        },
      };
      vi.mocked(useProjects).mockReturnValue([
        { ...project("local-project"), repositoryIdentity },
        { ...project("remote-project"), environmentId: remote, repositoryIdentity },
      ]);
      vi.mocked(useThreadRouteTarget).mockReturnValue(
        reveal
          ? {
              kind: "server",
              threadRef: { environmentId: remote, threadId: ThreadId.make("remote-thread") },
            }
          : null,
      );
      vi.mocked(useAutomationThreadKeys).mockReturnValue(
        new Set([scopedThreadKey(scopeThreadRef(remote, ThreadId.make("automation")))]),
      );
      vi.mocked(useDelegatedUnderParent).mockReturnValue(
        new Set(
          hidden === "delegated"
            ? [threadKey(scopeThreadRef(remote, ThreadId.make("remote-thread")))]
            : [],
        ),
      );
      vi.mocked(useQuietThreadShells).mockReturnValue([
        makeThreadFixture({
          environmentId: remote,
          projectId: ProjectId.make("remote-project"),
          id: ThreadId.make("settled"),
          title: "Remote settled",
          settledOverride: "settled",
          settledAt: "2026-03-09T10:05:00.000Z",
        }),
        makeThreadFixture({
          environmentId: remote,
          projectId: ProjectId.make("remote-project"),
          id: ThreadId.make("snoozed"),
          title: "Remote snoozed",
          snoozedAt: "2026-03-09T10:05:00.000Z",
          snoozedUntil: "2099-01-01T00:00:00.000Z",
        }),
        makeThreadFixture({
          environmentId: remote,
          projectId: ProjectId.make("remote-project"),
          id: ThreadId.make("automation"),
          title: "Remote automation",
        }),
        makeThreadFixture({
          environmentId: local,
          projectId: ProjectId.make("local-project"),
          id: ThreadId.make("local-thread"),
          title: "Local thread",
        }),
        makeThreadFixture({
          environmentId: remote,
          projectId: ProjectId.make("remote-project"),
          id: ThreadId.make("remote-thread"),
          title: "Remote thread",
          archivedAt: hidden.startsWith("archived") ? "2026-03-09T10:06:00.000Z" : null,
          runtime: working
            ? {
                status: "running",
                activeRunId: RunId.make("run"),
                providerInstanceId: ProviderInstanceId.make("codex"),
                providerName: "Codex",
                lastError: null,
                updatedAt: "2026-03-09T10:00:00.000Z",
              }
            : null,
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          latestRun: {
            runId: RunId.make("run"),
            status: working ? "running" : hidden === "archived-failed" ? "failed" : "completed",
            assistantMessageId: null,
            requestedAt: "2026-03-09T10:00:00.000Z",
            startedAt: "2026-03-09T10:00:00.000Z",
            completedAt: working ? null : "2026-03-09T10:05:00.000Z",
          },
        }),
      ]);
      await using screen = await render(
        <SidebarProvider>
          <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
        </SidebarProvider>,
      );
      if (hidden !== "visible") {
        await expect
          .element(screen.getByText("Local thread", { exact: true }).last())
          .toBeVisible();
        await expect
          .element(
            screen.getByRole("button", {
              name: "Filter threads by environment: Local",
              exact: true,
            }),
          )
          .toBeVisible();
        expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(local);
        await userEvent.click(
          screen.getByRole("button", { name: "Filter threads by environment: Local", exact: true }),
        );
        await userEvent.click(page.getByRole("menuitem", { name: "Remote", exact: true }));
        await expect
          .element(
            screen.getByRole("button", {
              name: "Filter threads by environment: Remote",
              exact: true,
            }),
          )
          .toBeVisible();
        expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(remote);
        await userEvent.click(
          screen.getByRole("button", {
            name: "Filter threads by environment: Remote",
            exact: true,
          }),
        );
        await userEvent.click(page.getByRole("menuitem", { name: "Local", exact: true }));
        await expect
          .element(screen.getByText("Local thread", { exact: true }).last())
          .toBeVisible();
        expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(local);
        return;
      }
      if (reveal) {
        await expect
          .element(screen.getByText("Remote thread", { exact: true }).last())
          .toBeVisible();
        await vi.waitFor(() =>
          expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(remote),
        );
        await expect
          .element(screen.getByText("Local thread", { exact: true }).last())
          .not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole("button", { name: "Filter threads by environment: Remote" }),
        );
        await userEvent.click(page.getByRole("menuitem", { name: "Local", exact: true }));
        await expect
          .element(screen.getByText("Local thread", { exact: true }).last())
          .toBeVisible();
        expect(useUiStateStore.getState().sidebarEnvironmentId).toBe(local);
        return;
      }
      await expect.element(screen.getByText("Local thread", { exact: true }).last()).toBeVisible();
      expect(useUiStateStore.getState().sidebarProjectScopeKeys).toEqual([
        "missing-remote-project",
      ]);
      await expect.element(screen.getByRole("button", { name: /^Settled0/ })).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: /^Snoozed/ }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: /^Automations/ }))
        .not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("combobox", { name: "Filter threads by project" }));
      await expect.element(page.getByRole("option", { name: /local-project/ })).toBeVisible();
      await expect
        .element(page.getByRole("option", { name: /remote-project/ }))
        .not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await expect
        .element(screen.getByText("Remote thread", { exact: true }).last())
        .not.toBeInTheDocument();
      await expect
        .element(
          screen.getByRole("button", {
            name: `Filter threads by environment: Local${working ? "" : ", another environment has finished threads"}`,
            exact: true,
          }),
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: /^Working/ }))
        .not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: /^Filter threads by environment: Local/ }),
      );
      await userEvent.click(page.getByRole("menuitem", { name: "All environments" }));
      if (working) await userEvent.click(screen.getByRole("button", { name: /^Working1/ }));
      await expect.element(screen.getByRole("button", { name: /^Settled1/ })).toBeVisible();
      for (const shelf of ["Snoozed", "Automations"] as const) {
        await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${shelf}1`) }));
      }
      await userEvent.click(screen.getByRole("button", { name: /^Settled1/ }));
      for (const title of ["Remote settled", "Remote snoozed", "Remote automation"]) {
        await expect.element(screen.getByText(title, { exact: true }).last()).toBeVisible();
      }
      await expect.element(screen.getByText("Remote thread", { exact: true }).last()).toBeVisible();
    },
  );
});
