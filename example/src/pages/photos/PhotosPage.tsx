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
  Image,
  Pagination,
  Alert,
  SimpleGrid,
  Badge,
  Select,
  ThemeIcon,
  Grid,
  Anchor,
  ActionIcon,
  Loader,
} from "@mantine/core";
import {
  IconPhoto,
  IconRocket,
  IconDatabase,
  IconChartBar,
  IconBolt,
  IconInfoCircle,
  IconCode,
  IconDice,
  IconEdit,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useApiErrorHandler } from "@/utils/errors";
import { CommonAppShell } from "@/common/CommonAppShell";
import { useRicherStableQuery } from "../../utils/useStableQuery";

export function PhotosPage() {
  const onApiError = useApiErrorHandler();

  const [selectedAlbum, setSelectedAlbum] = useState("Nature");
  const [newAlbum, setNewAlbum] = useState("");
  const [url, setUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(6);
  const [isRandomMode, setIsRandomMode] = useState(true);

  // Get available albums with counts
  const albums = useQuery(api.photos.availableAlbums);

  // Get photos for current page
  const { data: photos, isLoading } = useRicherStableQuery(
    api.photos.pageOfPhotos,
    {
      album: selectedAlbum,
      offset: (currentPage - 1) * pageSize,
      numItems: pageSize,
    }
  );

  // Get total count for pagination
  const totalPhotos = useQuery(api.photos.photoCount, { album: selectedAlbum });

  const addPhoto = useMutation(api.photos.addPhoto);

  // Reset to page 1 when album changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAlbum]);

  const totalPages = totalPhotos ? Math.ceil(totalPhotos / pageSize) : 0;

  // Array of known valid Unsplash photo URLs
  const validPhotoUrls = [
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
    "https://images.unsplash.com/photo-1449824913935-59a10b8d2000",
    "https://images.unsplash.com/photo-1444723121867-7a241cacace9",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e",
    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e",
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
    "https://images.unsplash.com/photo-1426604966848-d7adac402bff",
    "https://images.unsplash.com/photo-1501594907352-04cda38ebc29",
    "https://images.unsplash.com/photo-1493246507139-91e8fad9978e",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
    "https://images.unsplash.com/photo-1519904981063-b0cf448d479e",
    "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5",
    "https://images.unsplash.com/photo-1418065460487-3956ef138493",
    "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05",
    "https://images.unsplash.com/photo-1551698618-1dfe5d97d256",
    "https://images.unsplash.com/photo-1477346611705-65d1883cee1e",
    "https://images.unsplash.com/photo-1540206395-68808572332f",
  ];

  // Function to pick a random photo from the valid URLs array
  const generateRandomPhotoUrl = () => {
    const randomIndex = Math.floor(Math.random() * validPhotoUrls.length);
    return validPhotoUrls[randomIndex];
  };

  return (
    <CommonAppShell>
      <Stack gap="xl">
        {/* Header */}
        <Group justify="center" gap="md">
          <IconPhoto size={32} color="white" />
          <Title order={1} ta="center" c="white">
            Offset-Based Pagination Demo
          </Title>
        </Group>

        <Text c="gray.3" ta="center" size="lg">
          Efficient photo gallery pagination using Convex Aggregate component
        </Text>

        <Group justify="center">
          <Card bg="dark.6" p="md">
            <Group gap="md">
              <IconCode size={20} color="cyan" />
              <Text size="sm" c="gray.3">
                View the source:
              </Text>
              <Anchor
                href="https://github.com/get-convex/aggregate/blob/main/example/convex/photos.ts"
                target="_blank"
                c="cyan"
                size="sm"
              >
                convex/photos.ts
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
                <Group align="center">
                  <Title order={3} c="white" mb="md">
                    Photo Gallery
                  </Title>
                  {isLoading && <Loader size="sm" />}
                </Group>

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
                    Switch to a different album or add some photos to get
                    started!
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
                    placeholder={
                      isRandomMode
                        ? "Random photo will be generated"
                        : "https://images.unsplash.com/..."
                    }
                    disabled={isRandomMode}
                    size="sm"
                    rightSection={
                      <ActionIcon
                        variant="subtle"
                        color={isRandomMode ? "cyan" : "gray"}
                        onClick={() => setIsRandomMode(!isRandomMode)}
                        title={
                          isRandomMode
                            ? "Switch to manual URL input"
                            : "Switch to random photo"
                        }
                      >
                        {isRandomMode ? (
                          <IconDice size={16} />
                        ) : (
                          <IconEdit size={16} />
                        )}
                      </ActionIcon>
                    }
                    rightSectionPointerEvents="all"
                  />
                  <Button
                    onClick={() => {
                      if (!newAlbum) return;

                      const photoUrl = isRandomMode
                        ? generateRandomPhotoUrl()
                        : url;
                      if (!photoUrl) return;

                      addPhoto({ album: newAlbum, url: photoUrl })
                        .then(() => {
                          if (!isRandomMode) setUrl("");
                          // Switch to the album we just added to
                          setSelectedAlbum(newAlbum);
                        })
                        .catch(onApiError);
                    }}
                    disabled={!newAlbum || (!isRandomMode && !url)}
                    size="sm"
                    fullWidth
                  >
                    {isRandomMode ? "Add Random Photo" : "Add Photo"}
                  </Button>

                  <Alert
                    color="blue"
                    title="Try This!"
                    icon={<IconInfoCircle />}
                  >
                    <Text size="sm">
                      Add a photo to an existing album and watch the count
                      update instantly! The aggregate component automatically
                      maintains all the metadata needed for fast pagination.
                    </Text>
                  </Alert>
                </Stack>
              </Card>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </CommonAppShell>
  );
}
