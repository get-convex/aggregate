import { Stack } from "@mantine/core";
import { AddScoreSection } from "./AddScoreSection";
import { StatisticsSection } from "./StatisticsSection";

export function LeaderboardAside() {
  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem", // Ensure some space at bottom when scrolling
      }}
    >
      <AddScoreSection />
      <StatisticsSection />
    </Stack>
  );
}
