import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Card,
  Stack,
  Group,
  NumberInput,
  Button,
  Alert,
  SimpleGrid,
} from "@mantine/core";
import { IconChartPie } from "@tabler/icons-react";
import { useState } from "react";
import { StatsGrid } from "../../common/StatsGrid";
import { CommonAppShell } from "@/common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";

export function StatsPage() {
  const [latency, setLatency] = useState<number | "">("");

  const stats = useQuery(api.stats.getStats);

  const reportLatency = useMutation(api.stats.reportLatency);

  return (
    <CommonAppShell>
      <Stack gap="xl">
        <PageHeader
          title="Stats Demo"
          description="Direct aggregation without table dependencies - perfect for analytics and metrics"
          icon={<IconChartPie size={32} color="yellow" />}
          filename="stats.ts"
        />

        {/* Add Latency Section */}
        <Card bg="dark.7" p="xl">
          <Stack gap="md">
            <Title order={2} c="white">
              Report Latency
            </Title>
            <Group gap="md">
              <NumberInput
                label="Latency (ms)"
                value={latency}
                onChange={(value) =>
                  setLatency(
                    value === "" ? "" : typeof value === "number" ? value : ""
                  )
                }
                placeholder="Enter latency value"
                min={0}
                style={{ flex: 1 }}
              />
              <Button
                onClick={() => {
                  if (latency !== "") {
                    reportLatency({ latency: latency })
                      .then(() => {
                        setLatency("");
                      })
                      .catch(console.error);
                  }
                }}
                disabled={latency === ""}
                style={{ alignSelf: "end" }}
              >
                Report Latency
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Statistics Display */}
        <Card bg="dark.7" p="xl">
          <Stack gap="md">
            <Title order={2} c="white">
              Latency Statistics
            </Title>

            {stats ? (
              <StatsGrid stats={stats} size="large" />
            ) : (
              <Alert color="blue" title="No stats yet">
                Report some latency values to see the statistics!
              </Alert>
            )}
          </Stack>
        </Card>
      </Stack>
    </CommonAppShell>
  );
}
