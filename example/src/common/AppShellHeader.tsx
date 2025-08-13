import { Text, Group, Button, Image } from "@mantine/core";
import { IconBrandGithub, IconExternalLink } from "@tabler/icons-react";

export function AppShellHeader() {
  return (
    <Group justify="space-between" align="center" h="100%" px="md">
      <Group gap="sm" align="center">
        <Image src="/convex.svg" alt="Convex Logo" h={32} w={32} />
        <Text size="lg" fw={500} c="white">
          Convex Aggregate Demo
        </Text>
      </Group>
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
