import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Card,
  Stack,
  Button,
  Table,
  Alert,
  Group,
  Pagination,
  Text,
  Badge,
  Select,
  Loader,
} from "@mantine/core";
import { useApiErrorHandler } from "@/utils/errors";
import { useState, useEffect } from "react";
import { useRicherStableQuery } from "../../utils/useStableQuery";

export function LeaderboardTable() {
  const onApiError = useApiErrorHandler();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Get paginated scores
  const { data: scores, isLoading } = useRicherStableQuery(
    api.leaderboard.pageOfScores,
    {
      offset: (currentPage - 1) * pageSize,
      numItems: pageSize,
    }
  );

  const totalScores = useQuery(api.leaderboard.countScores);
  const removeScore = useMutation(api.leaderboard.removeScore);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  const totalPages = totalScores ? Math.ceil(totalScores / pageSize) : 0;

  return (
    <Card bg="dark.7" p="xl">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2} c="white">
            Current Leaderboard
          </Title>
          {isLoading && <Loader size="sm" />}
        </Group>

        {/* Pagination Controls */}
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Text size="sm" c="gray.3">
              Page size:
            </Text>
            <Select
              value={pageSize.toString()}
              onChange={(value) => value && setPageSize(parseInt(value))}
              data={[
                { value: "5", label: "5 per page" },
                { value: "10", label: "10 per page" },
                { value: "20", label: "20 per page" },
                { value: "50", label: "50 per page" },
              ]}
              size="sm"
              w={120}
            />
          </Group>

          {totalScores !== undefined && (
            <Group gap="md">
              <Text size="sm" c="gray.3">
                Total scores: <Badge variant="light">{totalScores}</Badge>
              </Text>
              <Text size="sm" c="gray.3">
                Page {currentPage} of {totalPages}{" "}
                <Badge variant="light" color="green">
                  O(log n)
                </Badge>
              </Text>
            </Group>
          )}
        </Group>

        {scores && scores.length > 0 ? (
          <Stack gap="md">
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
                {scores.map((score, index) => (
                  <Table.Tr key={score._id}>
                    <Table.Td c="white">
                      {(currentPage - 1) * pageSize + index + 1}
                    </Table.Td>
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
                ))}
              </Table.Tbody>
            </Table>

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
          <Alert color="blue" title="No scores yet">
            Add some scores to see the leaderboard!
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
