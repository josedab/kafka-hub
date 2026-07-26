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
import { SCENARIOS, type Scenario } from "@kafka-hub/kafka-sim";
import { Badge } from "@/components/ui/badge";
import { cheatsheets } from "@/lib/cheatsheet-data";
import learnMeta from "@/content/learn/meta.json";
import { source } from "@/lib/source";
import { IsrSimulator } from "@/components/demos/isr-simulator";
import { UncleanLeaderTimeline } from "@/components/demos/unclean-leader-timeline";
import { RebalanceVisualizer } from "@/components/demos/rebalance-visualizer";
import { AssignmentExplorer } from "@/components/demos/assignment-explorer";
import { ControllerHandoff } from "@/components/demos/controller-handoff";
import { TransactionLifecycle } from "@/components/demos/transaction-lifecycle";
import { CompactionTimeline } from "@/components/demos/compaction-timeline";
import { RagPipelineSim } from "@/components/demos/rag-pipeline-sim";
import { DiagnoseSnippet } from "@/components/demos/diagnose-snippet";
import { EmbeddingBackpressureSim } from "@/components/demos/embedding-backpressure-sim";
import { AgentTraceTopology } from "@/components/demos/agent-trace-topology";
import { ShareGroupWorkerPool } from "@/components/demos/share-group-worker-pool";
import { SideEffectReplayLab } from "@/components/demos/side-effect-replay-lab";
import { RagFreshnessLab } from "@/components/demos/rag-freshness-lab";
import { AiProtocolDecisionLab } from "@/components/demos/ai-protocol-decision-lab";
import { ModelCanaryReplayLab } from "@/components/demos/model-canary-replay-lab";
import { G } from "@/components/glossary/g";
import { GlossaryDefinition } from "@/components/glossary/definition";
import { ReadingProgress } from "./reading-progress";

type Params = { slug?: string[] };
type TrackLink = { slug: string; title: string; href: string };
type LearningTrack = { title: string; pages: string[] };
type TrackContext = { track: LearningTrack; index: number };

const cheatsheetSlugs = new Set(cheatsheets.map((sheet) => sheet.slug));
const learningTracks = learnMeta.tracks as LearningTrack[];

function getTrackContext(slug: string): TrackContext | null {
  for (const track of learningTracks) {
    const index = track.pages.indexOf(slug);
    if (index >= 0) return { track, index };
  }
  return null;
}

function getTrackLink(trackSlug: string | undefined): TrackLink | null {
  if (!trackSlug) return null;

  const trackPage = source.getPage(trackSlug.split("/"));
  if (!trackPage) return null;

  return {
    slug: trackSlug,
    title: trackPage.data.title,
    href: `/learn/${trackSlug}`,
  };
}

function getRelatedScenarios(slugs: string[] | undefined): Scenario[] {
  const scenarios: Scenario[] = [];

  for (const scenarioSlug of slugs ?? []) {
    const scenario = SCENARIOS[scenarioSlug];
    if (scenario) scenarios.push(scenario);
  }

  return scenarios;
}

