import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  Image,
  Pagination,
  Alert,
  SimpleGrid,
  Loader,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

interface PhotoGallerySectionProps {
  photos: string[] | undefined;
  isLoading: boolean;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PhotoGallerySection({
  photos,
  isLoading,
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
}: PhotoGallerySectionProps) {
  return (
    <Card bg="dark.7" p="xl">
      <Group align="center">
        <Title order={3} c="white" mb="md">
          Photo Gallery
        </Title>
        {isLoading && <Loader size="sm" />}
      </Group>

      {photos && photos.length > 0 ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 4 }} spacing="md">
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
                onChange={onPageChange}
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
  );
}
