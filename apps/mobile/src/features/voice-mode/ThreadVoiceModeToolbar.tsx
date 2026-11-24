import { msg, useGT, useMessages } from "gt-react-native";
import { View } from "react-native";
import { ComposerActionButton } from "../../components/ComposerToolbar";
import { AppText as Text } from "../../components/ui/AppText";
import type { ThreadVoiceMode } from "./useVoiceMode";

const statusLabels = {
  idle: msg("Muted"),
  listening: msg("Listening"),
  sending: msg("Sending"),
  waiting: msg("Working"),
  speaking: msg("Speaking"),
  paused: msg("Paused"),
  muted: msg("Muted"),
  ended: msg("Muted"),
};

export function VoiceModeMuteButton(props: {
  readonly microphoneOpen: boolean;
  readonly onPress: () => void;
}) {
  const gt = useGT();
  return (
    <ComposerActionButton
      accessibilityLabel={props.microphoneOpen ? gt("Mute microphone") : gt("Unmute microphone")}
      icon={props.microphoneOpen ? "mic" : "mic.slash"}
      onPress={props.onPress}
    />
  );
}

export function ThreadVoiceModeToolbar({ voiceMode }: { voiceMode: ThreadVoiceMode }) {
  const gt = useGT();
  const m = useMessages();
  const { state, capturePhase, placement } = voiceMode;
  if (!state || placement !== "inline") return null;
  const transcribing = capturePhase === "transcribing" || capturePhase === "post-processing";
  const status = transcribing
    ? gt("Transcribing")
    : state.phase === "listening" && capturePhase !== "recording"
      ? gt("Preparing microphone")
      : m(statusLabels[state.phase]);
  return (
    <View className="flex-row items-center px-4">
      <Text className="min-w-0 flex-1 text-sm text-foreground-muted" numberOfLines={1}>
        {status}
      </Text>
      <VoiceModeMuteButton microphoneOpen={state.microphoneOpen} onPress={voiceMode.toggleMute} />
      {state.microphoneOpen ? (
        <>
          <ComposerActionButton
            accessibilityLabel={gt("Discard this recording")}
            icon="xmark"
            onPress={voiceMode.cancelTurn}
          />
          <ComposerActionButton
            accessibilityLabel={gt("Send recording now")}
            icon="arrow.up"
            onPress={voiceMode.tapToSend}
          />
        </>
      ) : state.playing ? (
        <ComposerActionButton
          accessibilityLabel={gt("Interrupt speech")}
          icon="pause"
          onPress={voiceMode.interrupt}
        />
      ) : null}
      <ComposerActionButton
        accessibilityLabel={gt("End voice mode")}
        icon="stop.fill"
        variant="danger"
        onPress={voiceMode.end}
      />
    </View>
  );
}
