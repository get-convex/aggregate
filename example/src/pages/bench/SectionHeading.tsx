import { Group, Stack, Text } from "@mantine/core";
import { INK } from "./charts/chartTheme";

/**
 * Section title with an optional headline figure on the trailing edge, so each
 * card leads with a number rather than a paragraph.
 */
export function SectionHeading({
  title,
  figure,
  figureLabel,
  right,
}: {
  title: string;
  figure?: string;
  figureLabel?: string;
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
      {figure !== undefined ? (
        <Stack gap={0} align="flex-end">
          <Text
            fw={700}
            c={INK.primary}
            style={{
              fontSize: "1.75rem",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {figure}
          </Text>
          {figureLabel && (
            <Text
              tt="uppercase"
              size="xs"
              c="gray.6"
              style={{ letterSpacing: "0.1em" }}
            >
              {figureLabel}
            </Text>
          )}
        </Stack>
      ) : (
        right
      )}
    </Group>
  );
}
