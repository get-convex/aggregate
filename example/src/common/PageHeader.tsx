import { Title, Text, Stack, Group } from "@mantine/core";
import { ReactNode } from "react";
import { CodeLinkButton } from "./CodeLinkButton";

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
  filename: string;
}

export function PageHeader({
  title,
  description,
  icon,
  filename,
}: PageHeaderProps) {
  return (
    <Stack gap="0">
      <Group justify="center" gap="md">
        {icon}
        <Title order={1} ta="center" c="white">
          {title}
        </Title>
      </Group>

      <Text c="gray.6" ta="center" size="lg">
        {description}
      </Text>
      <CodeLinkButton filename={filename} />
    </Stack>
  );
}
