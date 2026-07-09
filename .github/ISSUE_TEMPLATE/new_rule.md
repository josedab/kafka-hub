---
name: New diagnostic rule
about: Propose a new rule for the Diagnose surface
title: "[rule] "
labels: diagnose, rule-proposal
assignees: ''
---

## Rule summary

<!-- One sentence: "Warn when X is set with Y, because Z." -->

## Category

- [ ] broker
- [ ] topic
- [ ] producer
- [ ] consumer
- [ ] security
- [ ] transactions
- [ ] performance

## Severity

- [ ] info — context only, no action needed
- [ ] warning — likely misconfiguration
- [ ] danger — known footgun, data loss / availability risk

## Trigger conditions

<!--
What config keys (and values) must be present?
Example:
  - `acks=all`
  - `min.insync.replicas=1`
-->

## Why it matters

<!-- Explain the failure mode. Cite Kafka docs / KIPs / incidents if useful. -->

## Suggested fix

<!-- What should the user change? -->

## Link to Learn article

<!-- Existing slug under content/learn, or "needs new article". -->

## Test case

```properties
# minimum config that should trigger this rule
```
