import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { evaluate, type Severity } from "@/lib/diagnostic-rules";
import { LruCache } from "@/lib/lru-cache";
import { take } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface LlmFinding {
  title: string;
  detail: string;
  severity: Severity;
}

interface LlmResponse {
  configured: boolean;
  cached: boolean;
  findings: LlmFinding[];
  rationale?: string;
  error?: string;
}

interface GenerateTextInput {
  apiKey: string;
  model: string;
  system: string;
  userPrompt: string;
}

type GenerateTextResult =
  | { available: false }
  | { available: true; text: string };

interface LlmRouteDependencies {
  take: typeof take;
  cache: LruCache<LlmFinding[]>;
  getApiKey: () => string | undefined;
  getModel: () => string | undefined;
  generateText: (input: GenerateTextInput) => Promise<GenerateTextResult>;
}

const cache = new LruCache<LlmFinding[]>(256);

const SYSTEM_PROMPT = `You are an experienced Apache Kafka platform engineer reviewing a configuration paste.

The user is interested in WHAT IS MISSING or SUBTLY WRONG that a static rule engine would not catch — for example, parameters that interact poorly, defaults left in place for production workloads, or workload-context suggestions.

Respond ONLY with a JSON object of shape:
{ "findings": [ { "title": string, "detail": string, "severity": "danger" | "warning" | "info" } ], "rationale": string }

Constraints:
- Max 5 findings.
- Each detail is 1–3 sentences. Be specific, name parameter values.
- Severity must be one of: danger, warning, info.
- Do not duplicate findings from the static rule engine (provided to you).
- Output JSON only, no surrounding prose.`;

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function fallback(): LlmResponse {
  return {
    configured: false,
    cached: false,
    findings: [],
  };
}

async function generateAnthropicText({
  apiKey,
  model,
  system,
  userPrompt,
}: GenerateTextInput): Promise<GenerateTextResult> {
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default;
  } catch {
    return { available: false };
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = message.content
    .map((content) => (content.type === "text" ? content.text : ""))
    .join("");

  return { available: true, text };
}

const defaultDependencies: LlmRouteDependencies = {
  take,
  cache,
  getApiKey: () => process.env.ANTHROPIC_API_KEY,
  getModel: () => process.env.ANTHROPIC_MODEL,
  generateText: generateAnthropicText,
};

export function createPostHandler(
  overrides: Partial<LlmRouteDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function post(req: Request) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "anonymous";

    if (!dependencies.take(`llm:${ip}`)) {
      return NextResponse.json<LlmResponse>(
        {
          configured: true,
          cached: false,
          findings: [],
          error: "Rate limit exceeded. Try again in a minute.",
        },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json<LlmResponse>(
        {
          configured: true,
          cached: false,
          findings: [],
          error: "Invalid JSON body.",
        },
        { status: 400 },
      );
    }

    const config = (body as { config?: unknown })?.config;
    if (typeof config !== "string" || config.length === 0) {
      return NextResponse.json<LlmResponse>(
        {
          configured: true,
          cached: false,
          findings: [],
          error: "Body must include a non-empty `config` string.",
        },
        { status: 400 },
      );
    }
    if (config.length > 16_000) {
      return NextResponse.json<LlmResponse>(
        {
          configured: true,
          cached: false,
          findings: [],
          error: "Config exceeds 16KB. Trim and retry.",
        },
        { status: 413 },
      );
    }

    const apiKey = dependencies.getApiKey();
    if (!apiKey) {
      return NextResponse.json<LlmResponse>(fallback());
    }

    const cacheKey = hash(config);
    const cached = dependencies.cache.get(cacheKey);
    if (cached) {
      return NextResponse.json<LlmResponse>({
        configured: true,
        cached: true,
        findings: cached,
      });
    }

    const staticReport = evaluate(config);
    const userPrompt = `Static rule engine already flagged these ${staticReport.findings.length} findings (do not duplicate):
${staticReport.findings.map((f) => `- [${f.severity}] ${f.title}`).join("\n") || "(none)"}

Config:
\`\`\`
${config}
\`\`\``;

    try {
      const generated = await dependencies.generateText({
        apiKey,
        model: dependencies.getModel() ?? "claude-3-5-sonnet-latest",
        system: SYSTEM_PROMPT,
        userPrompt,
      });
      if (!generated.available) {
        return NextResponse.json<LlmResponse>(fallback());
      }

      const jsonMatch = generated.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json<LlmResponse>({
          configured: true,
          cached: false,
          findings: [],
          error: "Model returned no parseable JSON.",
        });
      }
      const parsed = JSON.parse(jsonMatch[0]) as {
        findings?: LlmFinding[];
        rationale?: string;
      };
      const findings = (parsed.findings ?? []).slice(0, 5).map((finding) => ({
        title: String(finding.title ?? "").slice(0, 200),
        detail: String(finding.detail ?? "").slice(0, 800),
        severity: (["danger", "warning", "info"] as const).includes(
          finding.severity as Severity,
        )
          ? (finding.severity as Severity)
          : ("info" as const),
      }));

      dependencies.cache.set(cacheKey, findings);

      return NextResponse.json<LlmResponse>({
        configured: true,
        cached: false,
        findings,
        rationale: parsed.rationale,
      });
    } catch (err) {
      return NextResponse.json<LlmResponse>(
        {
          configured: true,
          cached: false,
          findings: [],
          error: err instanceof Error ? err.message : "LLM call failed.",
        },
        { status: 502 },
      );
    }
  };
}

export const POST = createPostHandler();
