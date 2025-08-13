import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Button,
  List,
  Badge,
  Alert,
} from "@mantine/core";
import { IconArrowsShuffle, IconInfoCircle } from "@tabler/icons-react";

interface ShuffledMusicResult {
  items: string[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

interface ShufflePlaylistProps {
  seed: string;
  onSeedChange: (seed: string) => void;
  currentPage: number;
  pageSize: number;
  shuffledMusicResult: ShuffledMusicResult | undefined;
  isLoading: boolean;
  onNewShuffle: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function ShufflePlaylist({
  seed,
  onSeedChange,
  currentPage,
  pageSize,
  shuffledMusicResult,
  isLoading,
  onNewShuffle,
  onPreviousPage,
  onNextPage,
}: ShufflePlaylistProps) {
  return (
    <Card bg="dark.7" p="xl">
      <Stack gap="md">
        <Group>
          <IconArrowsShuffle size={24} color="white" />
          <Title order={3} c="white">
            Deterministic Shuffle
          </Title>
        </Group>
        <Text size="sm" c="gray.3">
          Same seed = same shuffle order. Change the seed for a completely
          different shuffle!
        </Text>

        <Group gap="md">
          <TextInput
            label="Shuffle Seed"
            value={seed}
            onChange={(e) => onSeedChange(e.target.value)}
            placeholder="Enter seed for shuffle"
            style={{ flex: 1 }}
            size="sm"
          />
          <Button
            onClick={onNewShuffle}
            variant="outline"
            size="sm"
            style={{ alignSelf: "end" }}
          >
            New Shuffle
          </Button>
        </Group>

        {shuffledMusicResult && shuffledMusicResult.items.length > 0 ? (
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text c="gray.6" size="sm">
                Shuffled playlist ({shuffledMusicResult.totalCount} songs)
              </Text>
              <Text c="gray.6" size="sm">
                Page {shuffledMusicResult.currentPage} of{" "}
                {shuffledMusicResult.totalPages}
              </Text>
            </Group>

            <List spacing="xs">
              {shuffledMusicResult.items.map((song, index) => (
                <List.Item key={index} c="white">
                  <Group gap="xs">
                    <Badge size="xs" color="gray" variant="outline">
                      {(currentPage - 1) * pageSize + index + 1}
                    </Badge>
                    {song}
                  </Group>
                </List.Item>
              ))}
            </List>

            <Group justify="center">
              <Button
                onClick={onPreviousPage}
                disabled={!shuffledMusicResult.hasPrevPage || isLoading}
                loading={isLoading}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <Button
                onClick={onNextPage}
                disabled={!shuffledMusicResult.hasNextPage || isLoading}
                loading={isLoading}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </Group>
          </Stack>
        ) : (
          <Alert color="blue" title="No music yet" icon={<IconInfoCircle />}>
            Add some music to see the shuffled playlist!
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
