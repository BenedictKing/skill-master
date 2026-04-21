# CLI JSON Contract

`skill-master` uses `--json` output as its machine-facing interface. Human-readable terminal output is not part of the stable contract.

## Stable v1 schemas

The first batch of formal schemas covers:

- `recommend --json` → `../../schemas/recommend.v1.schema.json`
- `solve --json` → `../../schemas/solve.v1.schema.json`
- `verify --json` → `../../schemas/verify.v1.schema.json`

## Versioning rules

- `--json` output is the machine contract.
- Text output is for humans and is not guaranteed to stay stable.
- v1 schemas reject undeclared fields by default.
- Future breaking changes should ship as a new schema version instead of silently changing `v1`.

## recommend --json

TypeScript contract: `RecommendJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `task`: task profile from `TaskRequirement`
- `preferences`: enabled ranking preferences for the current run
- `recommendations`: ordered recommendation array from `Recommendation`

Notes:

- `recommendations` may be empty.
- preference keys may be omitted when not explicitly enabled.
- recommendation order is meaningful; the first item is the current best match.

## solve --json

TypeScript contract: `SolveJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `task`: task profile
- `preferences`: recommendation preferences
- `candidateCount`: number of discovered candidates
- `recommendations`: ordered recommendation array
- `steps`: orchestrator progress flags
- `summary`: quick summary for callers
- `installation`: optional, present after successful `--install`
- `verification`: optional, present after successful `--verify`

Notes:

- `steps.installed` should stay aligned with `installation` presence.
- `steps.verified` should stay aligned with `verification` presence.
- `summary.bestMatch` is `null` when no recommendation is available.

## verify --json

TypeScript contract: `VerifyJsonV1` (`src/types/contracts.ts`)

Top-level fields:

- `skillName`: target skill name
- `envStatus`: `configured | missing | partial`
- `envMissingKeys`: missing env keys
- `dependencyWarnings`: runtime/dependency warnings
- `conflicts`: detected conflicts
- `messages`: verification messages
- `structureHealthy`: whether the installed structure is healthy
- `smokePassed`: whether smoke checks passed

Notes:

- every `messages` entry includes `severity` and `message`
- `dependencyWarnings` and `conflicts` may be empty arrays

## Documented contracts without schema in this round

The following commands now have named TypeScript contracts and documentation, but no dedicated schema in this round:

- `find --json` → `FindJsonV1`
- `inspect --json` → `InspectJsonV1`
- `compose --json` → `ComposeJsonV1`
