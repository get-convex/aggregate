/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import componentSchema from "../../src/component/schema";
import migrationsSchema from "../node_modules/@convex-dev/migrations/src/component/schema";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");
const migrationsModules = import.meta.glob(
  "../node_modules/@convex-dev/migrations/src/component/**/*.ts"
);

// Types align because both imports resolve to the same Convex instance via example's node_modules

// Helper casters to keep types clean without using `any`.
type TestSchema = Parameters<typeof convexTest>[0];
type RegisterComponentParams = Parameters<
  ReturnType<typeof convexTest>["registerComponent"]
>;
const asTestSchema = (s: unknown) => s as TestSchema;
const asComponentSchema = (s: unknown) => s as RegisterComponentParams[1];

describe("leaderboard", () => {
  async function setupTest() {
    const t = convexTest(asTestSchema(schema), modules);
    t.registerComponent(
      "aggregateByScore",
      asComponentSchema(componentSchema),
      componentModules
    );
    t.registerComponent(
      "aggregateScoreByUser",
      asComponentSchema(componentSchema),
      componentModules
    );
    t.registerComponent(
      "migrations",
      asComponentSchema(migrationsSchema),
      migrationsModules
    );
    // Reduce maxNodeSize so we can test complex trees with fewer items.
    await t.mutation(components.aggregateByScore.public.clear, {
      maxNodeSize: 4,
    });
    await t.mutation(components.aggregateScoreByUser.public.clear, {
      maxNodeSize: 4,
    });
    return t;
  }

  let t: Awaited<ReturnType<typeof setupTest>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = await setupTest();
  });

  afterEach(async () => {
    // `clear` schedules cleanup mutations to run async, so we need to wait for them,
    // otherwise they'll run after the test finishes and the next one may have started.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("score count and sum", async () => {
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(1);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(10);
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    const highScoreId = await t.mutation(api.leaderboard.addScore, {
      name: "Sarah",
      score: 35,
    });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 5 });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(7);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(140);
    await t.mutation(api.leaderboard.removeScore, { id: highScoreId });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(6);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(105);
  });

  test("score ranks", async () => {
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 35 });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 5 });

    expect(
      await t.query(api.leaderboard.scoreAtRank, { rank: 0 })
    ).toMatchObject({ name: "Sarah", score: 35 });
    expect(
      await t.query(api.leaderboard.scoreAtRank, { rank: 1 })
    ).toMatchObject({ name: "Lee", score: 30 });
    expect(
      await t.query(api.leaderboard.scoreAtRank, { rank: 5 })
    ).toMatchObject({ name: "Sujay", score: 10 });

    expect(
      await t.query(api.leaderboard.rankOfScore, { score: 35 })
    ).toStrictEqual(0);
    expect(
      await t.query(api.leaderboard.rankOfScore, { score: 30 })
    ).toStrictEqual(1);
    expect(
      await t.query(api.leaderboard.rankOfScore, { score: 10 })
    ).toStrictEqual(5);
    expect(
      await t.query(api.leaderboard.rankOfScore, { score: 33 })
    ).toStrictEqual(1);

    const scoresInOrder = await t.query(api.leaderboard.pageOfScores, {
      offset: 0,
      numItems: 100,
    });
    // The function returns document objects, not formatted strings
    expect(scoresInOrder).toHaveLength(7);
    expect(scoresInOrder[0]).toMatchObject({ name: "Sarah", score: 35 });
    expect(scoresInOrder[1]).toMatchObject({ name: "Lee", score: 30 });
    expect(scoresInOrder[2]).toMatchObject({ name: "Lee", score: 25 });
    expect(scoresInOrder[3]).toMatchObject({ name: "Sujay", score: 20 });
    expect(scoresInOrder[4]).toMatchObject({ name: "Lee", score: 15 });
    expect(scoresInOrder[5]).toMatchObject({ name: "Sujay", score: 10 });
    expect(scoresInOrder[6]).toMatchObject({ name: "Sarah", score: 5 });
  });

  test("backfill", async () => {
    const t = await setupTest();
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    await t.mutation(internal.leaderboard.clearAggregates, {});
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(0);
    await t.mutation(internal.leaderboard.runAggregateBackfill, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(5);
  });

  test("leaderboard", async () => {
    const t = await setupTest();
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });

    const highScore1 = await t.query(api.leaderboard.userHighScore, {
      name: "Sujay",
    });
    expect(highScore1).toEqual(20);
    const highScore2 = await t.query(api.leaderboard.userHighScore, {
      name: "Lee",
    });
    expect(highScore2).toEqual(25);
    const averageScore = await t.query(api.leaderboard.userAverageScore, {
      name: "Sujay",
    });
    expect(averageScore).toEqual(15);
  });
});

