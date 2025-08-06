import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  Badge,
  Button,
  ActionIcon,
} from "@mantine/core";
import { IconRefresh, IconCode } from "@tabler/icons-react";

interface RandomSongPickerProps {
  randomMusic: string | null | undefined;
  onRefresh: () => void;
  onShowCode: () => void;
}

export function RandomSongPicker({
  randomMusic,
  onRefresh,
  onShowCode,
}: RandomSongPickerProps) {
  return (
    <Card bg="dark.7" p="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Group>
            <IconRefresh size={24} color="white" />
            <Title order={3} c="white">
              Random Song Picker
            </Title>
          </Group>
          <ActionIcon
            variant="outline"
            color="gray"
            size="lg"
            onClick={onShowCode}
          >
            <IconCode size={18} />
          </ActionIcon>
        </Group>
        <Text size="sm" c="gray.3">
          Get any random song in O(log n) time - no matter how many songs you
          have!
        </Text>

        <Group gap="md" align="end">
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="sm" c="gray.4">
              Current Random Song
            </Text>
            <Badge size="xl" color="purple" variant="light">
              {randomMusic || "Loading..."}
            </Badge>
          </Stack>
          <Button
            onClick={onRefresh}
            variant="outline"
            leftSection={<IconRefresh size={16} />}
          >
            Get New Random
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
