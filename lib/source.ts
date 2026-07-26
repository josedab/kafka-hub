import { loader } from "fumadocs-core/source";
import { learn, notes, runbooks } from "@/.source/server";

export const source = loader({
  baseUrl: "/learn",
  source: learn.toFumadocsSource(),
});

export const runbookSource = loader({
  baseUrl: "/runbooks",
  source: runbooks.toFumadocsSource(),
});

export const notesSource = loader({
  baseUrl: "/notes",
  source: notes.toFumadocsSource(),
});
