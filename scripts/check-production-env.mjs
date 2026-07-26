#!/usr/bin/env node

import { pathToFileURL } from "node:url";

function isPresent(value) {
  return Boolean(value?.trim());
}

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function validateSiteUrl(raw, allowLocalhostHttp) {
  const value = raw?.trim();
  if (!value) {
    return "NEXT_PUBLIC_SITE_URL is required for a production deployment.";
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return "NEXT_PUBLIC_SITE_URL must be a valid URL origin.";
  }

  if (url.username || url.password) {
    return "NEXT_PUBLIC_SITE_URL must not contain credentials.";
  }
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.href !== `${url.origin}/`
  ) {
    return "NEXT_PUBLIC_SITE_URL must be an origin without a path, query, or fragment.";
  }

  if (url.protocol === "https:") return null;
  if (
    url.protocol === "http:" &&
    allowLocalhostHttp &&
    isLocalHostname(url.hostname)
  ) {
    return null;
  }
  return allowLocalhostHttp
    ? "NEXT_PUBLIC_SITE_URL must use HTTPS; --local permits HTTP only for localhost."
    : "NEXT_PUBLIC_SITE_URL must use HTTPS for production.";
}

export function validateProductionEnvironment(
  env,
  { allowLocalhostHttp = false } = {},
) {
  const errors = [];
  const warnings = [];

  const siteUrlError = validateSiteUrl(
    env.NEXT_PUBLIC_SITE_URL,
    allowLocalhostHttp,
  );
  if (siteUrlError) errors.push(siteUrlError);

  if (isPresent(env.ANTHROPIC_API_KEY) && !isPresent(env.ANTHROPIC_MODEL)) {
    errors.push(
      "ANTHROPIC_MODEL is required when ANTHROPIC_API_KEY is configured.",
    );
  }

  const trustProxyHeaders = env.TRUST_PROXY_HEADERS?.trim();
  if (
    trustProxyHeaders &&
    trustProxyHeaders !== "true" &&
    trustProxyHeaders !== "false"
  ) {
    errors.push("TRUST_PROXY_HEADERS must be either true or false when set.");
  } else if (trustProxyHeaders === "true") {
    warnings.push(
      "TRUST_PROXY_HEADERS=true requires a trusted deployment proxy that overwrites forwarding headers.",
    );
  }

  return { errors, warnings };
}

function printUsage() {
  console.log(
    "Usage: pnpm check:production-env [--local]\n" +
      "  --local  Allow an HTTP NEXT_PUBLIC_SITE_URL only for localhost.",
  );
}

export function run(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("--help")) {
    printUsage();
    return 0;
  }

  const unknown = argv.filter((argument) => argument !== "--local");
  if (unknown.length > 0) {
    console.error(`Unknown option: ${unknown[0]}`);
    printUsage();
    return 1;
  }

  const result = validateProductionEnvironment(env, {
    allowLocalhostHttp: argv.includes("--local"),
  });

  for (const error of result.errors) console.error(`ERROR: ${error}`);
  for (const warning of result.warnings) console.warn(`REMINDER: ${warning}`);

  if (result.errors.length > 0) return 1;
  console.log("Production environment check passed.");
  return 0;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  process.exitCode = run();
}
