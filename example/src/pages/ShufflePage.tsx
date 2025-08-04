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
  ThemeIcon,
  Code,
  Paper,
  Grid,
  Divider,
} from "@mantine/core";
import {
  IconArrowsShuffle,
  IconMusic,
  IconRocket,
  IconDatabase,
  IconChartBar,
  IconBolt,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";
import { useStableQuery, useRicherStableQuery } from "../utils/useStableQuery";

export function ShufflePage() {
  const onApiError = useApiErrorHandler();

  const [title, setTitle] = useState("");
  const [seed, setSeed] = useState("music");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);
  const [cacheBuster, setCacheBuster] = useState(0);

  // Get total music count for live stats
  const totalMusic = useQuery(api.shuffle.getTotalMusicCount);

  const randomMusic = useQuery(api.shuffle.getRandomMusicTitle, {
    cacheBuster,
  });

  const { data: shuffledMusicResult, isLoading } = useRicherStableQuery(
    api.shuffle.shufflePaginated,
    {
      offset: (currentPage - 1) * pageSize,
      numItems: pageSize,
      seed,
    }
  );

  const addMusic = useMutation(api.shuffle.addMusic);

  return (
    <Stack gap="xl">
      {/* Header */}
      <Group justify="center" gap="md">
        <IconArrowsShuffle size={32} color="white" />
        <Title order={1} ta="center" c="white">
          Random Access & Shuffle Demo
        </Title>
        <Badge
          size="lg"
          variant="gradient"
          gradient={{ from: "purple", to: "pink" }}
        >
          O(log n) Random Access
        </Badge>
      </Group>

      <Text c="gray.3" ta="center" size="lg">
        Efficient random selection and deterministic shuffling using Convex
        Aggregate
      </Text>

      {/* Quick explanation */}
      <Card bg="dark.7" p="md">
        <Group justify="center" gap="xl">
          <Group gap="xs">
            <ThemeIcon color="red" variant="light" size="sm">
              <IconBolt size={14} />
            </ThemeIcon>
            <Text size="sm" c="gray.3">
              Traditional:{" "}
              <Badge color="red" size="xs">
                O(n)
              </Badge>{" "}
              - Scan all items for random access
            </Text>
          </Group>
          <Group gap="xs">
            <ThemeIcon color="green" variant="light" size="sm">
              <IconRocket size={14} />
            </ThemeIcon>
            <Text size="sm" c="gray.3">
              Aggregate:{" "}
              <Badge color="green" size="xs">
                O(log n)
              </Badge>{" "}
              - Jump directly to any random position
            </Text>
          </Group>
        </Group>
      </Card>

      <Grid>
        {/* Left Column - Music Demo */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            {/* Live Stats */}
            <Card bg="dark.7" p="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <ThemeIcon color="blue" variant="light" size="sm">
                    <IconChartBar size={14} />
                  </ThemeIcon>
                  <Text size="sm" c="gray.3">
                    Total songs in library:{" "}
                    <Badge variant="light">{totalMusic ?? 0}</Badge>
                  </Text>
                </Group>
                <Group gap="xs">
                  <ThemeIcon color="purple" variant="light" size="sm">
                    <IconBolt size={14} />
                  </ThemeIcon>
                  <Text size="sm" c="gray.3">
                    Random access: <Badge variant="light">O(log n)</Badge>
                  </Text>
                </Group>
              </Group>
            </Card>

            {/* Random Selection */}
            <Card bg="dark.7" p="xl">
              <Stack gap="md">
                <Group>
                  <IconRefresh size={24} color="white" />
                  <Title order={3} c="white">
                    Random Song Picker
                  </Title>
                </Group>
                <Text size="sm" c="gray.3">
                  Get any random song in O(log n) time - no matter how many
                  songs you have!
                </Text>

                <Group gap="md" align="end">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Text size="sm" c="gray.4">
                      Current Random Song
                    </Text>
                    <Badge size="xl" color="purple" variant="light">
                      {randomMusic ?? "Loading..."}
                    </Badge>
                  </Stack>
                  <Button
                    onClick={() => setCacheBuster((prev) => prev + 1)}
                    variant="outline"
                    leftSection={<IconRefresh size={16} />}
                  >
                    Get New Random
                  </Button>
                </Group>
              </Stack>
            </Card>

            {/* Shuffled Playlist */}
            <Card bg="dark.7" p="xl">
              <Stack gap="md">
                <Group>
                  <IconArrowsShuffle size={24} color="white" />
                  <Title order={3} c="white">
                    Deterministic Shuffle
                  </Title>
                </Group>
                <Text size="sm" c="gray.3">
                  Same seed = same shuffle order. Change the seed for a
                  completely different shuffle!
                </Text>

                <Group gap="md">
                  <TextInput
                    label="Shuffle Seed"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="Enter seed for shuffle"
                    style={{ flex: 1 }}
                    size="sm"
                  />
                  <Button
                    onClick={() => setCurrentPage(1)}
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
                        Shuffled playlist ({shuffledMusicResult.totalCount}{" "}
                        songs)
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
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={!shuffledMusicResult.hasPrevPage || isLoading}
                        loading={isLoading}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <Button
                        onClick={() => setCurrentPage(currentPage + 1)}
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
                  <Alert
                    color="blue"
                    title="No music yet"
                    icon={<IconInfoCircle />}
                  >
                    Add some music to see the shuffled playlist!
                  </Alert>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        {/* Right Column - Add Music */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            <Card bg="dark.7" p="md">
              <Stack gap="md">
                <Group>
                  <IconMusic size={20} color="white" />
                  <Title order={3} c="white">
                    Add Music
                  </Title>
                </Group>
                <Text size="sm" c="gray.3">
                  Watch the count update instantly! ⚡
                </Text>

                <TextInput
                  label="Song Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Bohemian Rhapsody - Queen"
                  size="sm"
                />
                <Button
                  onClick={() => {
                    if (!title) return;
                    addMusic({ title })
                      .then(() => {
                        setTitle("");
                      })
                      .catch(onApiError);
                  }}
                  disabled={!title}
                  size="sm"
                  fullWidth
                >
                  Add Song
                </Button>

                <Alert color="blue" title="Try This!" icon={<IconInfoCircle />}>
                  <Text size="sm">
                    Add songs and watch the random picker and shuffle work
                    instantly! The aggregate maintains perfect performance even
                    with thousands of songs.
                  </Text>
                </Alert>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Full-Width Technical Explanation */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Group justify="center">
            <IconRocket size={32} color="white" />
            <Title order={2} c="white">
              🎲 The Magic: O(log n) Random Access
            </Title>
          </Group>

          <Paper bg="dark.6" p="md">
            <Text c="gray.3" mb="md">
              <strong>Traditional random access (slow):</strong> To get a random
              song from position 5000, scan through 5000 items to reach that
              position. <Badge color="red">O(n)</Badge>
            </Text>
            <Code block c="red.3">
              {`// Naive random access - gets slower as data grows
const allSongs = await db.query("music").collect();
const randomIndex = Math.floor(Math.random() * allSongs.length);
return allSongs[randomIndex];  // ⚠️ Must load ALL songs into memory`}
            </Code>
          </Paper>

          <Paper bg="dark.6" p="md">
            <Text c="gray.3" mb="md">
              <strong>Aggregate random access (fast):</strong> Jump directly to
              any position in logarithmic time using the aggregate's internal
              B-tree structure! <Badge color="green">O(log n)</Badge>
            </Text>
            <Code block c="green.3">
              {`// Aggregate random access - always fast!
const randomMusic = await randomize.random(ctx);  // ✅ Direct O(log n) access
const doc = await ctx.db.get(randomMusic.id);
return doc.title;

// Or get item at specific position:
const itemAtIndex = await randomize.at(ctx, 5000);  // ✅ O(log n) lookup`}
            </Code>
          </Paper>

          <Alert color="cyan" title="Key Benefits" icon={<IconBolt />}>
            <List>
              <List.Item>
                <strong>Random Access:</strong> Get any item by index in O(log
                n) time
              </List.Item>
              <List.Item>
                <strong>Deterministic Shuffles:</strong> Same seed = same
                shuffle order every time
              </List.Item>
              <List.Item>
                <strong>Scalable:</strong> Performance stays consistent with
                millions of items
              </List.Item>
              <List.Item>
                <strong>Memory Efficient:</strong> No need to load entire
                dataset for random access
              </List.Item>
            </List>
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );
}
