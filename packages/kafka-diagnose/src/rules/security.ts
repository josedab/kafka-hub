/**
 * Security configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { bool, replaceFix } from "./helpers";

export const securityRules: RuleWithFix[] = [
  {
    id: "plaintext-listener-in-prod",
    category: "security",
    evaluate(c) {
      const listeners = c["listeners"] ?? c["advertised.listeners"];
      if (!listeners) return null;
      if (/PLAINTEXT:\/\//.test(listeners) && !/SSL:\/\/|SASL/.test(listeners))
        return {
          severity: "warning",
          title: "PLAINTEXT listeners with no SSL/SASL alternative",
          detail:
            "Production clusters should require encryption + auth. Add an SSL or SASL_SSL listener and use 'security.inter.broker.protocol' to lock down replication traffic.",
          // No safe fix: requires cert/SASL infra not deducible from config
        };
      return null;
    },
  },
  {
    id: "ssl-endpoint-identification-disabled",
    category: "security",
    evaluate(c) {
      const v = c["ssl.endpoint.identification.algorithm"];
      if (v === undefined) return null;
      if (v === "" || v.toLowerCase() === "none" || v.toLowerCase() === "")
        return {
          severity: "danger",
          title: "ssl.endpoint.identification.algorithm disabled — MITM possible",
          detail:
            "An empty value disables hostname verification of the broker's certificate. Anyone with a valid cert signed by the trusted CA could impersonate the broker. Keep this at 'https' (the default).",
          fix: {
            before: `ssl.endpoint.identification.algorithm=${v || "(empty)"}`,
            after: "ssl.endpoint.identification.algorithm=https",
          },
          structuredFix: replaceFix(
            "Re-enable hostname verification",
            "ssl.endpoint.identification.algorithm",
            v,
            "https",
          ),
        };
      return null;
    },
  },
  {
    id: "allow-everyone-if-no-acl-true",
    category: "security",
    evaluate(c) {
      if (bool(c["allow.everyone.if.no.acl.found"]) !== true) return null;
      return {
        severity: "warning",
        title: "allow.everyone.if.no.acl.found=true defeats the ACL system",
        detail:
          "Any topic without an explicit ACL is wide open. Useful in a single-tenant development cluster, dangerous everywhere else. Default to false and explicitly grant access.",
        fix: {
          before: "allow.everyone.if.no.acl.found=true",
          after: "allow.everyone.if.no.acl.found=false",
        },
        structuredFix: replaceFix(
          "Deny by default when no ACL found",
          "allow.everyone.if.no.acl.found",
          "true",
          "false",
        ),
      };
    },
  },
  {
    id: "super-users-empty",
    category: "security",
    evaluate(c) {
      if (c["authorizer.class.name"] === undefined) return null;
      if (c["super.users"] === undefined || c["super.users"].trim() === "")
        return {
          severity: "info",
          title: "authorizer enabled with no super.users configured",
          detail:
            "Without super.users, even your admin tooling needs explicit ACLs for every operation. Usually you want at least one principal in super.users for operations.",
          // No safe fix: requires knowing the admin principal
        };
      return null;
    },
  },
];
