import {
  Button,
  Card,
  Group,
  NumberInput,
  Progress,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { MODE_COLOR } from "./charts/chartTheme";
import { formatSeconds } from "./charts/scale";
import {
  MAX_BURSTS,
  MAX_FAN_OUT,
  MAX_SHARDS,
  MAX_TOTAL_OPS,
  MIN_BURST_INTERVAL_MS,
} from "../../../convex/utils/benchMath";
import {
  MAX_REPEATS,
  modeLabel,
  phaseLabel,
  timeToConsistencyMs,
  scenarioMeta,
  SCENARIOS,
  suiteLabel,
  suiteProgress,
  type BenchRun,
  type BenchScenario,
  type BenchSuite,
} from "./benchTypes";
import type { Id } from "../../../convex/_generated/dataModel";

const inputStyles = {
  label: { color: "white" },
  input: { backgroundColor: "var(--mantine-color-dark-4)" },
} as const;

export type BenchControlsProps = {
  config: BenchRun["config"];
  onChange: (config: BenchRun["config"]) => void;
  repeats: number;
  onRepeatsChange: (repeats: number) => void;
  onRun: () => void;
  onStop: () => void;
  isStarting: boolean;
  /** The run in flight, if any. Progress is shown here rather than elsewhere. */
  activeRun: BenchRun | null;
  activeSuite: BenchSuite | null;
  /** Past comparisons, newest first, named by the parameters that produced them. */
  suites: BenchSuite[];
  selectedSuiteId: Id<"benchSuites"> | null;
  onSelectSuite: (suiteId: Id<"benchSuites">) => void;
  /** Non-zero means a new comparison will be refused until the worker drains. */
  pendingOps: number;
};

/**
 * Everything you can change, and everything happening right now, in one strip.
 *
 * There is no separate monitor: a comparison takes a handful of seconds, so its
 * progress belongs beside the button that started it rather than behind a tab
 * you have to go and find. When nothing is running the strip is just the
 * parameters and a picker for past results.
 */
export function BenchControls({
  config,
  onChange,
  repeats,
  onRepeatsChange,
  onRun,
  onStop,
  isStarting,
  activeRun,
  activeSuite,
  suites,
  selectedSuiteId,
  onSelectSuite,
  pendingOps,
}: BenchControlsProps) {
  const meta = scenarioMeta(config.scenario);
  const busy = activeSuite !== null;

  const setScenario = (scenario: BenchScenario) => {
    const next = scenarioMeta(scenario);
    onChange({
      ...config,
      scenario,
      shards: 1,
      arrivalRatePerSec: undefined,
      bursts: undefined,
      burstIntervalMs: undefined,
      ...next.defaults,
    });
  };

  return (
    <Card bg="dark.7" p="lg" radius="md">
      <Stack gap="md">
        <Group gap="lg" align="flex-start" wrap="wrap">
          <Stack gap={2} w={230}>
            <Select
              label="Scenario"
              data={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
              value={config.scenario}
              onChange={(value) => value && setScenario(value as BenchScenario)}
              allowDeselect={false}
              size="sm"
              styles={inputStyles}
            />
            <Text size="xs" c="dimmed" lh={1.4}>
              {meta.description}
            </Text>
          </Stack>

          <Param
            label="Total operations"
            value={config.totalOps}
            min={10}
            max={MAX_TOTAL_OPS}
            step={100}
            onChange={(totalOps) => onChange({ ...config, totalOps })}
          />
          <Param
            label="Fan-out"
            value={config.fanOut}
            min={1}
            max={MAX_FAN_OUT}
            onChange={(fanOut) => onChange({ ...config, fanOut })}
          />
          <Param
            label="Ops / txn"
            value={config.opsPerMutation}
            min={1}
            onChange={(opsPerMutation) =>
              onChange({ ...config, opsPerMutation })
            }
          />
          <Param
            label="Repeats"
            value={repeats}
            min={1}
            max={MAX_REPEATS}
            onChange={onRepeatsChange}
          />

          {/* Scenario-specific parameters mount and unmount rather than
              disabling — a control you can't act on is just noise. */}
          {meta.fields.includes("shards") && (
            <Param
              label="Namespaces"
              value={config.shards}
              min={2}
              max={MAX_SHARDS}
              onChange={(shards) => onChange({ ...config, shards })}
            />
          )}
          {meta.fields.includes("arrivalRatePerSec") && (
            <Param
              label="Arrival rate"
              value={config.arrivalRatePerSec ?? 50}
              min={1}
              max={1000}
              onChange={(arrivalRatePerSec) =>
                onChange({ ...config, arrivalRatePerSec })
              }
            />
          )}
          {meta.fields.includes("bursts") && (
            <Param
              label="Bursts"
              value={config.bursts ?? 4}
              min={2}
              max={MAX_BURSTS}
              onChange={(bursts) => onChange({ ...config, bursts })}
            />
          )}
          {meta.fields.includes("burstIntervalMs") && (
            <Param
              label="Burst interval (ms)"
              value={config.burstIntervalMs ?? 4_000}
              min={MIN_BURST_INTERVAL_MS}
              step={500}
              onChange={(burstIntervalMs) =>
                onChange({ ...config, burstIntervalMs })
              }
            />
          )}

          <Stack gap={2} justify="flex-end" style={{ alignSelf: "flex-start" }}>
            <Text size="sm" fw={500} c="white">
              &nbsp;
            </Text>
            {busy ? (
              <Button
                onClick={onStop}
                variant="light"
                color="red"
                leftSection={<IconPlayerStop size={16} />}
                size="sm"
              >
                Stop
              </Button>
            ) : (
              <Button
                onClick={onRun}
                loading={isStarting}
                disabled={isStarting}
                color="cyan"
                leftSection={<IconPlayerPlay size={16} />}
                size="sm"
              >
                Compare
              </Button>
            )}
            <Text size="xs" c="dimmed">
              {2 * repeats} runs
            </Text>
          </Stack>
        </Group>

        {busy ? (
          <LiveStrip activeRun={activeRun} activeSuite={activeSuite} />
        ) : (
          suites.length > 0 && (
            <Select
              label="Results"
              data={suites.map((s) => {
                const { done, total } = suiteProgress(s);
                return {
                  value: s._id,
                  label:
                    done === total
                      ? suiteLabel(s)
                      : `${suiteLabel(s)} — ${done}/${total}`,
                };
              })}
              value={selectedSuiteId}
              onChange={(value) =>
                value && onSelectSuite(value as Id<"benchSuites">)
              }
              allowDeselect={false}
              size="sm"
              maw={560}
              styles={inputStyles}
            />
          )
        )}

        {pendingOps > 0 && !busy && (
          <Text size="xs" c="orange.4">
            {pendingOps} operation(s) still queued — a comparison will be
            refused until the worker drains. An eager write would throw
            PENDING_OPERATIONS, and a queued one would measure this backlog.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/**
 * What's happening, while it happens: which side is running, its phase, the ops
 * it has landed, its elapsed time to consistency, and how far through the suite's
 * schedule it is.
 */
function LiveStrip({
  activeRun,
  activeSuite,
}: {
  activeRun: BenchRun | null;
  activeSuite: BenchSuite;
}) {
  const { done, total } = suiteProgress(activeSuite);
  const totalMs = activeRun ? timeToConsistencyMs(activeRun) : 0;
  const committed = activeRun?.progress.opsCommitted ?? 0;
  const attempted = activeRun?.config.totalOps ?? 0;

  return (
    <Stack gap={6}>
      <Group gap="md" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: activeRun
                ? MODE_COLOR[activeRun.config.mode]
                : "var(--mantine-color-dark-3)",
            }}
          />
          <Text size="sm" c="white">
            {activeRun ? modeLabel(activeRun.config.mode) : "Starting"}
          </Text>
        </Group>
        <Text size="sm" c="gray.5">
          {activeRun ? phaseLabel(activeRun.status) : "…"}
        </Text>
        <Text
          size="sm"
          c="gray.5"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {committed}/{attempted} ops
        </Text>
        <Text
          size="sm"
          c="gray.5"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatSeconds(totalMs)}
        </Text>
        <Text size="sm" c="gray.5" ml="auto">
          run {Math.min(done + 1, total)} of {total}
        </Text>
      </Group>
      <Progress
        value={total === 0 ? 0 : (done / total) * 100}
        color="cyan"
        size="sm"
        radius="xl"
      />
    </Stack>
  );
}

function Param({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  /** Omit where there is no ceiling worth enforcing. */
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Stack gap={2} w={140}>
      <NumberInput
        label={label}
        value={value}
        // `min`/`max` only bound the stepper, so a cleared or half-typed field
        // still fires onChange — with 0 or NaN. Neither belongs in the config.
        onChange={(next) => {
          const parsed =
            typeof next === "number" ? next : Number.parseFloat(next);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        min={min}
        max={max}
        step={step}
        allowDecimal={false}
        size="sm"
        styles={inputStyles}
      />
    </Stack>
  );
}
