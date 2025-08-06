import { Card, Group, Text, Badge, ThemeIcon } from "@mantine/core";
import { IconChartBar, IconBolt } from "@tabler/icons-react";

interface ShuffleStatsProps {
  totalMusic: number | undefined;
}

export function ShuffleStats({ totalMusic }: ShuffleStatsProps) {
  return (
    <Card bg="dark.7" p="md">
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon color="blue" variant="light" size="sm">
            <IconChartBar size={14} />
          </ThemeIcon>
          <Text size="sm" c="gray.3" component="span">
            Total songs in library:{" "}
            <Badge variant="light">{totalMusic ?? 0}</Badge>
          </Text>
        </Group>
        <Group gap="xs">
          <ThemeIcon color="purple" variant="light" size="sm">
            <IconBolt size={14} />
          </ThemeIcon>
          <Text size="sm" c="gray.3" component="span">
            Random access: <Badge variant="light">O(log n)</Badge>
          </Text>
        </Group>
      </Group>
    </Card>
  );
}
