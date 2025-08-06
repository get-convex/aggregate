import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Title, Card, Stack, Button, Table, Alert } from "@mantine/core";
import { useApiErrorHandler } from "@/utils/errors";

export function LeaderboardTable() {
  const onApiError = useApiErrorHandler();
  const scores = useQuery(api.leaderboard.scoresInOrder);
  const removeScore = useMutation(api.leaderboard.removeScore);

  return (
    <Card bg="dark.7" p="xl">
      <Stack gap="md">
        <Title order={2} c="white">
          Current Leaderboard
        </Title>

        {scores && scores.length > 0 ? (
          <Table bg="dark.6">
            <Table.Thead>
              <Table.Tr>
                <Table.Th c="white">Rank</Table.Th>
                <Table.Th c="white">Player</Table.Th>
                <Table.Th c="white">Score</Table.Th>
                <Table.Th c="white">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scores.map((score, index) => {
                // Handle the "..." truncation string case
                if (typeof score === "string") {
                  return (
                    <Table.Tr key={index}>
                      <Table.Td c="white" colSpan={4} ta="center">
                        {score}
                      </Table.Td>
                    </Table.Tr>
                  );
                }

                return (
                  <Table.Tr key={score._id}>
                    <Table.Td c="white">{index + 1}</Table.Td>
                    <Table.Td c="white">{score.name}</Table.Td>
                    <Table.Td c="white">{score.score}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        color="red"
                        onClick={() =>
                          removeScore({ id: score._id }).catch(onApiError)
                        }
                      >
                        Remove
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Alert color="blue" title="No scores yet">
            Add some scores to see the leaderboard!
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
