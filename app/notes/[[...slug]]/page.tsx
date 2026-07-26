import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { notesSource } from "@/lib/source";

const notesDescription =
  "Release-aware field reports, protocol experiments, and engineering decisions from the Kafka edge.";

type Params = { slug?: string[] };
type NotePage = ReturnType<typeof notesSource.getPages>[number];

function noteDate(page: NotePage): Date {
  const date = page.data.date ? new Date(page.data.date) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getNotes() {
  return notesSource
    .getPages()
    .filter((page) => page.slugs.length > 0)
    .sort((a, b) => noteDate(b).getTime() - noteDate(a).getTime());
}

function kindLabel(kind: "field-note" | "experiment") {
  return kind === "experiment" ? "Experiment log" : "Field note";
}

function NotesIndex() {
  const notes = getNotes();

  return (
    <DocsPage toc={[]} full={false}>
      <div className="field-notes-masthead not-prose">
        <p className="field-notes-kicker">Kafka Engineering Hub / Field Notes</p>
        <DocsTitle>Field Notes</DocsTitle>
        <DocsDescription>{notesDescription}</DocsDescription>
        <div className="field-notes-rule" aria-hidden />
        <p className="max-w-2xl text-sm leading-6 text-fd-muted-foreground">
          These are dated working records rather than evergreen doctrine:
          what changed, what was tested, what remains uncertain, and where to
          verify the primary evidence before acting in production.
        </p>
      </div>

      <ol className="field-notes-index not-prose mt-10">
        {notes.map((note, index) => {
          const kind = note.data.kind;
          const date = noteDate(note);
          return (
            <li key={note.url} className="field-notes-entry">
              <div className="field-notes-entry-meta">
                <span className="font-mono text-[11px] tracking-[0.14em]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <time dateTime={note.data.date}>{formatDate(date)}</time>
              </div>
              <Link
                href={note.url}
                className="field-notes-entry-link group"
                data-testid={`field-note-${note.slugs.join("-")}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="field-notes-kind">{kindLabel(kind)}</span>
                  {note.data.featured ? (
                    <span className="field-notes-featured">Dispatch</span>
                  ) : null}
                  {note.data.reviewedAgainst ? (
                    <span className="field-notes-review">
                      {note.data.reviewedAgainst}
                    </span>
                  ) : null}
                </div>
                <h2>{note.data.title}</h2>
                <p>{note.data.description}</p>
                <div className="field-notes-tags">
                  {note.data.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="field-notes-footer-mark not-prose">
        <span>END OF CURRENT LOG</span>
        <Link href="/notes/rss.xml">Notes RSS →</Link>
      </div>
    </DocsPage>
  );
}

function NoteHeader({ page }: { page: NotePage }) {
  const kind = page.data.kind;
  return (
    <header className="field-notes-article-header not-prose">
      <div className="flex flex-wrap items-center gap-2">
        <span className="field-notes-kind">{kindLabel(kind)}</span>
        {page.data.reviewedAgainst ? (
          <span className="field-notes-review">{page.data.reviewedAgainst}</span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-fd-muted-foreground">
        <time dateTime={page.data.date}>Filed {formatDate(noteDate(page))}</time>
        <span>Local static reading copy</span>
      </div>
      <div className="field-notes-rule mt-5" aria-hidden />
    </header>
  );
}

export default async function Page(props: { params: Promise<Params> }) {
  const params = await props.params;
  if (!params.slug?.length) return <NotesIndex />;

  const page = notesSource.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <NoteHeader page={page} />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={defaultMdxComponents} />
      </DocsBody>
      <footer className="field-notes-article-footer not-prose">
        <div className="field-notes-rule" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="field-notes-tags">
            {page.data.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <Link href="/notes" className="text-sm font-medium hover:underline">
            ← All Field Notes
          </Link>
        </div>
      </footer>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return [{ slug: [] }, ...notesSource.generateParams()];
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const params = await props.params;
  if (!params.slug?.length) {
    return {
      title: "Field Notes",
      description: notesDescription,
    };
  }

  const page = notesSource.getPage(params.slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
