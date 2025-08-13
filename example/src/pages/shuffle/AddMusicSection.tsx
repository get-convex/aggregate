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
  Alert,
} from "@mantine/core";
import { IconMusic, IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useApiErrorHandler } from "@/utils/errors";

export function AddMusicSection() {
  const onApiError = useApiErrorHandler();
  const [title, setTitle] = useState("");
  const addMusic = useMutation(api.shuffle.addMusic);

  const handleAddMusic = () => {
    if (!title) return;
    addMusic({ title })
      .then(() => {
        setTitle("");
      })
      .catch(onApiError);
  };
  return (
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
        <Button onClick={handleAddMusic} disabled={!title} size="sm" fullWidth>
          Add Song
        </Button>

        <Alert color="blue" title="Try This!" icon={<IconInfoCircle />}>
          <Text size="sm">
            Add songs and watch the random picker and shuffle work instantly!
            The aggregate maintains perfect performance even with thousands of
            songs.
          </Text>
        </Alert>
      </Stack>
    </Card>
  );
}
