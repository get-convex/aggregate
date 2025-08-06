import {
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Anchor,
  ThemeIcon,
  AppShell,
  Container,
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
import { BTreeAside } from "../btree/index";
import { LeaderboardAside } from "./LeaderboardAside";

export function LeaderboardPage() {
  return (
    <CommonAppShell
      fullScreen={true}
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <LeaderboardAside />
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
      <Container size="sm" p="md">
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

          <SearchAnalysisSection />

          <LeaderboardTable />
        </Stack>
      </Container>
    </CommonAppShell>
  );
}
