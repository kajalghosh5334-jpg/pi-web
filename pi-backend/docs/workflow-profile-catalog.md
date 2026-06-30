# Workflow / Profile Catalog

This catalog separates reusable production workflows from old smoke/eval artifacts.

## Workflow Status

### Legacy / Internal

Keep these for traceability, but do not use them as reusable templates unless debugging the old workflow system.

- `restart-check`
- `workflow-ui-check`
- `smoke-workflow-e2e`
- `smoke-workflow-e2e-2`
- `smoke-workflow-e2e-3`
- `smoke-workflow-1782761344971`
- `smoke-workflow-1782761400725`
- `smoke-workflow-1782761431560`
- `eval-weak-to-strong-2026-06-29t21-09-41-525z`

### Generic Templates

Use these as base patterns before specializing for an industry.

- `template-fetch-summarize`: pull sources, extract facts, summarize with strong-model judgment.
- `template-generate-variants`: create multiple versions, then review quality/risk.
- `template-classify-route`: classify, score confidence, route to auto/manual/risk branches.
- `template-monitor-alert`: monitor events, grade severity, escalate medium/high risk.
- `template-extract-writeback`: extract fields, validate schema, prepare system writeback.

### Active Industry Workflows

Self-media:
- `self-media-content-pipeline`
- `self-media-comment-reply-routing`
- `self-media-topic-mining`
- `self-media-ai-track-topic-research`
- `self-media-title-cover-ab`
- `self-media-data-review-weekly`

Research:
- `industry-research-brief`
- `industry-source-monitoring-daily`
- `industry-competitor-diff-tracking`
- `industry-interview-summary`
- `industry-sentiment-risk-alert`

Ecommerce:
- `ecommerce-listing-optimization`
- `ecommerce-review-mining`
- `ecommerce-inventory-pricing-alert`
- `ecommerce-promo-creative-batch`

Customer support:
- `support-kb-response-pipeline`
- `support-auto-answer`
- `support-ticket-priority-routing`
- `support-prehandoff-info-collection`
- `support-service-quality-review`

Sales:
- `sales-call-crm-writeback`
- `sales-lead-scoring`
- `sales-precall-brief`
- `sales-objection-coach`
- `sales-followup-cadence`

## Profile Groups

### Core System Profiles

- `backend-guardian`
- `frontend-monitor`
- `artifact-flow`
- `artifact-reviewer`
- `session-memory`
- `debug-teacher`
- `agent-coach`
- `memory-curator`
- `general-executor`
- `claude-consultant`

### General Weak/Strong Routing

- `strong-task-architect`: intent, success criteria, task split, hypotheses, validation design.
- `weak-research-extractor`: source collection and explicit fact extraction.
- `weak-structured-operator`: schema extraction, formatting, batch rewriting, mechanical tasks.
- `weak-test-enumerator`: routine tests, boundary cases, acceptance checklists.
- `strong-quality-reviewer`: final review, consistency, hidden risk, launch/ship decision.

### Domain / Pattern Profiles

Self-media:
- `content-strategy-director`
- `content-researcher`
- `content-draft-producer`
- `content-editor-reviewer`

Ecommerce:
- `ecommerce-listing-optimizer`

Customer support:
- `support-kb-responder`

Research:
- `research-report-analyst`

Workflow patterns:
- `classification-router`
- `monitor-alert-operator`
- `structured-writeback-operator`
- `sales-call-analyst`

### Generated / Experimental Profiles

These were generated from specific sessions or training runs. Keep them as history unless the user explicitly asks to archive/delete them.

- `freellm-html-profile`
- `smoke-train-profile`
- `smoke-train-profile-1782761432402`
- `eval-trained-profile-2026-06-29t21-09-41-525z`

## Validation

For hands-on workflow testing and handoff notes, see [Workflow Debugging Playbook](./workflow-debugging-playbook.md).

Run:

```bash
npm run check:workflow-catalog
npm run check:weak-strong-profiles
```

The checks verify:

- active workflow profile references exist
- task dependencies point to existing tasks
- active workflows have acceptance criteria
- active/template workflows include both weak-model work and strong-model judgment
- each major industry has at least three workflows
