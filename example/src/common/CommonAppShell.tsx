import {
  AppShell,
  Container,
  Text,
  Group,
  Button,
  AppShellProps,
} from "@mantine/core";
import { IconBrandGithub, IconExternalLink } from "@tabler/icons-react";
import { BTreeAside } from "../pages/btree/BTreeAside";
import { Navbar } from "./Navbar";
import { useRoute } from "../routes";
import { AppShellHeader } from "./AppShellHeader";

export type CommonAppShellProps = {
  children: React.ReactNode;
  appShellChildren?: React.ReactNode;
  appShellProps?: AppShellProps;
};

export function CommonAppShell(props: CommonAppShellProps) {
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 200, breakpoint: 0 }}
      padding="md"
      bg="dark.8"
      {...props.appShellProps}
    >
      <AppShell.Header bg="dark.7">
        <AppShellHeader />
      </AppShell.Header>

      <AppShell.Navbar bg="dark.7" p="md">
        <Navbar />
      </AppShell.Navbar>

      <AppShell.Main bg="dark.8">
        <Container
          size="xl"
          py={{ base: "md", sm: "xl" }}
          px={{ base: "sm", sm: "md" }}
        >
          {props.children}
        </Container>
      </AppShell.Main>

      {props.appShellChildren}
    </AppShell>
  );
}
