import type {
  KRaftValidationIssue,
  KRaftValidationIssueKind,
} from "./types";

const UNSAFE_HOST_RE = /[^a-zA-Z0-9.\-:\[\]]/;
const SAFE_LISTENER_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function isSafeHost(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > 253) return false;
  return !UNSAFE_HOST_RE.test(s);
}

export function isSafeLabel(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.trim().length === 0 || s.length > 256) return false;
  return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(s);
}

export function isSafeListenerName(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > 128) return false;
  return SAFE_LISTENER_NAME_RE.test(s);
}

export function sanitizeForDisplay(s: string): string {
  if (typeof s !== "string") return "[invalid]";
  const cleaned = s.replace(/[\x00-\x1F\x7F]/g, "");
  if (cleaned.length > 128) return cleaned.slice(0, 125) + "...";
  return cleaned;
}

export function issue(
  kind: KRaftValidationIssueKind,
  field: string,
  message: string,
  severity: "error" | "warning" = "error",
): KRaftValidationIssue {
  return { kind, field, message, severity };
}

export function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

export function isFiniteNonNegInt(n: unknown): n is number {
  return isFiniteInt(n) && n >= 0;
}
