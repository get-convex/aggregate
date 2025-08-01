import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppShell, Container, Title, Text } from "@mantine/core";

export default function App() {
  return (
    <AppShell header={{ height: 60 }} padding="md" bg="dark.8">
      <AppShell.Header bg="dark.7">
        <Text size="lg" fw={500} p="md" c="white">
          Convex + React
        </Text>
      </AppShell.Header>

      <AppShell.Main bg="dark.8">
        <Container size="lg" py="xl">
          <Title order={1} ta="center" size="3rem" fw={700} c="white">
            Convex + React
          </Title>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
