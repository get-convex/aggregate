import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Table,
  ActionIcon,
  Group,
  TextInput,
  NumberInput,
} from "@mantine/core";
import { IconEdit, IconCheck, IconX, IconTrash } from "@tabler/icons-react";
import { useApiErrorHandler } from "@/utils/errors";
import { Id } from "../../../convex/_generated/dataModel";

interface LeaderboardTableRowProps {
  score: {
    _id: Id<"leaderboard">;
    name: string;
    score: number;
  };
  rank: number;
  onRemove: (id: Id<"leaderboard">) => void;
}

export function LeaderboardTableRow({
  score,
  rank,
  onRemove,
}: LeaderboardTableRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(score.name);
  const [editScore, setEditScore] = useState(score.score);

  const onApiError = useApiErrorHandler();
  const updateScore = useMutation(api.leaderboard.updateScore);

  const handleEdit = () => {
    setEditName(score.name);
    setEditScore(score.score);
    setIsEditing(true);
  };

  if (isEditing) {
    return (
      <Table.Tr>
        <Table.Td c="white">{rank}</Table.Td>
        <Table.Td>
          <TextInput
            value={editName}
            onChange={(event) => setEditName(event.currentTarget.value)}
            size="xs"
            placeholder="Player name"
            w="100%"
            maw={120}
            styles={{
              input: { backgroundColor: "var(--mantine-color-dark-6)" },
            }}
          />
        </Table.Td>
        <Table.Td>
          <NumberInput
            value={editScore}
            onChange={(value) => setEditScore(Number(value) || 0)}
            size="xs"
            placeholder="Score"
            min={0}
            w="100%"
            maw={80}
            styles={{
              input: { backgroundColor: "var(--mantine-color-dark-6)" },
            }}
          />
        </Table.Td>
        <Table.Td>
          <Group gap="xs">
            <ActionIcon
              size="sm"
              color="green"
              onClick={async () => {
                if (editName.trim() === "" || editScore === null) return;

                await updateScore({
                  id: score._id,
                  name: editName.trim(),
                  score: editScore,
                }).catch(onApiError);

                setIsEditing(false);
              }}
              disabled={editName.trim() === "" || editScore === null}
            >
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              color="red"
              onClick={() => {
                setEditName(score.name);
                setEditScore(score.score);
                setIsEditing(false);
              }}
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Table.Tr>
      <Table.Td c="white">{rank}</Table.Td>
      <Table.Td c="white">{score.name}</Table.Td>
      <Table.Td c="white">{score.score}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <ActionIcon
            size="sm"
            color="blue"
            variant="subtle"
            onClick={handleEdit}
          >
            <IconEdit size={16} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            color="red"
            variant="subtle"
            onClick={() => onRemove(score._id)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
