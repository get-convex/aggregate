import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
  Anchor,
  ActionIcon,
  Modal,
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
  IconCode,
} from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";
import {
  useStableQuery,
  useRicherStableQuery,
} from "../../utils/useStableQuery";
import { CommonAppShell } from "@/common/CommonAppShell";

export function ShufflePage() {
  const onApiError = useApiErrorHandler();

  const [title, setTitle] = useState("");
  const [seed, setSeed] = useState("music");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);
  const [cacheBuster, setCacheBuster] = useState(0);
  const [codeModalOpened, setCodeModalOpened] = useState(false);

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
    <CommonAppShell>
      <Stack gap="xl">
        {/* Header */}
        <Group justify="center" gap="md">
          <IconArrowsShuffle size={32} color="white" />
          <Title order={1} ta="center" c="white">
            Random Access & Shuffle Demo
          </Title>
        </Group>

        <Text c="gray.3" ta="center" size="lg">
          Efficient random selection and deterministic shuffling using Convex
          Aggregate
        </Text>

        <Group justify="center">
          <Card bg="dark.6" p="md">
            <Group gap="md">
              <IconCode size={20} color="cyan" />
              <Text size="sm" c="gray.3">
                View the source:
              </Text>
              <Anchor
                href="https://github.com/get-convex/aggregate/blob/main/example/convex/shuffle.ts"
                target="_blank"
                c="cyan"
                size="sm"
              >
                convex/shuffle.ts
              </Anchor>
            </Group>
          </Card>
        </Group>

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
                      onClick={() => setCodeModalOpened(true)}
                    >
                      <IconCode size={18} />
                    </ActionIcon>
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

                  {shuffledMusicResult &&
                  shuffledMusicResult.items.length > 0 ? (
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
                          disabled={
                            !shuffledMusicResult.hasPrevPage || isLoading
                          }
                          loading={isLoading}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <Button
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={
                            !shuffledMusicResult.hasNextPage || isLoading
                          }
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

                  <Alert
                    color="blue"
                    title="Try This!"
                    icon={<IconInfoCircle />}
                  >
                    <Text size="sm">
                      Add songs and watch the random picker and shuffle work
                      instantly! The aggregate maintains perfect performance
                      even with thousands of songs.
                    </Text>
                  </Alert>
                </Stack>
              </Card>
            </Stack>
          </Grid.Col>
        </Grid>

        {/* Code Modal */}
        <Modal
          opened={codeModalOpened}
          onClose={() => setCodeModalOpened(false)}
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
      </Stack>
    </CommonAppShell>
  );
}
