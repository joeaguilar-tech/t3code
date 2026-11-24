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

export function VoiceModeMuteButton(props: {
  readonly microphoneOpen: boolean;
  readonly onPress: () => void;
}) {
  return (
    <ComposerActionButton
      accessibilityLabel={props.microphoneOpen ? "Mute microphone" : "Unmute microphone"}
      icon={props.microphoneOpen ? "mic" : "mic.slash"}
      onPress={props.onPress}
    />
  );
}

export function ThreadVoiceModeToolbar({ voiceMode }: { voiceMode: ThreadVoiceMode }) {
  const { state, capturePhase, placement } = voiceMode;
  if (!state || placement !== "inline") return null;
  const transcribing = capturePhase === "transcribing" || capturePhase === "post-processing";
  const status = transcribing
    ? "Transcribing"
    : state.phase === "listening" && capturePhase !== "recording"
      ? "Preparing microphone"
      : statusLabels[state.phase];
  return (
    <View className="flex-row items-center px-4">
      <Text className="min-w-0 flex-1 text-sm text-foreground-muted" numberOfLines={1}>
        {status}
      </Text>
      <VoiceModeMuteButton microphoneOpen={state.microphoneOpen} onPress={voiceMode.toggleMute} />
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
      ) : state.playing ? (
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
