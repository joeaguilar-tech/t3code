export function createVoiceModeCover() {
  return {
    placement: "inline",
    captureMuted: false,
    speechSuppressed: false,
    update(_routes: readonly { key: string; name: string }[], _ownerKey: string) {},
    control<T extends { microphoneOpen: boolean }>(control: T): T {
      return control;
    },
    unmute() {},
  };
}
