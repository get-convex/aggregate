import { HomePage } from "./pages/home/HomePage";
import { LeaderboardPage } from "./pages/leaderboard/LeaderboardPage";
import { PhotosPage } from "./pages/photos/PhotosPage";
import { ShufflePage } from "./pages/shuffle/ShufflePage";
import { StatsPage } from "./pages/stats/StatsPage";
import { BTreePage } from "./pages/btree/BTreePage";
import { useRoute } from "./routes";
import { exhaustiveCheck } from "./utils/utils";

export default function App() {
  const route = useRoute();

  if (route.name === "home") return <HomePage />;
  if (route.name === "leaderboard") return <LeaderboardPage />;
  if (route.name === "photos") return <PhotosPage />;
  if (route.name === "shuffle") return <ShufflePage />;
  if (route.name === "stats") return <StatsPage />;
  if (route.name === "btree") return <BTreePage />;

  if (route.name == false) return <HomePage />;

  exhaustiveCheck(route);
}
