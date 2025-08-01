import {
  AppShell,
  Container,
  Text,
  NavLink,
  Group,
  Stack,
} from "@mantine/core";
import { HomePage } from "./pages/HomePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { PhotosPage } from "./pages/PhotosPage";
import { ShufflePage } from "./pages/ShufflePage";
import { StatsPage } from "./pages/StatsPage";
import { routes, useRoute } from "./routes";
import { exhaustiveCheck } from "./utils/utils";

export default function App() {
  const route = useRoute();

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
            active={route.name === "home"}
            onClick={() => routes.home().push()}
            c="white"
          />
          <NavLink
            label="Leaderboard"
            active={route.name === "leaderboard"}
            onClick={() => routes.leaderboard().push()}
            c="white"
          />
          <NavLink
            label="Photos"
            active={route.name === "photos"}
            onClick={() => routes.photos().push()}
            c="white"
          />
          <NavLink
            label="Shuffle"
            active={route.name === "shuffle"}
            onClick={() => routes.shuffle().push()}
            c="white"
          />
          <NavLink
            label="Stats"
            active={route.name === "stats"}
            onClick={() => routes.stats().push()}
            c="white"
          />
        </Stack>
      </AppShell.Aside>

      <AppShell.Main bg="dark.8">
        <Container size="lg" py="xl">
          <Routes />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function Routes() {
  const route = useRoute();

  if (route.name === "home") return <HomePage />;
  if (route.name === "leaderboard") return <LeaderboardPage />;
  if (route.name === "photos") return <PhotosPage />;
  if (route.name === "shuffle") return <ShufflePage />;
  if (route.name === "stats") return <StatsPage />;

  if (route.name == false) return <HomePage />;

  exhaustiveCheck(route);
}
