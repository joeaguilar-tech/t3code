const floatingPages = new Set([
  "ThreadAttachment",
  "ThreadFile",
  "ThreadFiles",
  "ThreadReview",
  "ThreadTerminal",
]);

const silentCovers = new Set([
  "GitBranches",
  "GitCommit",
  "GitConfirm",
  "GitOverview",
  "ThreadAgents",
  "ThreadBackgroundWork",
  "ThreadBrowserPreview",
  "ThreadDevicePreview",
  "ThreadInspectorFullscreen",
  "ThreadMcpApp",
  "ThreadPullRequests",
  "ThreadQueue",
  "ThreadReviewComment",
  "ThreadSettingsSheet",
]);

type CoverRoute = {
  readonly name: string;
  readonly key: string;
  readonly params?: object | undefined;
};

export function createVoiceModeCover() {
  let placement: "inline" | "floating" | "silent" | "away" = "inline";
  let captureMuted = false;
  return {
    get placement() {
      return placement;
    },
    get captureMuted() {
      return captureMuted;
    },
    get speechSuppressed() {
      return placement === "silent" || placement === "away";
    },
    update(routes: readonly CoverRoute[], ownerKey: string) {
      const owner = routes.findIndex(({ key }) => key === ownerKey);
      const covers = routes.slice(owner + 1);
      const ownerParams = routes[owner]?.params;
      const sameThread = ({ params }: CoverRoute) =>
        !params ||
        !ownerParams ||
        ((!("threadId" in params) ||
          !("threadId" in ownerParams) ||
          params.threadId === ownerParams.threadId) &&
          (!("environmentId" in params) ||
            !("environmentId" in ownerParams) ||
            params.environmentId === ownerParams.environmentId));
      if (
        owner < 0 ||
        covers.some(
          (route) =>
            !sameThread(route) || (!floatingPages.has(route.name) && !silentCovers.has(route.name)),
        )
      ) {
        placement = "away";
      } else if (covers.some((route) => silentCovers.has(route.name))) {
        placement = "silent";
        captureMuted = true;
      } else {
        placement = covers.length > 0 ? "floating" : "inline";
      }
    },
    control<T extends { microphoneOpen: boolean }>(control: T): T {
      return captureMuted ? { ...control, microphoneOpen: false } : control;
    },
    silence(_controller: { currentState: { manuallyMuted: boolean }; toggleMute: () => void }, _stopSpeaking: () => void) {},
    unmute() {
      if (placement === "inline" || placement === "floating") captureMuted = false;
    },
  };
}
