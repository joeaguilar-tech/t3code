import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it } from "vite-plus/test";
import { makeThreadFixture } from "../test-fixtures";
import {
  environmentForShortcutIndex,
  filterToEnvironment,
  resolveSidebarNewThreadProjectRef,
  resolveSidebarDefaultProjectRef,
  resolveEffectiveSidebarEnvironmentId,
  resolveHiddenEnvironmentDots,
} from "./Sidebar.environment";

const work = EnvironmentId.make("work");
const personal = EnvironmentId.make("personal");

describe("sidebar environment filter", () => {
  it("falls back while disconnected without losing the saved environment", () => {
    const saved = work;
    expect(resolveEffectiveSidebarEnvironmentId(saved, new Set([personal]))).toBeNull();
    expect(saved).toBe(work);
    expect(resolveEffectiveSidebarEnvironmentId(saved, new Set([work, personal]))).toBe(work);
    expect(resolveEffectiveSidebarEnvironmentId(null, new Set([work]))).toBeNull();
  });

  it("passes all items through by reference and narrows a selected environment", () => {
    const items = [{ environmentId: work }, { environmentId: personal }];
    expect(filterToEnvironment(items, null)).toBe(items);
    expect(filterToEnvironment(items, work)).toEqual([items[0]]);
  });

  it("resolves 1-based shortcut indices", () => {
    const environments = [{ environmentId: work }, { environmentId: personal }];
    expect(environmentForShortcutIndex(environments, 1)).toBe(work);
    expect(environmentForShortcutIndex(environments, 2)).toBe(personal);
    expect(environmentForShortcutIndex(environments, 0)).toBeNull();
    expect(environmentForShortcutIndex(environments, 3)).toBeNull();
  });

  it("groups hidden dots by urgency and honors scoped visit markers", () => {
    const unread = {
      ...makeThreadFixture({ environmentId: personal }),
      lastVisitedAt: undefined,
      latestRun: {
        runId: RunId.make("run"),
        status: "completed" as const,
        assistantMessageId: null,
        requestedAt: "2026-03-09T10:00:00.000Z",
        startedAt: "2026-03-09T10:00:00.000Z",
        completedAt: "2026-03-09T10:05:00.000Z",
      },
    };
    const key = scopedThreadKey(scopeThreadRef(personal, unread.id));
    const visits = { [key]: "2026-03-09T10:04:00.000Z" };
    const runtime = {
      status: "running" as const,
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerName: "Codex",
      lastError: null,
      updatedAt: "2026-03-09T10:00:00.000Z",
    };
    const working = { ...unread, runtime };
    const attention = { ...unread, id: ThreadId.make("attention"), hasPendingUserInput: true };
    const failed = { ...unread, runtime: { ...runtime, status: "failed" as const } };
    expect(resolveHiddenEnvironmentDots([unread], null, visits).size).toBe(0);
    expect(resolveHiddenEnvironmentDots([unread], work, visits)).toEqual(
      new Map([[personal, "unread"]]),
    );
    expect(resolveHiddenEnvironmentDots([unread, attention], work, visits)).toEqual(
      new Map([[personal, "attention"]]),
    );
    expect(resolveHiddenEnvironmentDots([failed], work, visits)).toEqual(
      new Map([[personal, "attention"]]),
    );
    expect(resolveHiddenEnvironmentDots([working], work, visits).size).toBe(0);
    expect(
      resolveHiddenEnvironmentDots([unread], work, { [key]: "2026-03-09T10:06:00.000Z" }).size,
    ).toBe(0);
    expect(resolveHiddenEnvironmentDots([unread], personal, visits).size).toBe(0);
    expect(
      resolveHiddenEnvironmentDots(
        [unread, { ...attention, environmentId: work }],
        EnvironmentId.make("other"),
        visits,
      ),
    ).toEqual(
      new Map([
        [personal, "unread"],
        [work, "attention"],
      ]),
    );
  });
});

describe("new thread environment choice", () => {
  const project = (environmentId: EnvironmentId, id: string, archivedAt: string | null = null) => ({
    environmentId,
    id: ProjectId.make(id),
    workspaceRoot: `/work/${id}`,
    archivedAt,
  });
  const projects = [
    project(personal, "personal"),
    project(work, "older"),
    project(work, "recent"),
    project(work, "archived", "2026-01-01"),
  ];
  const order = [
    "legacy-project-cwd:/work/archived",
    "legacy-project-cwd:/work/recent",
    "legacy-project-cwd:/work/older",
  ];
  it.each([
    {
      current: { environmentId: work, projectId: ProjectId.make("older") },
      environmentId: work,
      want: "older",
    },
    {
      current: { environmentId: personal, projectId: ProjectId.make("personal") },
      environmentId: work,
      want: "recent",
    },
    { current: null, environmentId: work, want: "recent" },
    {
      current: { environmentId: personal, projectId: ProjectId.make("personal") },
      environmentId: null,
      want: "personal",
    },
    { current: null, environmentId: EnvironmentId.make("empty"), want: null },
  ])("selects $want with environment $environmentId", ({ current, environmentId, want }) => {
    expect(
      resolveSidebarNewThreadProjectRef(
        current,
        resolveSidebarDefaultProjectRef(projects, order, environmentId),
        environmentId,
      )?.projectId ?? null,
    ).toBe(want);
  });
});
