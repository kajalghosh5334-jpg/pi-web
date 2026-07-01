# Aborted Training Run

This run was intentionally stopped after the judge returned mixed score scales such as `0.95` and `8`.

Reason:
- The runner expected 0-100 scores.
- The judge occasionally returned 0-1 or 0-10 scores.
- Continuing would have produced misleading failed cases.

Fix applied after this run:
- Judge prompt now requires `score_scale: "0-100"`.
- Runner normalizes 0-1 and 0-10 scores to 0-100.

The partial node outputs in this directory are still real fresh-conversation model samples, but this run should not be used as a pass/fail profile-training benchmark.
