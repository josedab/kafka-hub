import { CANONICAL_ORIGIN } from "./canonical-origin";

export const site = {
  name: "Kafka Engineering Hub",
  shortName: "Kafka Hub",
  tagline:
    "Interactive learning, diagnostics, runbooks, references, and an in-browser simulator for Kafka engineers.",
  description:
    "Open-source resource for engineers working with Apache Kafka. Interactive articles on internals, a configuration diagnostic engine, incident runbooks, reference catalogs, and a deterministic in-browser broker simulator.",
  url: CANONICAL_ORIGIN,
  repo: "https://github.com/josedab/kafka-hub",
  author: "Jose David Baena",
  surfaces: [
    {
      slug: "learn",
      title: "Learn",
      blurb:
        "Long-form articles with embedded interactive demos. ISR, rebalances, the controller, exactly-once.",
      href: "/learn",
    },
    {
      slug: "diagnose",
      title: "Diagnose",
      blurb:
        "Paste a broker, topic or client config. Get graded findings in under a minute. No live cluster.",
      href: "/diagnose",
    },
    {
      slug: "simulate",
      title: "Simulate",
      blurb:
        "A deterministic in-browser Kafka. Step time, kill brokers, induce rebalances, watch ISR shrink.",
      href: "/simulate",
    },
    {
      slug: "runbooks",
      title: "Runbooks",
      blurb:
        "Five-minute production playbooks for lag, broker restarts, controller churn, and stuck transactions.",
      href: "/runbooks",
    },
    {
      slug: "errors",
      title: "Errors",
      blurb:
        "A Kafka exception catalog with retriability, root causes, fixes, and local cross-links.",
      href: "/errors",
    },
    {
      slug: "kips",
      title: "KIPs",
      blurb:
        "A searchable KIP index for protocol, replication, transactions, KRaft, and consumer group changes.",
      href: "/kips",
    },
    {
      slug: "workbench",
      title: "Workbench",
      blurb:
        "Interactive triage and analysis tools for Kafka incidents. Paste evidence, get structured hypotheses.",
      href: "/workbench",
    },
  ],
} as const;
