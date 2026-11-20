import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  type ModelSelection,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  resolveNewThreadModelSelectionOverride,
  startNewThreadFromContext,
} from "./chatThreadActions";

const PROJECT_DEFAULT_SELECTION: ModelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "project-default",
};
const CARRIED_SELECTION: ModelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "carried-model",
};

describe("chatThreadActions", () => {
  it("does not carry a non-explicit model from the destination draft back into itself", () => {
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: null,
        carrySelection: CARRIED_SELECTION,
        carrySourceDraftId: "draft-a",
        destinationDraftId: "draft-a",
      }),
    ).toBeNull();
  });

  it("keeps the project default above any carried selection", () => {
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: PROJECT_DEFAULT_SELECTION,
        carrySelection: CARRIED_SELECTION,
        carrySourceDraftId: "draft-a",
        destinationDraftId: "draft-b",
      }),
    ).toEqual(PROJECT_DEFAULT_SELECTION);
  });
});

vi.mock("../hooks/useSidebarEnvironmentScope", () => ({
  readSidebarEnvironmentId: () => EnvironmentId.make("work"),
}));

it("keeps explicit current-project actions while allowing the new-thread shortcut override", async () => {
  const current = {
    environmentId: EnvironmentId.make("personal"),
    projectId: ProjectId.make("current"),
  };
  const fallback = {
    environmentId: EnvironmentId.make("work"),
    projectId: ProjectId.make("default"),
  };
  const handleNewThread = vi.fn(async () => undefined);
  const context = {
    activeThread: current,
    activeDraftThread: null,
    defaultProjectRef: fallback,
    handleNewThread,
  };
  await startNewThreadFromContext(context);
  expect(handleNewThread).toHaveBeenLastCalledWith(current);
  await startNewThreadFromContext(context, { environmentId: fallback.environmentId });
  expect(handleNewThread).toHaveBeenLastCalledWith(fallback);
});
