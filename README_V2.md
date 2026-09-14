# FF14 Today v2

FF14 Today v2 is a focused single-user helper rather than an automatic daily planner.

## Home

- Island Sanctuary daily checklist
- Island Sanctuary current-rank goals
- On-demand achievement candidates
- On-demand timed gathering candidates
- On-demand fishing candidates
- Compact Lodestone/job progress

## Removed from the active product surface

- Available-time and energy inputs
- Roulette recommendations/checklist
- Grand Company deliveries and seal-market advice
- Allied Society routine
- Hunt-board screenshot workflow
- Screenshot/Gemini context ingestion
- Pokemon round-robin link
- Multi-user product flow

Legacy source files may remain temporarily for migration safety, but the v2 Worker entry exposes only the v2 API allowlist.

## Deployment

`wrangler.jsonc` points at `src/v2-entry.js`. The repository's existing GitHub-to-Cloudflare integration deploys `main` automatically. Production smoke verifies the v2 home and `/api/health` after merge.
