import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect } from "react";

import { useDeadlinePassed } from "~/hooks/useDeadline";
import { useNowSecond } from "~/hooks/useNowSecond";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { PullRequestGlyph } from "./pullRequestIcons";

export function PullRequestsUnavailableState({
  title = "Could not load pull requests",
  error,
  onRetry,
  retryAt = null,
  refreshing = false,
  host,
}: {
  title?: string;
  error: string;
  onRetry?: () => void;
  /** When a host rate-limit pause ends (epoch ms); the state retries itself then. */
  retryAt?: number | null;
  refreshing?: boolean;
  host?: { readonly url: string; readonly openLabel: string };
}) {
  const paused = !useDeadlinePassed(retryAt) && retryAt !== null;
  return (
    <Empty className="scrollbar-gutter-both min-h-0 justify-center-safe overflow-y-auto [&>*]:shrink-0">
      <EmptyMedia variant="icon">
        <PullRequestGlyph.pullRequest />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
        {paused && onRetry ? <AutoRetry retryAt={retryAt} onRetry={onRetry} /> : null}
      </EmptyHeader>
      {onRetry || host ? (
        <div className="flex flex-wrap justify-center gap-2">
          {onRetry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshIcon size="sm" refreshing={refreshing} />
              Retry
            </Button>
          ) : null}
          {host ? (
            <Button
              size="sm"
              variant="outline"
              render={<a href={host.url} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLinkIcon aria-hidden className="size-3.5" />
              {host.openLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Empty>
  );
}

/** Mounted only while paused, so the second tick stops once the pause ends. */
function AutoRetry({
  retryAt,
  onRetry,
}: {
  readonly retryAt: number;
  readonly onRetry: () => void;
}) {
  const seconds = Math.max(1, Math.ceil((retryAt - useNowSecond()) / 1_000));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- schedules the retry for when the host's pause ends
  useEffect(() => {
    const timer = setTimeout(onRetry, Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt, onRetry]);
  return (
    <p className="text-muted-foreground text-xs">
      Retrying in {seconds < 60 ? `${seconds}s` : formatDuration(seconds * 1_000)}
    </p>
  );
}
