# Security policy

## Supported versions

Security fixes are applied to the current `main` branch and the latest tagged
release. Older releases are not maintained.

## Report a vulnerability privately

Use [GitHub Security Advisories](https://github.com/josedab/kafka-hub/security/advisories/new)
to send a private report. Do not open a public issue for a suspected
vulnerability.

Include:

- the affected route, component, version, or commit
- clear reproduction steps or a minimal proof of concept
- the expected impact and realistic attack conditions
- browser/runtime/deployment details where relevant
- a suggested remediation, if you have one

Do not include API keys, credentials, customer data, or unsanitized Kafka
configuration. Replace sensitive values with obvious placeholders.

## What to expect

The maintainer will make a best-effort acknowledgement within five business
days, validate the report, and coordinate a fix and disclosure timeline based
on severity. Please keep details private until a fix is available and a
disclosure date is agreed.

This project does not currently operate a paid bug-bounty program. Good-faith
research that avoids privacy violations, service disruption, and access to
other people's data is welcome.

Deployment controls and trust boundaries are documented in
[`docs/production.md`](docs/production.md).
