import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout-shared";
import { source } from "@/lib/source";

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DocsLayout
      tree={source.pageTree}
      sidebar={{ defaultOpenLevel: 1 }}
      {...baseOptions}
    >
      {children}
    </DocsLayout>
  );
}
