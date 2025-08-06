import { Stack } from "@mantine/core";
import { AddMusicSection } from "./AddMusicSection";

export function ShuffleAside() {
  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem", // Ensure some space at bottom when scrolling
      }}
    >
      <AddMusicSection />
    </Stack>
  );
}
