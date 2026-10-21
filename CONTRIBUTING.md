# Contributing to WorkloadLens UC-05

Thank you for your interest in contributing to **WorkloadLens** (Automation Workload Preview SaaS).

---

## 1. Architectural Guardrails & Standards

* **Two Product Screens Only:** The application must maintain exactly two user-facing screens: **Run Tools** (`/#/tools`) and **History** (`/#/history`). Do not add unscored administration, analytics, or settings views.
* **Tenant Isolation:** Tenant context is derived strictly from verified identity (`Authorization: Bearer <token>`). Never accept tenant identifiers from request bodies, query strings, or client headers. Requests containing `X-Tenant-Override` or `tenant_id` must be rejected with HTTP 400.
* **Atomic Quota Enforcement:** Quota reservation must remain atomic under high-concurrency contention (`count < limit`).
* **Design System (Contemporary Heritage):** Follow the visual palette: Deep Navy (`#0F1E36`), Antique Gold (`#C5A059`), White (`#FFFFFF`), Mist Gray (`#F4F5F6`), Charcoal (`#1E2229`), and Border Gray (`#E5E7EB`). Avoid purple gradients, glassmorphism, or neon styling.

---

## 2. Local Development Workflow

### Prerequisites
* Python 3.11+
* Node.js 20+
* Terraform 1.6+

### Setup Commands
```bash
# 1. Install backend dependencies
cd backend
pip install -e ".[dev]"
cd ..

# 2. Install frontend dependencies
cd frontend
npm install
cd ..

# 3. Run full verification suite locally
python -m pytest backend/tests/ -v
npm run build --prefix frontend
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
```

---

## 3. Pull Request Guidelines

1. **Clean Branches:** Create feature branches off `main` with descriptive names: `fix/description` or `feat/description`.
2. **Test Coverage:** All changes must maintain 100% pass rate across the 63 backend tests.
3. **No Secrets in VCS:** Never commit `.env` files, database files (`*.db`), state files (`*.tfstate`), or credentials.
4. **Conventional Commits:** Use standard commit messages (e.g. `feat:`, `fix:`, `docs:`, `infra:`).
