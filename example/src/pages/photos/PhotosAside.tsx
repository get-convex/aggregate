import { Stack } from "@mantine/core";
import { AddPhotosSection } from "./AddPhotosSection";

interface PhotosAsideProps {
  onPhotoAdded: (album: string) => void;
}

export function PhotosAside({ onPhotoAdded }: PhotosAsideProps) {
  return (
    <Stack
      gap="xl"
      h="100%"
      style={{
        overflowY: "auto",
        paddingBottom: "1rem", // Ensure some space at bottom when scrolling
      }}
    >
      <AddPhotosSection onPhotoAdded={onPhotoAdded} />
    </Stack>
  );
}
