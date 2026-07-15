import { createSearchAPI } from "fumadocs-core/search/server";
import { buildSearchIndexes } from "@/lib/search-index";

export const { GET } = createSearchAPI("simple", {
  indexes: buildSearchIndexes,
});
