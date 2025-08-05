import { NavLink, Stack } from "@mantine/core";
import {
  IconHome,
  IconTrophy,
  IconPhoto,
  IconArrowsShuffle,
  IconChartPie,
  IconBinaryTree,
} from "@tabler/icons-react";
import { routes, useRoute } from "../routes";

export function Navbar() {
  const route = useRoute();
  return (
    <Stack gap="xs">
      <NavLink
        label="Home"
        leftSection={<IconHome size={20} />}
        active={route.name === "home"}
        onClick={() => routes.home().push()}
        c="white"
      />
      <NavLink
        label="Leaderboard"
        leftSection={<IconTrophy size={20} />}
        active={route.name === "leaderboard"}
        onClick={() => routes.leaderboard().push()}
        c="white"
      />
      <NavLink
        label="Photos"
        leftSection={<IconPhoto size={20} />}
        active={route.name === "photos"}
        onClick={() => routes.photos().push()}
        c="white"
      />
      <NavLink
        label="Shuffle"
        leftSection={<IconArrowsShuffle size={20} />}
        active={route.name === "shuffle"}
        onClick={() => routes.shuffle().push()}
        c="white"
      />
      <NavLink
        label="Stats"
        leftSection={<IconChartPie size={20} />}
        active={route.name === "stats"}
        onClick={() => routes.stats().push()}
        c="white"
      />
      <NavLink
        label="B-Tree"
        leftSection={<IconBinaryTree size={20} />}
        active={route.name === "btree"}
        onClick={() => routes.btree().push()}
        c="white"
      />
    </Stack>
  );
}
