# UI Spec
Look: clean developer tool, light theme, blue palette (primary #1D4ED8, soft blue panels #EFF6FF, red #EF4444 violations, green #22C55E pass), rounded cards, Inter font. shadcn/ui components, Lucide icons, Recharts for charts.

## Shell
Top bar: "WorkloadLens" logo + tagline "Model-based verification for SaaS entitlements". Horizontal 6-step stepper (Model & Define · Bounded Exploration · Violation & Minimization · Inspect State Diff · Fix & Retest · Regression Export) — current step highlighted, clickable. Header right: Run History drawer (past runs + saved models from Postgres; click to reopen). Footer link: "Boundaries" dialog (3 constraints from PRD).

## Screens (React Router, single app state via context)
1. **Model & Define** — left: JSON/YAML editor (textarea with mono font) preloaded with sample; right: parsed summary cards (tenants, plans, transitions, invariants). Buttons: Validate, Save, Load sample. Errors inline.
2. **Bounded Exploration** — bound controls (max_depth slider, max_retries, max_concurrency, toggles: duplicates/reorder/interrupt, max_states, seed) + Run. While running (poll every 300 ms): live progress bar + real-time timeline feed of violations as they are found. Then: stat cards (states explored, violations, ms), Recharts bar (states by depth) and bar (violations by invariant), violations list with severity badges; click → go to step 3.
3. **Violation & Minimization** — shows original trace length vs minimal, "Minimize" button with animated removal of non-essential events (struck-through then removed), shows replays count, final 4-step list.
4. **Inspect State Diff** — step-by-step playback (prev/next/play) over minimal trace; timeline with event chips; subscription state-machine graph (SVG nodes free/pro/cancelled, edges = allowed transitions, observed path overlaid) with the offending transition highlighted red; side-by-side Expected (green) vs Observed (red) JSON diff for tenant state; tenant A/B panels when INV-3.
5. **Fix & Retest** — toggle/button "Apply fix (fixed=true)" with the 4 bug→fix descriptions; Re-run counterexample → PASS badge; "Re-Verification Pass" button runs full exploration and shows 0 violations.
6. **Regression Export** — code preview (pytest, syntax-monospaced), format tabs (pytest | JSON), Copy and Download buttons, one-click "Export CI suite" (all counterexamples of the run + GitHub Actions snippet), "Runnable in CI" note with sample `pytest` command.

## Quality bar
Loading/empty/error states on every screen; no hardcoded metrics; responsive ≥1280px primary; keyboard focus visible.
