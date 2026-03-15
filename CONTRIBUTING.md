# Contributing to Skipper

## Commit Convention

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code change that is neither a fix nor a feature
- `chore` — build process, dependency updates, tooling
- `test` — adding or fixing tests

**Examples:**
```
feat(playwright): add auto-skip fixture
fix(core): handle empty disabledUntil cell correctly
docs(jest): update setup instructions in README
chore: upgrade googleapis to v141
```

## Pull Request Workflow

1. **Branch** — create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Develop** — make your changes, following the code style (run `pnpm lint` and `pnpm format`)

3. **Verify** — before opening a PR, ensure:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   ```

4. **Open a PR** — PRs must:
   - Have a descriptive title following conventional commit format
   - Pass all CI checks (lint + typecheck + build) automatically run by GitHub Actions
   - Be reviewed and approved before merging

5. **Merge** — PRs are merged via **squash merge** into `main`. The squash commit message must follow the conventional commit format.

## Rules

- No direct commits to `main`
- No `--no-verify` to bypass hooks
- All CI checks must pass before merge
- Keep PRs focused — one feature or fix per PR

## Development Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

## Package Structure

Each package lives in `packages/<name>/`. When adding a new package:
1. Create the directory with `src/`, `package.json`, `tsconfig.json`, `tsup.config.ts`, `README.md`, `LICENSE`
2. Add `"@get-skipper/<name>": "workspace:*"` to any dependent packages
3. Ensure `publishConfig.access` is set to `"public"` in `package.json`
