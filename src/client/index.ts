import {
  DocumentByName,
  FunctionReference,
  FunctionVisibility,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  TableNamesInDataModel,
  createFunctionHandle,
} from "convex/server";
import {
  Key,
} from "../component/btree.js";
import { api } from "../component/_generated/api.js";
import { GenericId } from "convex/values";
import { UseApi } from "./useApi.js";

type UsedAPI = UseApi<typeof api>;

export async function initBTree<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
  K extends Key,
>(
  ctx: GenericMutationCtx<DataModel>,
  api: UsedAPI, 
  getKey: FunctionReference<"query", FunctionVisibility, { doc: DocumentByName<DataModel, T> }, {key: K; summand?: number}>,
): Promise<void> {
  await ctx.runMutation(api.btree.init, {
    getKey: await createFunctionHandle(getKey),
    maxNodeSize: 4,
  });
}

export class BTree<
  DataModel extends GenericDataModel,
  T extends TableNamesInDataModel<DataModel>,
  K extends Key,
> {
  constructor(
    private ctx: GenericQueryCtx<DataModel>,
    private api: UsedAPI,
  ) {
  }
  async at(index: number): Promise<{ k: K; v: GenericId<T>; s: number }> {
    const item = await this.ctx.runQuery(this.api.btree.atIndex, { index });
    return item as { k: K; v: GenericId<T>; s: number };
  }
  async indexOf(key: K): Promise<number | null> {
    return await this.ctx.runQuery(this.api.btree.rank, { key: [key] });
  }
  async count(): Promise<number> {
    return await this.ctx.runQuery(this.api.btree.count, { });
  }
  async sum(): Promise<number> {
    return await this.ctx.runQuery(this.api.btree.sum, { });
  }
  async min(): Promise<{ k: K; v: GenericId<T>; s: number } | null> {
    const count = await this.count();
    if (count === 0) {
      return null;
    }
    return await this.at(0);
  }
  async max(): Promise<{ k: K; v: GenericId<T>; s: number } | null> {
    const count = await this.count();
    if (count === 0) {
      return null;
    }
    return await this.at(count - 1);
  }
  // Count keys strictly between k1 and k2.
  async countBetween(k1: K, k2: K): Promise<number> {
    const { count } = await this.ctx.runQuery(this.api.btree.aggregateBetween, { k1: [k1], k2: [k2] });
    return count;
  }
  async sumBetween(k1: K, k2: K): Promise<number> {
    const { sum } = await this.ctx.runQuery(this.api.btree.aggregateBetween, { k1: [k1], k2: [k2] });
    return sum;
  }
  async random(): Promise<{ k: K; v: GenericId<T>; s: number } | null> {
    const count = await this.count();
    if (count === 0) {
      return null;
    }
    const index = Math.floor(Math.random() * count);
    return await this.at(index);
  }
  async validate(): Promise<void> {
    await this.ctx.runQuery(this.api.btree.validate, {});
  }
  // TODO: iter between keys
}
