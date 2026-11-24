type Control = {
  readonly microphoneOpen: boolean;
  readonly toggleMute: () => void;
  readonly end: () => void;
};

export function createVoiceModeSessionStore() {
  let control: Control | null = null;
  return {
    acquire: (_owner: string) => true,
    getOwner: (): string | null => null,
    release: (_owner: string) => {},
    getControl: () => control,
    publish(_owner: string, next: Control | null) {
      control = next;
    },
  };
}
