import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Anchor,
  ThemeIcon,
} from "@mantine/core";
import {
  IconTrophy,
  IconCode,
  IconBolt,
  IconRocket,
} from "@tabler/icons-react";
import { CommonAppShell } from "../../common/CommonAppShell";
import { AddScoreSection } from "./AddScoreSection";
import { StatisticsSection } from "./StatisticsSection";
import { SearchAnalysisSection } from "./SearchAnalysisSection";
import { LeaderboardTable } from "./LeaderboardTable";

export function LeaderboardPage() {
  return (
    <CommonAppShell>
      <Stack gap="xl">
        <Group justify="center" gap="md">
          <IconTrophy size={32} color="orange" />
          <Title order={1} ta="center" c="white">
            Leaderboard Demo
          </Title>
        </Group>

        <Text c="gray.3" ta="center" size="lg">
          Lightning-fast leaderboards with instant rankings, statistics, and
          user analytics using Convex Aggregate
        </Text>

        <Group justify="center">
          <Card bg="dark.6" p="md">
            <Group gap="md">
              <IconCode size={20} color="cyan" />
              <Text size="sm" c="gray.3">
                View the source:
              </Text>
              <Anchor
                href="https://github.com/get-convex/aggregate/blob/main/example/convex/leaderboard.ts"
                target="_blank"
                c="cyan"
                size="sm"
              >
                convex/leaderboard.ts
              </Anchor>
            </Group>
          </Card>
        </Group>

        {/* Quick explanation */}
        <Card bg="dark.7" p="md">
          <Group justify="center" gap="xl">
            <Group gap="xs">
              <ThemeIcon color="red" variant="light" size="sm">
                <IconBolt size={14} />
              </ThemeIcon>
              <Text size="sm" c="gray.3" component="span">
                Traditional:{" "}
                <Badge color="red" size="xs">
                  O(n)
                </Badge>{" "}
                - Scan all scores to find rankings
              </Text>
            </Group>
            <Group gap="xs">
              <ThemeIcon color="green" variant="light" size="sm">
                <IconRocket size={14} />
              </ThemeIcon>
              <Text size="sm" c="gray.3" component="span">
                Aggregate:{" "}
                <Badge color="green" size="xs">
                  O(log n)
                </Badge>{" "}
                - Find any ranking instantly
              </Text>
            </Group>
          </Group>
        </Card>

        <AddScoreSection />

        <StatisticsSection />

        <SearchAnalysisSection />

        <LeaderboardTable />
      </Stack>
    </CommonAppShell>
  );
}
