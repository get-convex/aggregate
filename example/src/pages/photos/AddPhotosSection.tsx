import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  TextInput,
  Button,
  ActionIcon,
} from "@mantine/core";
import { IconDatabase, IconDice, IconEdit } from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

interface AddPhotosSectionProps {
  onPhotoAdded: (album: string) => void;
}

export function AddPhotosSection({ onPhotoAdded }: AddPhotosSectionProps) {
  const onApiError = useApiErrorHandler();
  const [newAlbum, setNewAlbum] = useState("");
  const [url, setUrl] = useState("");
  const [isRandomMode, setIsRandomMode] = useState(true);

  const addPhoto = useMutation(api.photos.addPhoto);

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

  const handleAddPhoto = () => {
    if (!newAlbum) return;

    const photoUrl = isRandomMode ? generateRandomPhotoUrl() : url;
    if (!photoUrl) return;

    addPhoto({ album: newAlbum, url: photoUrl })
      .then(() => {
        if (!isRandomMode) setUrl("");
        // Notify parent that a photo was added to this album
        onPhotoAdded(newAlbum);
      })
      .catch(onApiError);
  };

  return (
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
              {isRandomMode ? <IconDice size={16} /> : <IconEdit size={16} />}
            </ActionIcon>
          }
          rightSectionPointerEvents="all"
        />
        <Button
          onClick={handleAddPhoto}
          disabled={!newAlbum || (!isRandomMode && !url)}
          size="sm"
          fullWidth
        >
          {isRandomMode ? "Add Random Photo" : "Add Photo"}
        </Button>
      </Stack>
    </Card>
  );
}
