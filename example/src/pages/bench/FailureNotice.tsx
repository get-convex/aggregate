import { Card, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { isComplete, modeLabel, type BenchRun } from "./benchTypes";
import { formatCount } from "./charts/scale";
import { SectionHeading } from "./SectionHeading";

/**
 * Runs that didn't land all their operations, and so aren't in any of the numbers
 * below.
 *
 * They are excluded from the medians rather than averaged in: a run that lost work
 * measured a smaller workload, not a noisier sample of the configured one. Naming
 * them here keeps a suite from quietly reporting fewer repeats than it ran.
 */
export function FailureNotice({ runs }: { runs: BenchRun[] }) {
  const failures = runs.flatMap((run) => {
    const results = run.results;
    if (!results || isComplete(run)) return [];
    return [
      { run, results, missing: results.ops.attempted - results.ops.committed },
    ];
  });
  if (failures.length === 0) return null;

  return (
    <Card
      bg="dark.7"
      p="lg"
      withBorder
      c="orange.4"
      style={{ borderColor: "var(--mantine-color-orange-9)" }}
    >
      <Stack gap="sm">
        <SectionHeading
          title="Incomplete runs"
          right={
            <Group gap={6} c="orange.4">
              <IconAlertTriangle size={16} />
              <Text size="xs">
                {failures.length === 1
                  ? "1 run excluded from the stats below"
                  : `${failures.length} runs excluded from the stats below`}
              </Text>
            </Group>
          }
        />
        <Stack gap="md">
          {failures.map(({ run, results, missing }) => (
            <Stack key={run._id} gap={4}>
              <Group gap="xs">
                <Text size="sm" fw={600} c="gray.2">
                  {modeLabel(run.config.mode)}
                  {run.repeatIndex !== undefined
                    ? ` · repeat ${run.repeatIndex + 1}`
                    : ""}
                </Text>
                <Text size="sm" c="orange.4">
                  {formatCount(missing)} of {formatCount(results.ops.attempted)}{" "}
                  ops never landed
                </Text>
                <Text size="sm" c="gray.5">
                  {results.jobs.failed} of {results.jobs.total} jobs failed
                  {cause(results)}
                </Text>
              </Group>
              {results.errors.samples[0] && (
                <Text
                  size="xs"
                  c="gray.6"
                  ff="monospace"
                  style={{ wordBreak: "break-word" }}
                >
                  {results.errors.samples[0]}
                </Text>
              )}
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/** The dominant error class, named the way the reader can act on it. */
function cause(results: NonNullable<BenchRun["results"]>): string {
  const { errors } = results;
  const limit = errors.limit ?? 0;
  if (limit > 0) {
    return " · transaction limit exceeded, so the ops per transaction is too high for this mode";
  }
  if (errors.pendingOperations > 0) return " · PENDING_OPERATIONS";
  if (errors.occSuspected > 0) return " · write conflicts";
  return "";
}
