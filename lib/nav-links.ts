/**
 * Authoritative navigation link registry.
 *
 * Single source of truth for all top-level navigation links.
 * Used by SiteHeader (custom) and baseOptions.links (Fumadocs layouts).
 */

import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export interface NavLink {
  /** Display label */
  text: string;
  /** Route path */
  url: string;
  /** Fumadocs active matching mode */
  active?: "nested-url" | "url";
}

/**
 * All top-level navigation links in display order.
 * Includes all top-level surfaces for nav parity.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { text: "Learn", url: "/learn", active: "nested-url" },
  { text: "Field Notes", url: "/notes", active: "nested-url" },
  { text: "Diagnose", url: "/diagnose" },
  { text: "Simulate", url: "/simulate" },
  { text: "Protocol", url: "/protocol", active: "nested-url" },
  { text: "Runbooks", url: "/runbooks", active: "nested-url" },
  { text: "Errors", url: "/errors", active: "nested-url" },
  { text: "KIPs", url: "/kips" },
  { text: "Workbench", url: "/workbench", active: "nested-url" },
] as const;

/**
 * Convert to Fumadocs BaseLayoutProps.links format.
 */
export function toFumadocsLinks(): BaseLayoutProps["links"] {
  return NAV_LINKS.map((link) => ({
    text: link.text,
    url: link.url,
    ...(link.active ? { active: link.active } : {}),
  }));
}
