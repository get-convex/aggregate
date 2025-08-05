import { AppShell, Container, AppShellProps } from "@mantine/core";
import { Navbar } from "./Navbar";
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
