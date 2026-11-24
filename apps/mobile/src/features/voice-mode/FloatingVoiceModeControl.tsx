import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import { VoiceModeMuteButton } from "./ThreadVoiceModeToolbar";

type Control = {
  readonly microphoneOpen: boolean;
  readonly toggleMute: () => void;
  readonly end: () => void;
};

let floatingControl: Control | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return floatingControl;
}

export function publishFloatingVoiceModeControl(control: Control | null) {
  if (floatingControl === control) return;
  floatingControl = control;
  for (const listener of listeners) listener();
}

export function FloatingVoiceModeControl() {
  const control = useSyncExternalStore(subscribe, getSnapshot);
  const insets = useSafeAreaInsets();
  if (!control) return null;
  return (
    <FullWindowOverlay>
      <View className="absolute inset-0" pointerEvents="box-none">
        <View
          className="absolute flex-row items-center rounded-l-full border border-r-0 border-border bg-card pl-2 shadow-md shadow-black/10"
          style={{ bottom: Math.max(insets.bottom, 12) + 64, right: insets.right }}
        >
          <VoiceModeMuteButton
            microphoneOpen={control.microphoneOpen}
            onPress={control.toggleMute}
          />
          <ComposerActionButton
            accessibilityLabel="End voice mode"
            icon="stop.fill"
            variant="danger"
            onPress={control.end}
          />
        </View>
      </View>
    </FullWindowOverlay>
  );
}
