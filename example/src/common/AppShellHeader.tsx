import { Text, Group, Button } from "@mantine/core";
import { IconBrandGithub, IconExternalLink } from "@tabler/icons-react";

export function AppShellHeader() {
  return (
    <Group justify="space-between" align="center" h="100%" px="md">
      <Text size="lg" fw={500} c="white">
        Convex Aggregate Demo
      </Text>
      <Button
        component="a"
        href="https://github.com/get-convex/aggregate"
        target="_blank"
        color="cyan"
        leftSection={<IconBrandGithub size={18} />}
        rightSection={<IconExternalLink size={18} />}
      >
        View Source
      </Button>
    </Group>
  );
}
