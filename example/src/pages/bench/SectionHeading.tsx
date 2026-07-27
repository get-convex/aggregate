import { Group, Text } from "@mantine/core";

/** Section title, with an optional legend or note on the trailing edge. */
export function SectionHeading({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-end" wrap="nowrap">
      <Text
        tt="uppercase"
        size="sm"
        fw={600}
        c="gray.3"
        style={{ letterSpacing: "0.1em" }}
      >
        {title}
      </Text>
      {right}
    </Group>
  );
}
