# WorkloadLens — Agent Rules
Hackathon prototype: model-based verification + counterexample engine for SaaS entitlement workflows.
Source of truth = /docs. Read, don't re-derive.

Every row in docs/COVERAGE.md is required.

## Read order (once per phase)
docs/PRD.md → ARCHITECTURE.md → ENGINE_SPEC.md → UI_SPEC.md → BUILD_PLAN.md

## Fixed stack (do not substitute)
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + Recharts + Lucide
- Backend/engine: Python 3.12 + FastAPI + Pydantic v2
- Storage: PostgreSQL 16 (JSONB) via Docker Compose
- Tooling: Docker Compose + Taskfile (`task up`), pyproject.toml
- Engine runs in-memory behind `EngineProtocol` (Rust FFI is roadmap, not built)

## Working rules (save quota)
1. Do ONLY the phase requested. Never start the next phase.
2. Plan in ≤10 lines, then implement. No long explanations. Final reply ≤5 lines.
3. Write each file completely in one pass. Don't rewrite files to tweak.
4. Verify via terminal only (pytest, tsc --noEmit, vite build, curl). No browser/screenshot checks except Phase 5.
5. No extra dependencies beyond ARCHITECTURE.md unless unavoidable.
6. When blocked, pick the simplest option consistent with the docs, log it under "Decisions" in BUILD_PLAN.md, continue. Don't ask questions.
7. End of phase: tick checkboxes in BUILD_PLAN.md, then stop.

## Product constraints (must hold)
- Verifies the developer-defined model / instrumented adapter, not arbitrary source code.
- Exploration is bounded and configurable.
- Sandbox only: no real Stripe/payment calls; all events simulated.
- Deterministic: same model + bounds + seed ⇒ same result.
- UI shows only measured numbers (states explored, ms). Never hardcode fake metrics.

## Done = `task dev` then the flow in docs/DEMO_SCRIPT.md works offline end to end.
