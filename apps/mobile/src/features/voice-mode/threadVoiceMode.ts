import type { OrchestrationV2RunStatus } from "@t3tools/contracts";
import type { VoiceModeRunEvent } from "@t3tools/client-runtime/voice-input";
import { DEFAULT_FOLLOW_UP_BEHAVIOR, type FollowUpBehavior } from "../../lib/followUpBehavior";

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

function activeRun(state: ThreadVoiceState | null) {
  return state?.runs.findLast(
    ({ status }) =>
      status === "preparing" ||
      status === "starting" ||
      status === "running" ||
      status === "waiting",
  );
}

export function deriveVoiceRunEvents(
  previous: ThreadVoiceState | null,
  current: ThreadVoiceState,
): VoiceModeRunEvent[] {
  const events: VoiceModeRunEvent[] = [];
  if (previous && previous.runs !== current.runs) {
    const previousStatuses = new Map(previous.runs.map(({ id, status }) => [id, status]));
    for (const run of current.runs) {
      if (previousStatuses.get(run.id) === run.status) continue;
      if (run.status === "completed" || run.status === "failed" || run.status === "interrupted") {
        const handledMessageIds = new Set([run.userMessageId]);
        let finalMessage = "";
        for (const message of current.messages) {
          if (message.runId !== run.id) continue;
          if (message.role === "user") handledMessageIds.add(message.id);
          if (message.role === "assistant" && !message.streaming) finalMessage = message.text;
        }
        const ids = [...handledMessageIds];
        const event =
          run.status === "completed"
            ? { type: "finished" as const, finalMessage, handledMessageIds: ids }
            : { type: "failed" as const, handledMessageIds: ids };
        events.push(event);
      }
    }
  }

  if (current.needsUser) {
    if (!previous?.needsUser || events.length > 0) events.push({ type: "needs-user" });
  } else {
    const run = activeRun(current);
    if (run && (previous?.needsUser || run.id !== activeRun(previous)?.id || events.length > 0)) {
      events.push({ type: "running" });
    }
  }
  return events;
}

export function buildSpokenSend(input: {
  readonly text: string;
  readonly running: boolean;
  readonly canSteer: boolean;
  readonly followUpBehavior?: FollowUpBehavior;
}) {
  const followUp = input.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR;
  return {
    text: input.text,
    context: { version: 1 as const, records: [], spoken: true as const },
    ...(input.running
      ? {
          dispatchMode:
            input.canSteer && followUp === "steer" ? ("auto" as const) : ("queue" as const),
        }
      : {}),
  };
}

export function voiceModeAutoMute(value: boolean | undefined): boolean {
  return value ?? true;
}
