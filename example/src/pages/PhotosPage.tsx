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
  Image,
  Pagination,
  Alert,
  SimpleGrid,
  Badge,
  Select,
  Code,
  Paper,
  List,
  ThemeIcon,
  Divider,
  Grid,
} from "@mantine/core";
import {
  IconPhoto,
  IconRocket,
  IconDatabase,
  IconChartBar,
  IconBolt,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function PhotosPage() {
  const onApiError = useApiErrorHandler();

  const [selectedAlbum, setSelectedAlbum] = useState("Nature");
  const [newAlbum, setNewAlbum] = useState("");
  const [url, setUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(6);

  // Get available albums with counts
  const albums = useQuery(api.photos.availableAlbums);

  // Get photos for current page
  const photos = useQuery(api.photos.pageOfPhotos, {
    album: selectedAlbum,
    offset: (currentPage - 1) * pageSize,
    numItems: pageSize,
  });

  // Get total count for pagination
  const totalPhotos = useQuery(api.photos.photoCount, { album: selectedAlbum });

  const addPhoto = useMutation(api.photos.addPhoto);

  // Reset to page 1 when album changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAlbum]);

  const totalPages = totalPhotos ? Math.ceil(totalPhotos / pageSize) : 0;

  return (
    <Stack gap="xl">
      {/* Header */}
      <Group justify="center" gap="md">
        <IconPhoto size={32} color="white" />
        <Title order={1} ta="center" c="white">
          Offset-Based Pagination Demo
        </Title>
        <Badge
          size="lg"
          variant="gradient"
          gradient={{ from: "blue", to: "cyan" }}
        >
          O(log n) Performance
        </Badge>
      </Group>

      <Text c="gray.3" ta="center" size="lg">
        Efficient photo gallery pagination using Convex Aggregate component
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
              - Scans all items to skip
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
              - Jumps directly to any page
            </Text>
          </Group>
        </Group>
      </Card>

      <Grid>
        {/* Left Column - Photo Gallery */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            {/* Album Selection & Live Stats */}
            <Card bg="dark.7" p="md">
              <Stack gap="md">
                <Group>
                  <Text fw={500} c="white">
                    Browse Albums:
                  </Text>
                  {albums && (
                    <Select
                      value={selectedAlbum}
                      onChange={(value) => value && setSelectedAlbum(value)}
                      data={albums.map((album) => ({
                        value: album.name,
                        label: `${album.name} (${album.count} photos)`,
                      }))}
                      style={{ minWidth: 200 }}
                    />
                  )}
                </Group>

                {totalPhotos !== undefined && (
                  <Group gap="xl">
                    <Group gap="xs">
                      <ThemeIcon color="blue" variant="light" size="sm">
                        <IconChartBar size={14} />
                      </ThemeIcon>
                      <Text size="sm" c="gray.3">
                        Total photos in {selectedAlbum}:{" "}
                        <Badge variant="light">{totalPhotos}</Badge>
                      </Text>
                    </Group>
                    <Group gap="xs">
                      <ThemeIcon color="green" variant="light" size="sm">
                        <IconBolt size={14} />
                      </ThemeIcon>
                      <Text size="sm" c="gray.3">
                        Page {currentPage} of {totalPages}{" "}
                        <Badge variant="light">O(log n)</Badge>
                      </Text>
                    </Group>
                  </Group>
                )}
              </Stack>
            </Card>

            {/* Photo Gallery */}
            <Card bg="dark.7" p="xl">
              <Title order={3} c="white" mb="md">
                Photo Gallery
              </Title>
              {photos && photos.length > 0 ? (
                <Stack gap="md">
                  <SimpleGrid
                    cols={{ base: 1, xs: 2, sm: 3, lg: 4 }}
                    spacing="md"
                  >
                    {photos.map((photoUrl, index) => (
                      <Card key={index} bg="dark.6" p="sm">
                        <Image
                          src={photoUrl}
                          alt={`Photo ${(currentPage - 1) * pageSize + index + 1}`}
                          fallbackSrc="https://placehold.co/200x200/666666/FFFFFF?text=Photo"
                          style={{
                            width: "100%",
                            height: 120,
                            objectFit: "cover",
                          }}
                        />
                        <Text size="xs" c="gray.4" mt="xs" ta="center">
                          #{(currentPage - 1) * pageSize + index + 1}
                        </Text>
                      </Card>
                    ))}
                  </SimpleGrid>

                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        total={totalPages}
                        value={currentPage}
                        onChange={setCurrentPage}
                        color="blue"
                        size="md"
                      />
                    </Group>
                  )}
                </Stack>
              ) : (
                <Alert
                  color="blue"
                  title="No photos in this album"
                  icon={<IconInfoCircle />}
                >
                  Switch to a different album or add some photos to get started!
                </Alert>
              )}
            </Card>
          </Stack>
        </Grid.Col>

        {/* Right Column - Add Photos */}
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="md">
            {/* Add Photos - Watch it update live! */}
            <Card bg="dark.7" p="md">
              <Stack gap="md">
                <Group>
                  <IconDatabase size={20} color="white" />
                  <Title order={3} c="white">
                    Add Photos
                  </Title>
                </Group>
                <Text size="sm" c="gray.3">
                  Watch counts update instantly! ⚡
                </Text>

                <TextInput
                  label="Album Name"
                  value={newAlbum}
                  onChange={(e) => setNewAlbum(e.target.value)}
                  placeholder="e.g., Nature, Cities, People"
                  size="sm"
                />
                <TextInput
                  label="Photo URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  size="sm"
                />
                <Button
                  onClick={() => {
                    if (!newAlbum || !url) return;
                    addPhoto({ album: newAlbum, url })
                      .then(() => {
                        setNewAlbum("");
                        setUrl("");
                        // Switch to the album we just added to
                        setSelectedAlbum(newAlbum);
                      })
                      .catch(onApiError);
                  }}
                  disabled={!newAlbum || !url}
                  size="sm"
                  fullWidth
                >
                  Add Photo
                </Button>

                <Alert color="blue" title="Try This!" icon={<IconInfoCircle />}>
                  <Text size="sm">
                    Add a photo to an existing album and watch the count update
                    instantly! The aggregate component automatically maintains
                    all the metadata needed for fast pagination.
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
              🚀 The Magic: O(log n) Offset-Based Pagination
            </Title>
          </Group>

          <Paper bg="dark.6" p="md">
            <Text c="gray.3" mb="md">
              <strong>Traditional approach (slow):</strong> To show page 50 of
              photos, scan through 2,500 photos to skip the first 49 pages.{" "}
              <Badge color="red">O(n)</Badge>
            </Text>
            <Code block c="red.3">
              {`// Naive pagination - gets slower as data grows
const photos = await db.query("photos")
  .skip(page * pageSize)  // ⚠️ Scans through all skipped items
  .take(pageSize);`}
            </Code>
          </Paper>

          <Paper bg="dark.6" p="md">
            <Text c="gray.3" mb="md">
              <strong>Aggregate approach (fast):</strong> Jump directly to any
              page in logarithmic time, no matter how much data you have!{" "}
              <Badge color="green">O(log n)</Badge>
            </Text>
            <Code block c="green.3">
              {`// Aggregate pagination - always fast!
const { key: firstPhotoCreationTime } = await photos.at(ctx, offset, {
  namespace: album,
});
const photoDocs = await ctx.db
  .query("photos")
  .withIndex("by_album_creation_time", (q) =>
    q.eq("album", album).gte("_creationTime", firstPhotoCreationTime)
  )
  .take(numItems);
return photoDocs.map((doc) => doc.url);`}
            </Code>
          </Paper>

          <Alert color="cyan" title="Key Benefits" icon={<IconBolt />}>
            <List>
              <List.Item>
                <strong>Namespacing:</strong> Each album is isolated - no
                interference between albums
              </List.Item>
              <List.Item>
                <strong>Reactive:</strong> UI updates automatically when photos
                are added/removed
              </List.Item>
              <List.Item>
                <strong>Scalable:</strong> Performance stays consistent with
                millions of photos
              </List.Item>
              <List.Item>
                <strong>Transactional:</strong> Never see inconsistent data
                during updates
              </List.Item>
            </List>
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );
}
