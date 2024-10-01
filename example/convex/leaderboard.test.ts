/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest"
import schema from "./schema";
import componentSchema from "../../src/component/schema";
import { api, components, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");

async function setupTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("aggregateByScore", componentSchema, componentModules);
  t.registerComponent("aggregateScoreByUser", componentSchema, componentModules);
  // Reduce maxNodeSize so we can test complex trees with fewer items.
  await t.mutation(components.aggregateByScore.public.clear, { maxNodeSize: 4 });
  await t.mutation(components.aggregateScoreByUser.public.clear, { maxNodeSize: 4 });
  return t;
}

describe("leaderboard by score", () => {
  test("score count and sum", async () => {
    const t = await setupTest();
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(1);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(10);
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    const highScoreId = await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 35 });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 5 });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(7);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(140);
    await t.mutation(api.leaderboard.removeScore, { id: highScoreId });
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(6);
    expect(await t.query(api.leaderboard.sumNumbers)).toStrictEqual(105);
  })

  test("score ranks", async () => {
    const t = await setupTest();
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 35 });
    await t.mutation(api.leaderboard.addScore, { name: "Sarah", score: 5 });

    expect(await t.query(api.leaderboard.scoreAtRank, { rank: 0 })).toMatchObject({ name: "Sarah", score: 35 });
    expect(await t.query(api.leaderboard.scoreAtRank, { rank: 1 })).toMatchObject({ name: "Lee", score: 30 });
    expect(await t.query(api.leaderboard.scoreAtRank, { rank: 5 })).toMatchObject({ name: "Sujay", score: 10 });

    expect(await t.query(api.leaderboard.rankOfScore, { score: 35 })).toStrictEqual(0);
    expect(await t.query(api.leaderboard.rankOfScore, { score: 30 })).toStrictEqual(1);
    expect(await t.query(api.leaderboard.rankOfScore, { score: 10 })).toStrictEqual(5);
    expect(await t.query(api.leaderboard.rankOfScore, { score: 33 })).toStrictEqual(1);

    const scoresInOrder = await t.query(api.leaderboard.scoresInOrder);
    expect(scoresInOrder).toEqual(["Sarah: 35", "Lee: 30", "Lee: 25", "Sujay: 20", "Lee: 15", "Sujay: 10", "Sarah: 5"]);
  });

  test("backfill", async () => {
    const t = await setupTest();
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 10 });
    await t.mutation(api.leaderboard.addScore, { name: "Sujay", score: 20 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 15 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 25 });
    await t.mutation(api.leaderboard.addScore, { name: "Lee", score: 30 });
    await t.mutation(components.aggregateByScore.public.clear, {});
    await t.mutation(components.aggregateScoreByUser.public.clear, {});
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(0);
    await t.mutation(internal.leaderboard.backfillAggregates);
    expect(await t.query(api.leaderboard.countScores)).toStrictEqual(5);
  });
});

test("leaderboard by user", () => {
  const t = await setupTest();
  
});