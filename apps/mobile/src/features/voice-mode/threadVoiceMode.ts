import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import type { VoiceModeRunEvent } from "@t3tools/client-runtime/voice-input";
import type { FollowUpBehavior } from "../../lib/followUpBehavior";

type Run = {
  readonly id: string;
  readonly userMessageId: string;
  readonly status: OrchestrationV2RunStatus;
};
type Message = {
  readonly id: string;
  readonly runId: string | null;
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly streaming: boolean;
};
export type ThreadVoiceState = {
  readonly runs: readonly Run[];
  readonly messages: readonly Message[];
  readonly needsUser: boolean;
};

export function deriveVoiceRunEvents(
  _previous: ThreadVoiceState | null,
  _current: ThreadVoiceState,
): VoiceModeRunEvent[] {
  return [];
}

export function buildSpokenSend(_input: {
  readonly text: string;
  readonly running: boolean;
  readonly canSteer: boolean;
  readonly followUpBehavior?: FollowUpBehavior;
}): {
  text: string;
  context?: { version: 1; records: []; spoken: true };
  dispatchMode?: "queue" | "auto";
} {
  return { text: _input.text };
}

export function voiceModeAutoMute(value: boolean | undefined): boolean {
  return value ?? false;
}
