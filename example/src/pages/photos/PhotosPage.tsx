import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Stack, AppShell, Container } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { CommonAppShell } from "@/common/CommonAppShell";
import { useRicherStableQuery } from "../../utils/useStableQuery";
import { PageHeader } from "../../common/PageHeader";
import { AlbumBrowserSection } from "./AlbumBrowserSection";
import { PhotoGallerySection } from "./PhotoGallerySection";
import { PhotosAside } from "./PhotosAside";

export function PhotosPage() {
  const [selectedAlbum, setSelectedAlbum] = useState("Nature");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(6);

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

  // Reset to page 1 when album changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAlbum]);

  const totalPages = totalPhotos ? Math.ceil(totalPhotos / pageSize) : 0;

  const handlePhotoAdded = (album: string) => {
    // Switch to the album that was added to
    setSelectedAlbum(album);
  };

  return (
    <CommonAppShell
      fullScreen={true}
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <PhotosAside onPhotoAdded={handlePhotoAdded} />
        </AppShell.Aside>
      }
      appShellProps={{
        aside: {
          width: 300,
          breakpoint: "md",
          collapsed: {
            desktop: false,
            mobile: true,
          },
        },
      }}
    >
      <Container size="sm" p="md" style={{ position: "relative" }}>
        <Stack gap="md">
          <PageHeader
            title="Offset-Based Pagination Demo"
            description="Use namespaces to efficiently segment your data"
            icon={<IconPhoto size={32} color="white" />}
            filename="photos.ts"
          />

          <AlbumBrowserSection
            selectedAlbum={selectedAlbum}
            onAlbumChange={setSelectedAlbum}
            currentPage={currentPage}
            totalPages={totalPages}
          />

          <PhotoGallerySection
            photos={photos}
            isLoading={isLoading}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </Stack>
      </Container>
    </CommonAppShell>
  );
}
