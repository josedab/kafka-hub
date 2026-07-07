import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { site } from "@/lib/site";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="font-semibold tracking-tight">{site.shortName}</span>
    ),
    url: "/",
  },
  githubUrl: site.repo,
  links: [
    { text: "Learn", url: "/learn", active: "nested-url" },
    { text: "Diagnose", url: "/diagnose" },
    { text: "Simulate", url: "/simulate" },
    { text: "Runbooks", url: "/runbooks", active: "nested-url" },
  ],
};
