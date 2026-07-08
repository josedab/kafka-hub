import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout-shared";
import { runbookSource } from "@/lib/source";

export default function RunbooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DocsLayout
      tree={runbookSource.pageTree}
      sidebar={{ defaultOpenLevel: 1 }}
      {...baseOptions}
    >
      {children}
    </DocsLayout>
  );
}
