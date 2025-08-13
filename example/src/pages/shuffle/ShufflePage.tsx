import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Stack, AppShell, Container } from "@mantine/core";
import { IconArrowsShuffle } from "@tabler/icons-react";
import { useState } from "react";
import { useRicherStableQuery } from "../../utils/useStableQuery";
import { CommonAppShell } from "@/common/CommonAppShell";
import { PageHeader } from "../../common/PageHeader";
import { ShuffleStats } from "./ShuffleStats";
import { RandomSongPicker } from "./RandomSongPicker";
import { ShufflePlaylist } from "./ShufflePlaylist";
import { ShuffleAside } from "./ShuffleAside";
import { CodeModal } from "./CodeModal";

export function ShufflePage() {
  const [seed, setSeed] = useState("music");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(5);
  const [cacheBuster, setCacheBuster] = useState(0);
  const [codeModalOpened, setCodeModalOpened] = useState(false);

  // Get total music count for live stats
  const totalMusic = useQuery(api.shuffle.getTotalMusicCount);

  const randomMusic = useQuery(api.shuffle.getRandomMusicTitle, {
    cacheBuster,
  });

  const { data: shuffledMusicResult, isLoading } = useRicherStableQuery(
    api.shuffle.shufflePaginated,
    {
      offset: (currentPage - 1) * pageSize,
      numItems: pageSize,
      seed,
    }
  );

  return (
    <CommonAppShell
      fullScreen={true}
      appShellChildren={
        <AppShell.Aside bg="dark.6" p="md">
          <ShuffleAside />
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
      <Container size="sm" p="md" style={{ position: "relative" }}>
        <Stack gap="md">
          <PageHeader
            title="Random Access & Shuffle Demo"
            description="Efficient random selection and deterministic shuffling using Convex Aggregate"
            icon={<IconArrowsShuffle size={32} color="white" />}
            filename="shuffle.ts"
          />

          <ShuffleStats totalMusic={totalMusic} />

          <RandomSongPicker
            randomMusic={randomMusic}
            onRefresh={() => setCacheBuster((prev) => prev + 1)}
            onShowCode={() => setCodeModalOpened(true)}
          />

          <ShufflePlaylist
            seed={seed}
            onSeedChange={setSeed}
            currentPage={currentPage}
            pageSize={pageSize}
            shuffledMusicResult={shuffledMusicResult}
            isLoading={isLoading}
            onNewShuffle={() => setCurrentPage(1)}
            onPreviousPage={() => setCurrentPage(currentPage - 1)}
            onNextPage={() => setCurrentPage(currentPage + 1)}
          />
        </Stack>
      </Container>

      <CodeModal
        opened={codeModalOpened}
        onClose={() => setCodeModalOpened(false)}
      />
    </CommonAppShell>
  );
}
