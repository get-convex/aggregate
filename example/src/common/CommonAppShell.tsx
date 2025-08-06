import { AppShell, Container, AppShellProps } from "@mantine/core";
import { Navbar } from "./Navbar";
import { AppShellHeader } from "./AppShellHeader";

export type CommonAppShellProps = {
  children: React.ReactNode;
  appShellChildren?: React.ReactNode;
  appShellProps?: AppShellProps;
  fullScreen?: boolean; // Bypass container for full-screen components
};

export function CommonAppShell(props: CommonAppShellProps) {
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 200, breakpoint: 0 }}
      padding={props.fullScreen ? 0 : "md"}
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
        {props.fullScreen ? (
          props.children
        ) : (
          <Container
            size="xl"
            pos={"relative"}
            py={{ base: "md", sm: "xl" }}
            px={{ base: "sm", sm: "md" }}
          >
            {props.children}
          </Container>
        )}
      </AppShell.Main>

      {props.appShellChildren}
    </AppShell>
  );
}
