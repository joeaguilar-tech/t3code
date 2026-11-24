import { useGT } from "gt-react-native";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import { VoiceModeMuteButton } from "./ThreadVoiceModeToolbar";

import { voiceModeSessions } from "./voiceModeSessionStore";

export function FloatingVoiceModeControl() {
  const gt = useGT();
  const control = useSyncExternalStore(voiceModeSessions.subscribe, voiceModeSessions.getControl);
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
            accessibilityLabel={gt("End voice mode")}
            icon="stop.fill"
            variant="danger"
            onPress={control.end}
          />
        </View>
      </View>
    </FullWindowOverlay>
  );
}
