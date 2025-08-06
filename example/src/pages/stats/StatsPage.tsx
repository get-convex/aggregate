import { Stack, AppShell, Container } from "@mantine/core";
import { IconChartPie } from "@tabler/icons-react";
import { CommonAppShell } from "@/common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";
import { StatsDisplaySection } from "./StatsDisplaySection";
import { StatsAside } from "./StatsAside";

export function StatsPage() {
  return (
    <CommonAppShell
      fullScreen={true}
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <StatsAside />
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
            title="Stats Demo"
            description="Direct aggregation without table dependencies - perfect for analytics and metrics"
            icon={<IconChartPie size={32} color="yellow" />}
            filename="stats.ts"
          />

          <StatsDisplaySection />
        </Stack>
      </Container>
    </CommonAppShell>
  );
}
