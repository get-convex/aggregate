import { Stack, AppShell, Container } from "@mantine/core";
import { IconTrophy } from "@tabler/icons-react";
import { CommonAppShell } from "../../common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";
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
      <Container size="sm" p="md" style={{ position: "relative" }}>
        <Stack gap="md">
          <PageHeader
            title="Leaderboard Demo"
            description="Lightning-fast leaderboards with instant rankings and statistics"
            icon={<IconTrophy size={32} color="orange" />}
            filename="leaderboard.ts"
          />

          <SearchAnalysisSection />

          <LeaderboardTable />
        </Stack>
      </Container>
    </CommonAppShell>
  );
}
