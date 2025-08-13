import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  Stack,
  Group,
  Text,
  Select,
  Badge,
  ThemeIcon,
} from "@mantine/core";
import { IconChartBar, IconBolt } from "@tabler/icons-react";

interface AlbumBrowserSectionProps {
  selectedAlbum: string;
  onAlbumChange: (album: string) => void;
  currentPage: number;
  totalPages: number;
}

export function AlbumBrowserSection({
  selectedAlbum,
  onAlbumChange,
  currentPage,
  totalPages,
}: AlbumBrowserSectionProps) {
  // Get available albums with counts
  const albums = useQuery(api.photos.availableAlbums);

  // Get total count for the selected album
  const totalPhotos = useQuery(api.photos.photoCount, { album: selectedAlbum });

  return (
    <Card bg="dark.7" p="md">
      <Stack gap="md">
        <Group>
          <Text fw={500} c="white">
            Browse Albums:
          </Text>
          {albums && (
            <Select
              value={selectedAlbum}
              onChange={(value) => value && onAlbumChange(value)}
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
              </Text>
            </Group>
          </Group>
        )}
      </Stack>
    </Card>
  );
}
