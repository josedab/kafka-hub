import type { Metadata } from "next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout-shared";
import { notesSource } from "@/lib/source";

export const metadata: Metadata = {
  title: "Field Notes",
  description:
    "Versioned engineering notes, experiments, and operating observations for Kafka practitioners.",
};

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-fd-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fd-background focus:shadow-lg focus:outline-none"
    >
      Skip to main content
    </a>
  );
}

export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SkipLink />
      <div id="main-content" tabIndex={-1}>
        <DocsLayout
          tree={notesSource.pageTree}
          sidebar={{ defaultOpenLevel: 1 }}
          {...baseOptions}
        >
          {children}
        </DocsLayout>
      </div>
    </>
  );
}
