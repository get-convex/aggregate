import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, Stack, Title, Group, NumberInput, Button } from "@mantine/core";
import { useState } from "react";

export function ReportLatencySection() {
  const [latency, setLatency] = useState<number | "">("");

  const reportLatency = useMutation(api.stats.reportLatency);

  const handleReportLatency = () => {
    if (latency !== "") {
      reportLatency({ latency: latency })
        .then(() => {
          setLatency("");
        })
        .catch(console.error);
    }
  };

  return (
    <Card bg="dark.7" p="md">
      <Stack gap="md">
        <Title order={2} c="white">
          Report Latency
        </Title>
        <Stack gap="sm">
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
            size="sm"
          />
          <Button
            onClick={handleReportLatency}
            disabled={latency === ""}
            size="sm"
            fullWidth
          >
            Report Latency
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
