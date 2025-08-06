import { ActionIcon, Tooltip } from "@mantine/core";
import { IconCode } from "@tabler/icons-react";

interface CodeLinkButtonProps {
  /** The filename to link to (e.g., "leaderboard.ts", "stats.ts") */
  filename: string;
  /** Optional tooltip text. Defaults to "View source code" */
  tooltip?: string;
}

export function CodeLinkButton({
  filename,
  tooltip = "View source code",
}: CodeLinkButtonProps) {
  const href = `https://github.com/get-convex/aggregate/blob/main/example/convex/${filename}`;

  return (
    <Tooltip label={tooltip} position="left">
      <ActionIcon
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="subtle"
        color="cyan"
        size="lg"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 100,
        }}
      >
        <IconCode size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
