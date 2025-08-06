import { Modal, Stack, Text, Code } from "@mantine/core";

interface CodeModalProps {
  opened: boolean;
  onClose: () => void;
}

export function CodeModal({ opened, onClose }: CodeModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Random Song Picker Implementation"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          This code snippet shows how to get a random song using the Convex
          Aggregate:
        </Text>
        <Code block>
          {`const randomMusic = await randomize.random(ctx);
if (!randomMusic) return null;
const doc = (await ctx.db.get(randomMusic.id))!;
return doc.title;`}
        </Code>
        <Text size="xs" c="dimmed">
          From: <Code>convex/shuffle.ts</Code> -{" "}
          <Code>getRandomMusicTitle</Code> handler
        </Text>
      </Stack>
    </Modal>
  );
}
