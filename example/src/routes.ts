import { createRouter, defineRoute } from "type-route";

export const { RouteProvider, useRoute, routes } = createRouter({
  home: defineRoute("/"),
  leaderboard: defineRoute("/leaderboard"),
  photos: defineRoute("/photos"),
  shuffle: defineRoute("/shuffle"),
  stats: defineRoute("/stats"),
});
