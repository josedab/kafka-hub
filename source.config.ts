import { defineDocs, defineConfig, frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const learn = defineDocs({
  dir: "content/learn",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string().optional(),
      scenarios: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
});

export const runbooks = defineDocs({
  dir: "content/runbooks",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  },
});

export const notes = defineDocs({
  dir: "content/notes",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.string(),
      tags: z.array(z.string()),
      kind: z.enum(["field-note", "experiment"]),
      reviewedAgainst: z.string().optional(),
      featured: z.boolean().optional(),
    }),
  },
});

export default defineConfig();
