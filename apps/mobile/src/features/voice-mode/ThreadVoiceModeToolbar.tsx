import { View } from "react-native";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import { AppText as Text } from "../../components/ui/AppText";
import type { ThreadVoiceMode } from "./useVoiceMode";

const statusLabels = {
  idle: "Muted",
  listening: "Listening",
  sending: "Sending",
  waiting: "Working",
  speaking: "Speaking",
  paused: "Paused",
  muted: "Muted",
  ended: "Muted",
};

export function ThreadVoiceModeToolbar({ voiceMode }: { voiceMode: ThreadVoiceMode }) {
  const { state, recording } = voiceMode;
  if (!state) return null;
  const status =
    state.phase === "listening" && !recording ? "Preparing microphone" : statusLabels[state.phase];
  return (
    <View className="flex-row items-center px-4">
      <Text className="min-w-0 flex-1 text-sm text-foreground-muted" numberOfLines={1}>
        {status}
      </Text>
      <ComposerActionButton
        accessibilityLabel={state.microphoneOpen ? "Mute microphone" : "Unmute microphone"}
        icon={recording ? "mic" : "mic.slash"}
        onPress={voiceMode.toggleMute}
      />
      {state.microphoneOpen ? (
        <>
          <ComposerActionButton
            accessibilityLabel="Discard this recording"
            icon="xmark"
            onPress={voiceMode.cancelTurn}
          />
          <ComposerActionButton
            accessibilityLabel="Send recording now"
            icon="arrow.up"
            onPress={voiceMode.tapToSend}
          />
        </>
      ) : state.phase === "speaking" ? (
        <ComposerActionButton
          accessibilityLabel="Interrupt speech"
          icon="pause"
          onPress={voiceMode.interrupt}
        />
      ) : null}
      <ComposerActionButton
        accessibilityLabel="End voice mode"
        icon="stop.fill"
        variant="danger"
        onPress={voiceMode.end}
      />
    </View>
  );
}