export default async function Page(props: { params: Promise<Params> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const slug = page.slugs.join("/");
  const isLearnIndex = page.url === "/learn" || slug === "" || slug === "index";
  const hasCheatsheet = cheatsheetSlugs.has(slug);
  const trackContext = getTrackContext(slug);
  const trackIndex = trackContext?.index ?? -1;
  const trackTotal = trackContext?.track.pages.length ?? 0;
  const previousTrackItem = trackContext
    ? getTrackLink(trackContext.track.pages[trackIndex - 1])
    : null;
  const nextTrackItem = trackContext
    ? getTrackLink(trackContext.track.pages[trackIndex + 1])
    : null;
  const relatedScenarios = getRelatedScenarios(page.data.scenarios);

  return (
    <>
      {isLearnIndex ? null : <ReadingProgress />}
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{
          enabled: !isLearnIndex && !page.data.full,
          container: {
            className:
              "hidden max-lg:hidden lg:flex max-xl:flex lg:layout:[--fd-toc-width:240px] xl:layout:[--fd-toc-width:268px]",
          },
        }}
        tableOfContentPopover={{ enabled: false }}
      >
        <DocsTitle>{page.data.title}</DocsTitle>
        {trackContext ? (
          <Badge tone="success" className="mt-3 w-fit">
            {trackContext.track.title} · Step {trackIndex + 1} of {trackTotal}
          </Badge>
        ) : null}
        <DocsDescription>{page.data.description}</DocsDescription>
        {hasCheatsheet ? (
          <Link
            href={`/learn/cheatsheet/${slug}`}
            className="mt-4 inline-flex underline-offset-4 hover:underline"
          >
            <Badge tone="info">View cheatsheet →</Badge>
          </Link>
        ) : null}
        <DocsBody>
          <MDX
            components={{
              ...defaultMdxComponents,
              IsrSimulator,
              UncleanLeaderTimeline,
              RebalanceVisualizer,
              AssignmentExplorer,
              ControllerHandoff,
              TransactionLifecycle,
              CompactionTimeline,
              RagPipelineSim,
              DiagnoseSnippet,
              EmbeddingBackpressureSim,
              AgentTraceTopology,
              ShareGroupWorkerPool,
              SideEffectReplayLab,
              RagFreshnessLab,
              AiProtocolDecisionLab,
              ModelCanaryReplayLab,
              G,
              GlossaryDefinition,
            }}
          />
        </DocsBody>
        {relatedScenarios.length > 0 ? (
          <RelatedScenarios scenarios={relatedScenarios} />
        ) : null}
        {trackContext ? (
          <TrackNavigation
            current={trackIndex + 1}
            total={trackTotal}
            title={trackContext.track.title}
            previous={previousTrackItem}
            next={nextTrackItem}
          />
        ) : null}
      </DocsPage>
    </>
  );
}

function RelatedScenarios({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <section className="not-prose mt-12 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-fd-card to-fd-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
          Hands-on lab
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-fd-foreground">
          Try it in the simulator
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {scenarios.map((scenario) => (
          <Link
            key={scenario.slug}
            href={`/simulate?scenario=${encodeURIComponent(scenario.slug)}`}
            className="group rounded-xl border border-fd-border bg-fd-background/70 p-4 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10"
          >
            <h3 className="font-medium text-fd-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-200">
              {scenario.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">
              {scenario.blurb}
            </p>
            <span className="mt-4 inline-flex text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Open scenario →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TrackNavigation({
  current,
  total,
  title,
  previous,
  next,
}: {
  current: number;
  total: number;
  title: string;
  previous: TrackLink | null;
  next: TrackLink | null;
}) {
  return (
    <section
      aria-labelledby="track-navigation-heading"
      className="not-prose mt-8 rounded-2xl border border-fd-border bg-fd-card p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-fd-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fd-muted-foreground">
            {title}
          </p>
          <h2
            id="track-navigation-heading"
            className="mt-1 text-lg font-semibold tracking-tight text-fd-foreground"
          >
            Track navigation
          </h2>
        </div>
        <div className="flex items-center gap-3 text-sm text-fd-muted-foreground">
          <span>
            Article {current} of {total}
          </span>
          <div className="flex items-center gap-1.5" aria-hidden>
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={
                  index < current
                    ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                    : "h-1.5 w-1.5 rounded-full bg-fd-border"
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {previous ? (
          <Link
            href={previous.href}
            className="rounded-xl border border-fd-border bg-fd-background/70 p-4 transition-colors hover:border-fd-foreground/30 hover:bg-fd-accent"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-fd-muted-foreground">
              Previously
            </span>
            <span className="mt-2 block font-medium text-fd-foreground">
              {previous.title}
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link
            href={next.href}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/15 sm:text-right"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              Continue
            </span>
            <span className="mt-2 block font-medium text-fd-foreground">
              {next.title} →
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