describe("photos", () => {
  async function setupTest() {
    const t = convexTest(asTestSchema(schema), modules);
    t.registerComponent(
      "photos",
      asComponentSchema(componentSchema),
      componentModules
    );
    // Remove the non-existent init call - photos component doesn't need initialization
    return t;
  }

  let t: Awaited<ReturnType<typeof setupTest>>;
  beforeEach(async () => {
    vi.useFakeTimers();
    t = await setupTest();
  });
  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("triggers and pagination", async () => {
    const album = "birthday party";
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.photos.addPhoto, { album, url: `photo${i}` });
    }
    const page0 = await t.query(api.photos.pageOfPhotos, {
      album,
      offset: 0,
      numItems: 10,
    });
    expect(page0).toEqual(Array.from({ length: 10 }, (_, i) => `photo${i}`));
    const emptyPage = await t.query(api.photos.pageOfPhotos, {
      album,
      offset: 0,
      numItems: 0,
    });
    expect(emptyPage).toEqual([]);
    const lastPage = await t.query(api.photos.pageOfPhotos, {
      album,
      offset: 28,
      numItems: 10,
    });
    expect(lastPage).toEqual(["photo28", "photo29"]);
  });
});

describe("shuffle", () => {
  async function setupTest() {
    const t = convexTest(asTestSchema(schema), modules);
    t.registerComponent(
      "music",
      asComponentSchema(componentSchema),
      componentModules
    );
    return t;
  }

  let t: Awaited<ReturnType<typeof setupTest>>;
  beforeEach(async () => {
    vi.useFakeTimers();
    t = await setupTest();
    await t.mutation(components.music.public.clear, { maxNodeSize: 4 });
  });
  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("shuffle", async () => {
    await t.mutation(api.shuffle.addMusic, { title: "Song1" });
    await t.mutation(api.shuffle.addMusic, { title: "Song2" });
    await t.mutation(api.shuffle.addMusic, { title: "Song3" });
    const idToDelete = await t.mutation(api.shuffle.addMusic, {
      title: "Song4",
    });
    await t.mutation(api.shuffle.addMusic, { title: "Song5" });
    await t.mutation(api.shuffle.addMusic, { title: "Song6" });
    await t.mutation(api.shuffle.removeMusic, { id: idToDelete });

    const randomSong = await t.query(api.shuffle.getRandomMusicTitle, {});
    expect(randomSong).toMatch(/Song[12356]/);

    // With same seed, pagination should return unique songs
    const shufflePage0 = await t.query(api.shuffle.shufflePaginated, {
      offset: 0,
      numItems: 3,
      seed: "",
    });
    // The function returns a pagination object with items array
    expect(shufflePage0.items).toEqual(["Song6", "Song1", "Song3"]);
    expect(shufflePage0.totalCount).toBe(5);
    expect(shufflePage0.currentPage).toBe(1);

    const shufflePage1 = await t.query(api.shuffle.shufflePaginated, {
      offset: 3,
      numItems: 3,
      seed: "",
    });
    expect(shufflePage1.items).toEqual(["Song5", "Song2"]);

    // With different seed, we should get a different shuffle
    const shufflePage0Seed1 = await t.query(api.shuffle.shufflePaginated, {
      offset: 0,
      numItems: 3,
      seed: "x",
    });
    expect(shufflePage0Seed1.items).toEqual(["Song1", "Song6", "Song5"]);
    const shufflePage1Seed1 = await t.query(api.shuffle.shufflePaginated, {
      offset: 3,
      numItems: 3,
      seed: "x",
    });
    expect(shufflePage1Seed1.items).toEqual(["Song3", "Song2"]);
  });
});

describe("stats", () => {
  async function setupTest() {
    const t = convexTest(asTestSchema(schema), modules);
    t.registerComponent(
      "stats",
      asComponentSchema(componentSchema),
      componentModules
    );
    await t.mutation(components.stats.public.clear, { maxNodeSize: 4 });
    return t;
  }
  let t: Awaited<ReturnType<typeof setupTest>>;
  beforeEach(async () => {
    vi.useFakeTimers();
    t = await setupTest();
  });
  afterEach(async () => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  test("report latency", async () => {
    await t.mutation(api.stats.reportLatency, { latency: 10 });
    await t.mutation(api.stats.reportLatency, { latency: 20 });
    await t.mutation(api.stats.reportLatency, { latency: 15 });
    await t.mutation(api.stats.reportLatency, { latency: 25 });
    await t.mutation(api.stats.reportLatency, { latency: 30 });
    await t.mutation(api.stats.reportLatency, { latency: 35 });

    const stats = await t.query(api.stats.getStats);
    // Handle the case where getStats can return null when count is 0
    expect(stats).not.toBeNull();
    if (stats) {
      expect(stats.max).toEqual(35);
      expect(stats.min).toEqual(10);
      expect(stats.mean).toBeCloseTo(22.5);
      expect(stats.median).toEqual(25);
      expect(stats.p75).toEqual(30);
      expect(stats.p95).toEqual(35);
    }
  });
});
