import {
  AppShell,
  Container,
  Text,
  NavLink,
  Group,
  Stack,
  Button,
} from "@mantine/core";
import {
  IconHome,
  IconTrophy,
  IconPhoto,
  IconArrowsShuffle,
  IconChartPie,
  IconBinaryTree,
  IconBrandGithub,
  IconExternalLink,
} from "@tabler/icons-react";
import { HomePage } from "./pages/home/HomePage";
import { LeaderboardPage } from "./pages/leaderboard/LeaderboardPage";
import { PhotosPage } from "./pages/photos/PhotosPage";
import { ShufflePage } from "./pages/shuffle/ShufflePage";
import { StatsPage } from "./pages/stats/StatsPage";
import { BTreePage } from "./pages/btree/BTreePage";
import { BTreeAside } from "./pages/btree/BTreeAside";
import { routes, useRoute } from "./routes";
import { exhaustiveCheck } from "./utils/utils";
import { Navbar } from "./common/Navbar";

export default function App() {
  const route = useRoute();

  if (route.name === "home") return <HomePage />;
  if (route.name === "leaderboard") return <LeaderboardPage />;
  if (route.name === "photos") return <PhotosPage />;
  if (route.name === "shuffle") return <ShufflePage />;
  if (route.name === "stats") return <StatsPage />;
  if (route.name === "btree") return <BTreePage />;

  if (route.name == false) return <HomePage />;

  exhaustiveCheck(route);
}
