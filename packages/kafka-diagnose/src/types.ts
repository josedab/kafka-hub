export type Severity = "danger" | "warning" | "info";

export type Category =
  | "validation"
  | "broker"
  | "topic"
  | "producer"
  | "consumer"
  | "security"
  | "transactions"
  | "performance";

export interface DiagnosticFinding {
  ruleId: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  /** Optional slug under /learn that explains the relevant concept. */
  learnSlug?: string;
  /** Optional slug under /simulate that reproduces the failure. */
  simulateSlug?: string;
  /**
   * Optional before/after pair showing the smallest config change that
   * resolves the finding. UI may render as a diff + copy button.
   */
  fix?: {
    before: string;
    after: string;
  };
}

export interface DiagnosticReport {
  parsedKeys: number;
  findings: DiagnosticFinding[];
  stats: Record<Severity, number>;
}

export interface Rule {
  id: string;
  category: Category;
  /**
   * Return a single finding, an array of findings, or null/undefined for "no
   * issue". The wrapper attaches the ruleId so individual rules do not have
   * to repeat it.
   */
  evaluate(
    config: Record<string, string>,
  ):
    | Omit<DiagnosticFinding, "ruleId" | "category">
    | Omit<DiagnosticFinding, "ruleId" | "category">[]
    | null
    | undefined;
}
