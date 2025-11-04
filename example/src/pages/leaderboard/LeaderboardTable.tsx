import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Title,
  Card,
  Stack,
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
import { LeaderboardTableRow } from "./LeaderboardTableRow";
import { Id } from "../../../convex/_generated/dataModel";

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
    },
  );

  const totalScores = useQuery(api.leaderboard.countScores);
  const removeScore = useMutation(api.leaderboard.removeScore);

  const handleRemove = (id: Id<"leaderboard">) => {
    removeScore({ id }).catch(onApiError);
  };

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
              w={150}
            />
          </Group>

          {totalScores !== undefined && (
            <Group gap="md">
              <Text size="sm" c="gray.3">
                Total scores: <Badge variant="light">{totalScores}</Badge>
              </Text>
              <Text size="sm" c="gray.3">
                Page {currentPage} of {totalPages}{" "}
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
                  <LeaderboardTableRow
                    key={score._id}
                    score={score}
                    rank={(currentPage - 1) * pageSize + index + 1}
                    onRemove={handleRemove}
                  />
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
