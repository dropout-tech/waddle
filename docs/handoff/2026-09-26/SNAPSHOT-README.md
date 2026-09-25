# Historical WIP snapshot — do not merge into main

This branch preserves the previously dirty checkout based on fc9c149. Many product files duplicate or predate the deployed main. It is a recovery archive, not a release candidate. Continue development from origin/main, and copy only a reviewed missing change.

Legacy tmp-* probes are historical artifacts, not a safe test suite: several use production URLs and may create/delete records. Do not batch-run. Literal secondary credentials were replaced by environment variables. No probes were executed during preservation.

The authoritative current status will be docs/handoff/2026-09-26/README.md on codex/handoff-status-20260926. Generated next-env diff is archived here, not a feature.
