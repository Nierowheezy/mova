# Sanctions / PEP datasets

The API screens customers at KYC approval using local OpenSanctions CSV
exports. The dataset files are **git-ignored** — deliberately: they are large,
refresh frequently, and should never end up in source control.

## Download

OpenSanctions publishes consolidated, free lists of sanctions targets
(OFAC-SDN, EU, UN, UK, plus PEP data) with daily/periodic releases:

```bash
cd backend-node

mkdir -p data/sanctions

# Core sanctions/embargo targets (OFAC, EU, UN, UK, … consolidated)
curl -L -o data/sanctions/sanctions.csv \
  "https://data.opensanctions.org/datasets/latest/default/targets.csv"

# Politically exposed persons (for PEP screening)
curl -L -o data/sanctions/peps.csv \
  "https://data.opensanctions.org/datasets/latest/peps/peps.csv"
```

Check https://www.opensanctions.org/docs/ for the current dataset URLs and
formats (they occasionally change paths).

## CSV format expectations

The loader (`src/services/sanctions.service.ts`) reads the header row and
picks columns by name, so any CSV with the right column names works:

| Column (case-insensitive) | Used for |
| --- | --- |
| `name` / `caption` / `title` | name matching (token overlap) |
| `birth_date` / `date_of_birth` / `dob` | DOB-year confirmation |
| `countries` / `country` / `nationality` | optional country filter |

It handles quoted fields like `"DOE, JOHN"` (RFC-4180-style).

## Behavior guarantees

- `SANCTIONS_PROVIDER=opensanctions` with **no dataset present** →
  screening **fails closed**: KYC approval is denied and a CRITICAL
  `SANCTIONS_SCREEN` AML flag is raised for ops. It never silently passes.
- Matching is a pragmatic token-overlap heuristic (names only). A commercial
  provider (ComplyAdvantage, Trulioo, Persona) adds fuzzy search, confidence
  scores and risk scoring — swap the loader, keep the same
  `screenAgainstSanctions` contract and the blocking KYC gate.
- Refreshing: re-run the curl downloads on a schedule (weekly is reasonable;
  sanctions lists change more often after major geopolitical events).