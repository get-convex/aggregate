import { Stack } from "@mantine/core";
import { ReportLatencySection } from "./ReportLatencySection";

export function StatsAside() {
  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem", // Ensure some space at bottom when scrolling
      }}
    >
      <ReportLatencySection />
    </Stack>
  );
}
