import { Group, Loader, Switch, Text, Tooltip } from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useApiErrorHandler } from "../utils/errors";

const TOOLTIP = `Queued mode runs every aggregate in this app with async writes
and stale reads: writes are enqueued and applied by a batch worker instead of
updating the B-tree in the same transaction, and reads come from the most
recently applied snapshot. Writes stop contending with each other, at the cost
of the counts and rankings lagging slightly behind the data.`;

export function QueuedModeToggle() {
  const mode = useQuery(api.settings.getQueuedMode);
  const setQueuedMode = useMutation(api.settings.setQueuedMode);
  const onApiError = useApiErrorHandler();

  // While draining we're still in queued mode, waiting for the batch worker to
  // apply the writes that are already enqueued. Synchronous reads would throw
  // until it catches up, so the toggle stays put in the meantime.
  const draining = mode?.draining ?? false;

  return (
    <Tooltip label={TOOLTIP} multiline w={320} withArrow>
      <Group gap="xs" align="center" wrap="nowrap">
        <Switch
          color="cyan"
          checked={mode?.queued ?? false}
          disabled={mode === undefined || draining}
          onChange={(event) =>
            setQueuedMode({ queued: event.currentTarget.checked }).catch(
              (error) => onApiError(error, "setQueuedMode"),
            )
          }
          label={
            <Text size="sm" c="gray.4" style={{ whiteSpace: "nowrap" }}>
              Queued mode
            </Text>
          }
        />
        {draining && (
          <Group gap={6} align="center" wrap="nowrap">
            <Loader size={14} color="cyan" />
            <Text size="xs" c="gray.6" style={{ whiteSpace: "nowrap" }}>
              draining…
            </Text>
          </Group>
        )}
      </Group>
    </Tooltip>
  );
}
