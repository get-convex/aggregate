import {
  Button,
  Collapse,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { MODE_COLOR } from "./charts/chartTheme";
import {
  configSummary,
  scenarioMeta,
  SCENARIOS,
  type BenchRun,
  type BenchScenario,
} from "./benchTypes";

const inputStyles = {
  label: { color: "white" },
  input: { backgroundColor: "var(--mantine-color-dark-4)" },
} as const;

export type RunConfigSectionProps = {
  config: BenchRun["config"];
  onChange: (config: BenchRun["config"]) => void;
  repeats: number;
  onRepeatsChange: (repeats: number) => void;
  /** Both modes x `repeats`, sequentially. The comparison the page is built on. */
  onStartSuite: () => void;
  /** One run in the currently selected mode. */
  onStartSingle: () => void;
  onCancel: () => void;
  isStarting: boolean;
  isInFlight: boolean;
  /** Non-zero means an eager run will be refused. */
  pendingOps: number;
};

export function RunConfigSection({
  config,
  onChange,
  repeats,
  onRepeatsChange,
  onStartSuite,
  onStartSingle,
  onCancel,
  isStarting,
  isInFlight,
  pendingOps,
}: RunConfigSectionProps) {
  const meta = scenarioMeta(config.scenario);
  // `startBlocked` refuses both modes while ops are queued, not just eager ones.
  const queueBlocked = pendingOps > 0;
  const [singleOpen, { toggle: toggleSingle }] = useDisclosure(false);

  const setScenario = (scenario: BenchScenario) => {
    const next = scenarioMeta(scenario);
    // Drop fields the new scenario doesn't use, rather than sending stale ones.
    onChange({
      ...config,
      scenario,
      shards: 1,
      readers: undefined,
      readsPerReader: undefined,
      arrivalRatePerSec: undefined,
      ...next.defaults,
    });
  };

  return (
    <Paper p="md" radius="md" bg="dark.5">
      <Stack gap="sm">
        <Text size="lg" fw={500} c="white">
          Configure run
        </Text>

        <Select
          label="Scenario"
          data={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
          value={config.scenario}
          onChange={(value) => value && setScenario(value as BenchScenario)}
          allowDeselect={false}
          size="sm"
          styles={inputStyles}
        />
        <Text size="xs" c="dimmed">
          {meta.description}
        </Text>

        <NumberInput
          label="Total operations"
          value={config.totalOps}
          onChange={(value) =>
            onChange({ ...config, totalOps: toNumber(value, config.totalOps) })
          }
          min={10}
          max={200_000}
          step={100}
          size="sm"
          styles={inputStyles}
        />

        <NumberInput
          label="Concurrent jobs per wave"
          description="Fan-out width"
          value={config.jobsPerWave}
          onChange={(value) =>
            onChange({
              ...config,
              jobsPerWave: toNumber(value, config.jobsPerWave),
            })
          }
          min={1}
          max={200}
          size="sm"
          styles={inputStyles}
        />

        <NumberInput
          label="Operations per transaction"
          value={config.opsPerMutation}
          onChange={(value) =>
            onChange({
              ...config,
              opsPerMutation: toNumber(value, config.opsPerMutation),
            })
          }
          min={1}
          max={100}
          size="sm"
          styles={inputStyles}
        />

        <NumberInput
          label="Repeats per mode"
          description="Median and range come from these"
          value={repeats}
          onChange={(value) => onRepeatsChange(toNumber(value, repeats))}
          min={1}
          max={10}
          size="sm"
          styles={inputStyles}
        />

        {/* Scenario-specific fields mount and unmount rather than disabling —
            a control you can't act on is just noise. */}
        {meta.fields.includes("shards") && (
          <NumberInput
            label="Namespaces"
            value={config.shards}
            onChange={(value) =>
              onChange({ ...config, shards: toNumber(value, config.shards) })
            }
            min={2}
            max={64}
            size="sm"
            styles={inputStyles}
          />
        )}

        {meta.fields.includes("arrivalRatePerSec") && (
          <NumberInput
            label="Arrival rate (ops/sec)"
            value={config.arrivalRatePerSec ?? 50}
            onChange={(value) =>
              onChange({
                ...config,
                arrivalRatePerSec: toNumber(
                  value,
                  config.arrivalRatePerSec ?? 50,
                ),
              })
            }
            min={1}
            max={1000}
            size="sm"
            styles={inputStyles}
          />
        )}

        {meta.fields.includes("readers") && (
          <NumberInput
            label="Concurrent readers"
            value={config.readers ?? 10}
            onChange={(value) =>
              onChange({
                ...config,
                readers: toNumber(value, config.readers ?? 10),
              })
            }
            min={1}
            max={100}
            size="sm"
            styles={inputStyles}
          />
        )}

        <Text size="xs" c="dimmed">
          {configSummary(config)}
        </Text>

        {/* Teach the constraint before the user hits it, rather than after. */}
        {queueBlocked && (
          <Text size="xs" c="orange.4">
            {pendingOps} operation(s) still queued — a new run will be refused
            until the worker drains (eager writes throw PENDING_COMMITS; a
            queued run would measure this backlog).
          </Text>
        )}

        {isInFlight ? (
          <Button
            onClick={onCancel}
            variant="light"
            color="red"
            leftSection={<IconPlayerStop size={16} />}
            size="sm"
            fullWidth
          >
            Cancel
          </Button>
        ) : (
          <Stack gap={6}>
            <Button
              onClick={onStartSuite}
              loading={isStarting}
              disabled={isStarting}
              color="cyan"
              leftSection={<IconPlayerPlay size={16} />}
              size="sm"
              fullWidth
            >
              Run comparison
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              queued and eager, {repeats}x each &middot; {2 * repeats} runs
            </Text>

            {/* Write mode only selects which mode a *single* run uses — the
                comparison always runs both — so it lives with the single-run
                button instead of up with the shared config. */}
            <UnstyledButton onClick={toggleSingle} py={4}>
              <Group gap={6} justify="center" wrap="nowrap">
                <IconChevronDown
                  size={14}
                  color="var(--mantine-color-dimmed)"
                  style={{
                    transform: singleOpen ? undefined : "rotate(-90deg)",
                    transition: "transform 150ms ease",
                  }}
                />
                <Text size="xs" c="dimmed">
                  Single run
                </Text>
              </Group>
            </UnstyledButton>

            <Collapse expanded={singleOpen}>
              <Stack gap={6}>
                <Stack gap={4}>
                  <Text size="sm" c="white">
                    Write mode
                  </Text>
                  <SegmentedControl
                    fullWidth
                    size="sm"
                    value={config.mode}
                    onChange={(value) =>
                      onChange({ ...config, mode: value as "async" | "eager" })
                    }
                    data={[
                      { value: "async", label: "Queued (async)" },
                      { value: "eager", label: "Eager" },
                    ]}
                    color={config.mode === "async" ? "blue" : "orange"}
                  />
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        marginTop: 5,
                        flexShrink: 0,
                        background: MODE_COLOR[config.mode],
                      }}
                    />
                    <Text size="xs" c="dimmed">
                      {config.mode === "async"
                        ? "Writes append to a queue; a worker applies them."
                        : "Writes mutate the B-tree synchronously."}
                    </Text>
                  </Group>
                </Stack>
                <Button
                  onClick={onStartSingle}
                  disabled={isStarting}
                  variant="light"
                  color={config.mode === "async" ? "blue" : "orange"}
                  size="xs"
                  fullWidth
                >
                  Run one {config.mode === "async" ? "queued" : "eager"} run
                </Button>
              </Stack>
            </Collapse>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function toNumber(value: string | number, fallback: number): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
