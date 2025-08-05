import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useApiErrorHandler } from "@/utils/errors";
import { BTreeAside, BTreeVisualizer } from "./index";
import { CommonAppShell } from "@/common/CommonAppShell";

export function BTreePage() {
  const onApiError = useApiErrorHandler();

  const listTrees = useQuery(api.btree.listTrees);
  const listNodes = useQuery(api.btree.listNodes);
  const deleteItem = useMutation(api.btree.deleteItem);

  return (
    <CommonAppShell
      appShellChildren={<BTreeAside />}
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
