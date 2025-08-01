import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  TextInput,
  Button,
  Badge,
  Alert,
  List,
} from "@mantine/core";
import { IconArrowsShuffle, IconMusic } from "@tabler/icons-react";
import { useState } from "react";

export function ShufflePage() {
  const [title, setTitle] = useState("");
  const [seed, setSeed] = useState("music");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);

  const randomMusic = useQuery(api.shuffle.getRandomMusicTitle, {
    cacheBuster: Date.now(),
  });
  const shuffledMusic = useQuery(api.shuffle.shufflePaginated, {
    offset: (currentPage - 1) * pageSize,
    numItems: pageSize,
    seed,
  });

  const addMusic = useMutation(api.shuffle.addMusic);

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconArrowsShuffle size={32} color="white" />
        <Title order={1} ta="center" c="white">
          Shuffle Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center">
        Random selection and shuffled music playlists with O(log(n)) random
        access
      </Text>

      {/* Add Music Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Group gap="sm">
            <IconMusic size={24} color="white" />
            <Title order={2} c="white">
              Add New Music
            </Title>
          </Group>
          <Group gap="md">
            <TextInput
              label="Song Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter song title"
              style={{ flex: 1 }}
            />
            <Button
              onClick={() => {
                if (title) {
                  addMusic({ title })
                    .then(() => {
                      setTitle("");
                    })
                    .catch(console.error);
                }
              }}
              disabled={!title}
              style={{ alignSelf: "end" }}
            >
              Add Music
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Random Selection Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Random Selection
          </Title>
          <Group gap="md" align="end">
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text size="sm" c="gray.4">
                Current Random Song
              </Text>
              <Badge size="xl" color="purple" variant="light">
                {randomMusic ?? "Loading..."}
              </Badge>
            </Stack>
            <Button onClick={() => window.location.reload()} variant="outline">
              Get New Random
            </Button>
          </Group>
        </Stack>
      </Card>

      {/* Shuffled Playlist Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Shuffled Playlist
          </Title>

          <Group gap="md">
            <TextInput
              label="Seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="Enter seed for shuffle"
              style={{ flex: 1 }}
            />
            <Button onClick={() => setCurrentPage(1)} variant="outline">
              New Shuffle
            </Button>
          </Group>

          {shuffledMusic && shuffledMusic.length > 0 ? (
            <Stack gap="md">
              <List spacing="xs">
                {shuffledMusic.map((song, index) => (
                  <List.Item key={index} c="white">
                    {song}
                  </List.Item>
                ))}
              </List>

              <Group justify="center">
                <Button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  variant="outline"
                >
                  Previous
                </Button>
                <Text c="white">Page {currentPage}</Text>
                <Button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={shuffledMusic.length < pageSize}
                  variant="outline"
                >
                  Next
                </Button>
              </Group>
            </Stack>
          ) : (
            <Alert color="blue" title="No music yet">
              Add some music to see the shuffled playlist!
            </Alert>
          )}
        </Stack>
      </Card>

      {/* Info Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            How It Works
          </Title>
          <Text c="gray.3">
            This demo uses Convex Aggregate with a null sort key to enable
            efficient random access to any item in the collection. The aggregate
            maintains the order of documents by their internal IDs, which are
            effectively random.
          </Text>
          <Text c="gray.3">
            Random selection uses the aggregate's random() method to pick any
            item in O(log(n)) time. The shuffled playlist uses a seeded random
            number generator to create a deterministic shuffle that can be
            paginated through.
          </Text>
          <Text c="gray.3">
            Changing the seed creates a completely different shuffle order,
            while keeping the same seed ensures consistent pagination through
            the shuffled list.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
