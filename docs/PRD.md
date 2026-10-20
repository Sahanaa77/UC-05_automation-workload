# WorkloadLens — PRD
**Title:** WorkloadLens: Model-Based Verification & Counterexample Engine for SaaS Entitlement Workflows
**Track:** SaaS – Entitlements and usage workflow

## One-liner
A local developer workbench that systematically explores bounded event sequences (reordered/duplicated webhooks, concurrent ops, interrupted handlers), checks developer-defined entitlement and tenant-isolation invariants, minimizes failing traces into counterexamples, lets the dev validate a fix, and exports a regression test for CI/CD.

## Problem (4 challenges to demonstrate)
1. Race conditions / event reordering (late, out-of-order, duplicate webhooks)
2. State drift / incomplete transitions (handler fails midway; DB vs cache diverge)
3. Cross-tenant isolation violations (bad scoping, cache keys)
4. Limited regression coverage (no reproducible test after a fix)

## 3 pillars
| Pillar | Capability | Demo evidence |
|---|---|---|
| Bounded Model Exploration | event orderings, duplicates, concurrency, interruptions within limits | auto-discovers failure in a subscription upgrade scenario |
| Invariant Checking | feature access, usage limits, tenant isolation | flags unauthorized premium access / cross-tenant violation |
| Counterexample Engine | minimize failing trace, preserve violation | shows simplified sequence, exports regression test |

## Differentiators (use this wording in UI copy)
Systematic event exploration · Counterexample minimization · Entitlement-specific invariants as first-class rules · Regression test generation. We do NOT claim to invent model checking or generic chaos testing.

## 6-step workflow (UI stepper must mirror exactly)
1 Model & Define → 2 Bounded Exploration → 3 Violation & Minimization → 4 Inspect State Diff → 5 Fix & Retest (loops back to 2 as "Re-Verification Pass") → 6 Regression Export

## Constraints (show in an "About / Boundaries" panel)
- Model accuracy: verifies the developer-defined model / instrumented adapter, not uninstrumented source.
- Bounded exploration: configurable step limits.
- Sandbox: no real payment-provider transactions.

## Out of scope
Auth, multi-user, real Stripe, real source-code instrumentation, Rust engine.
