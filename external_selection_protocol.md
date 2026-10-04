# Protocol for Selecting External Express.js Benchmark Controllers

**Date of Protocol Formulation:** 2026-10-04  
**Author Independence Policy:** No hand-picking; selection is fully algorithmic and auditable.

This document establishes the formal, deterministic protocol for constructing an external evaluation dataset of 25 real-world Express.js controllers from third-party open-source repositories to complement the hand-authored dataset.

---

## 1. Source

- **Search Platform:** GitHub Search API and public repositories.
- **Query Date:** 2026-10-04.
- **Exact Search Query:**
  ```text
  express stars:>=50 language:JavaScript "type": "module"
  ```
  Complementary query for Express backends:
  ```text
  express backend stars:>=50 language:JavaScript
  ```
- **Rationale:** Targets public, actively maintained Express.js backends with demonstrated community traction and modern JavaScript standards.

---

## 2. Repository Inclusion Criteria

To be included in the candidate pool, a repository must satisfy all of the following:

1. **Permissive Open-Source License:** Must be licensed under MIT, Apache-2.0, BSD-2-Clause, or BSD-3-Clause. The license text must be verified from the repository's `LICENSE`, `LICENSE.md`, or `LICENSE.txt` file (or `package.json` license identifier verified against file headers).
2. **Pinned Commit Hash:** The repository must be checked out at an exact, pinned Git commit hash (SHA) to guarantee strict reproducibility.
3. **Authorship Independence:** The repository must not be authored, co-authored, or maintained by GitHub user `kanishkbairagi` (author of the benchmark suite).
4. **Community Traction:** The repository must have at least 50 GitHub stars (`stargazers_count >= 50`).
5. **Native ESM on Node 22:** The repository must support native ES Modules (specifying `"type": "module"` in `package.json` or utilizing `.mjs` extensions) and must evaluate under Node.js 22 without requiring code edits or pre-compilation (no TypeScript compile step, Babel transpilation, or bundling required).

---

## 3. File Inclusion Criteria

Within included repositories, candidate files are inspected against the following filters:

1. **Functional Role:** Must be a controller or route-handler module (located under `controllers/`, `handlers/`, `routes/`, `api/`, or named with `*controller*`, `*handler*`, or `*route*`).
2. **File Length:** Must be between 40 and 300 physical lines of code inclusive ($40 \le \text{LOC} \le 300$). Trivial stubs (<40 LOC) and sprawling monoliths (>300 LOC) are excluded.
3. **Handler Exports:** Must export at least 3 distinct route handlers, controller action functions, or middleware functions (functions accepting `(req, res)` or an exported object/router containing $\ge 3$ action endpoints).
4. **Local Import Closure:** The local import closure—defined as the recursive set of relative project files (`./` or `../`) imported directly or transitively by the controller—must contain at most 5 files ($\le 5$). Computed automatically via static AST / regex import parsing.
5. **Import-Time Isolation:** The file must not execute blocking network requests, listen on network ports, or mandate active database connections at module evaluation time (`import`). Modules that crash on import without environment-specific daemon configurations are excluded.

---

## 4. Deterministic Selection Algorithm

1. **Determinism & No Hand-Picking:** Repositories are traversed in a fixed, documented order (lexicographical repository full name `owner/repo`).
2. **Alphabetical Path Order:** Within each eligible repository, all eligible files are sorted in lexicographical path order.
3. **Repository Quota:** At most 3 qualifying files are selected from any single repository to ensure architectural and domain diversity.
4. **Stopping Condition:** Selection stops deterministically as soon as exactly 25 qualifying files have been accumulated.
5. **Exclusion Audit Trail:** Every repository and candidate file evaluated must be recorded in an exclusions list detailing the exact reason for disqualification (e.g., `license_not_permissive`, `stars_under_50`, `commonjs_only`, `loc_out_of_bounds`, `insufficient_handlers`, `import_closure_exceeded`, `import_time_side_effects`).
