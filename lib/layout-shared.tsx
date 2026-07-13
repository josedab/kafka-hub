import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { site } from "@/lib/site";
import { toFumadocsLinks } from "@/lib/nav-links";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="font-semibold tracking-tight">{site.shortName}</span>
    ),
    url: "/",
  },
  githubUrl: site.repo,
  links: toFumadocsLinks(),
};
