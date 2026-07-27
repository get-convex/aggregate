import { Stack } from "@mantine/core";
import { RunConfigSection, type RunConfigSectionProps } from "./RunConfigSection";

export function BenchAside(props: RunConfigSectionProps) {
  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem",
      }}
    >
      <RunConfigSection {...props} />
    </Stack>
  );
}
