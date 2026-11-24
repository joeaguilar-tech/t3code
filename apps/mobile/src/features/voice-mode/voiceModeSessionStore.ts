type Control = {
  readonly microphoneOpen: boolean;
  readonly toggleMute: () => void;
  readonly end: () => void;
};

export function createVoiceModeSessionStore() {
  let owner: string | null = null;
  let control: Control | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getOwner: () => owner,
    getControl: () => control,
    acquire(nextOwner: string) {
      if (owner !== null) return false;
      owner = nextOwner;
      notify();
      return true;
    },
    release(currentOwner: string) {
      if (owner !== currentOwner) return;
      owner = null;
      control = null;
      notify();
    },
    publish(currentOwner: string, next: Control | null) {
      if (owner !== currentOwner || control === next) return;
      control = next;
      notify();
    },
  };
}

export const voiceModeSessions = createVoiceModeSessionStore();
