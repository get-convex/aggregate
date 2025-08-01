import {
  AppShell,
  Container,
  Text,
  NavLink,
  Group,
  Stack,
} from "@mantine/core";
import { useState } from "react";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { PhotosPage } from "./pages/PhotosPage";
import { ShufflePage } from "./pages/ShufflePage";
import { StatsPage } from "./pages/StatsPage";

type Page = "home" | "leaderboard" | "photos" | "shuffle" | "stats";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return <HomePage />;
      case "leaderboard":
        return <LeaderboardPage />;
      case "photos":
        return <PhotosPage />;
      case "shuffle":
        return <ShufflePage />;
      case "stats":
        return <StatsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <AppShell header={{ height: 60 }} padding="md" bg="dark.8">
      <AppShell.Header bg="dark.7">
        <Group justify="space-between" p="md">
          <Text size="lg" fw={500} c="white">
            Convex Aggregate Demo
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Aside bg="dark.7" p="md">
        <Stack gap="xs">
          <NavLink
            label="Home"
            active={currentPage === "home"}
            onClick={() => setCurrentPage("home")}
            c="white"
          />
          <NavLink
            label="Leaderboard"
            active={currentPage === "leaderboard"}
            onClick={() => setCurrentPage("leaderboard")}
            c="white"
          />
          <NavLink
            label="Photos"
            active={currentPage === "photos"}
            onClick={() => setCurrentPage("photos")}
            c="white"
          />
          <NavLink
            label="Shuffle"
            active={currentPage === "shuffle"}
            onClick={() => setCurrentPage("shuffle")}
            c="white"
          />
          <NavLink
            label="Stats"
            active={currentPage === "stats"}
            onClick={() => setCurrentPage("stats")}
            c="white"
          />
        </Stack>
      </AppShell.Aside>

      <AppShell.Main bg="dark.8">
        <Container size="lg" py="xl">
          {renderPage()}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
