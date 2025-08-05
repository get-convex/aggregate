import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useApiErrorHandler } from "@/utils/errors";
import { BTreeAside, BTreeVisualizer } from "./index";
import { CommonAppShell } from "@/common/CommonAppShell";
import { AppShell } from "@mantine/core";

export function BTreePage() {
  const onApiError = useApiErrorHandler();

  const listTrees = useQuery(api.btree.listTrees);
  const listNodes = useQuery(api.btree.listNodes);
  const deleteItem = useMutation(api.btree.deleteItem);

  return (
    <CommonAppShell
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <BTreeAside />
        </AppShell.Aside>
      }
      appShellProps={{
        aside: {
          width: 300,
          breakpoint: "md",
          collapsed: {
            desktop: false,
            mobile: true,
          },
        },
      }}
    >
      <BTreeVisualizer
        listTrees={listTrees ?? []}
        listNodes={listNodes ?? []}
        onDeleteItem={(itemId, score) =>
          deleteItem({ id: itemId, score }).catch(onApiError)
        }
      />
    </CommonAppShell>
  );
}
