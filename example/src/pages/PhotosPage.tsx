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
} from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useState } from "react";

export function PhotosPage() {
  const [album, setAlbum] = useState("");
  const [url, setUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);

  // Queries
  const photos = useQuery(api.photos.pageOfPhotos, {
    album: album || "default",
    offset: (currentPage - 1) * pageSize,
    numItems: pageSize,
  });

  // Mutations
  const addPhoto = useMutation(api.photos.addPhoto);

  const handleAddPhoto = () => {
    if (album && url) {
      addPhoto({ album, url })
        .then(() => {
          setAlbum("");
          setUrl("");
        })
        .catch(console.error);
    }
  };

  return (
    <Stack gap="xl">
      <Group justify="center" gap="md">
        <IconPhoto size={32} color="white" />
        <Title order={1} ta="center" c="white">
          Photos Demo
        </Title>
      </Group>

      <Text c="gray.3" ta="center">
        Offset-based pagination for photo galleries with efficient O(log(n))
        lookups
      </Text>

      {/* Add Photo Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Add New Photo
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            <TextInput
              label="Album"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="Enter album name"
            />
            <TextInput
              label="Photo URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter photo URL"
            />
            <Button
              onClick={handleAddPhoto}
              disabled={!album || !url}
              style={{ alignSelf: "end" }}
              fullWidth
            >
              Add Photo
            </Button>
          </SimpleGrid>
        </Stack>
      </Card>

      {/* Photo Gallery Section */}
      <Card bg="dark.7" p="xl">
        <Stack gap="md">
          <Title order={2} c="white">
            Photo Gallery
          </Title>

          {photos && photos.length > 0 ? (
            <Stack gap="md">
              <SimpleGrid
                cols={{ base: 1, xs: 2, sm: 3, md: 4, lg: 5 }}
                spacing="md"
              >
                {photos.map((photoUrl, index) => (
                  <Card key={index} bg="dark.6" p="md">
                    <Image
                      src={photoUrl}
                      alt={`Photo ${index + 1}`}
                      fallbackSrc="https://placehold.co/200x200/666666/FFFFFF?text=Photo"
                      style={{ width: "100%", height: 150, objectFit: "cover" }}
                    />
                    <Text size="sm" c="gray.4" mt="xs">
                      Photo {index + 1}
                    </Text>
                  </Card>
                ))}
              </SimpleGrid>

              <Group justify="center">
                <Pagination
                  total={Math.ceil(
                    (photos.length + (currentPage - 1) * pageSize) / pageSize
                  )}
                  value={currentPage}
                  onChange={setCurrentPage}
                  color="blue"
                />
              </Group>
            </Stack>
          ) : (
            <Alert color="blue" title="No photos yet">
              Add some photos to see the gallery!
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
            This demo uses Convex Aggregate to implement efficient offset-based
            pagination. Instead of scanning through all photos to find the ones
            on a specific page, the aggregate component provides O(log(n))
            lookup time to jump directly to any page of results.
          </Text>
          <Text c="gray.3">
            Each photo is stored with its creation time as the sort key,
            allowing the aggregate to quickly calculate which photos belong on
            each page without loading all data into memory.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
