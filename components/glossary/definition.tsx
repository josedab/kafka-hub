import Link from "next/link";
import { Fragment } from "react";
import { findGlossaryTerm, learnArticleTitles } from "./terms";

type GlossaryDefinitionProps = {
  term: string;
};

export function GlossaryDefinition({ term }: GlossaryDefinitionProps) {
  const entry = findGlossaryTerm(term);

  if (!entry) {
    return (
      <p className="text-sm text-fd-muted-foreground">
        Glossary definition not found for <code>{term}</code>.
      </p>
    );
  }

  return (
    <dl className="not-prose mb-10 overflow-hidden rounded-2xl border border-fd-border bg-fd-card/60 shadow-sm">
      <div className="grid gap-4 p-5 sm:grid-cols-[9rem_1fr] sm:p-6">
        <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-fd-muted-foreground">
          Expansion
        </dt>
        <dd className="font-mono text-sm text-fd-foreground">
          {entry.expansion}
        </dd>

        <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-fd-muted-foreground">
          Definition
        </dt>
        <dd className="space-y-3 text-sm leading-7 text-fd-muted-foreground">
          <p>{entry.definition.join(" ")}</p>
        </dd>

        <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-fd-muted-foreground">
          Deep dive
        </dt>
        <dd className="text-sm leading-7 text-fd-muted-foreground">
          Explained in{" "}
          {entry.articleSlugs.map((slug, index) => (
            <Fragment key={slug}>
              {index > 0 ? " and " : null}
              <Link
                href={`/learn/${slug}`}
                className="font-medium text-fd-foreground underline decoration-fd-muted-foreground decoration-dotted underline-offset-4 transition-colors hover:decoration-fd-foreground"
              >
                {learnArticleTitles[slug]}
              </Link>
            </Fragment>
          ))}
          .
        </dd>
      </div>
    </dl>
  );
}
