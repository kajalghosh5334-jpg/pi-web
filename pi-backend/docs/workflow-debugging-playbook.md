# Workflow Debugging Playbook

> Status: handoff notes from the first workflow debugging pass.
> Goal: help another contributor clone the repo, understand the current state, and continue validating/fixing the remaining workflow templates.

## 1. Current Debug Status

### Passed: `industry-source-monitoring-daily`

Test task:
- Input: an industry monitoring request with four explicit example sources.
- Expected: no invented events, source status marked clearly, at most eight events, short final brief.

Observed failures before tuning:
- Old model provider names referenced `opencore-go/...`, which made model selection stale.
- The fetch prompt implied the model should "抓取/监控" even when real source access was not guaranteed, so it could fabricate plausible industry news.
- Upstream artifacts were too long. The final strong-model node had to read too much context and timed out.
- `lead_plus_reviewer` was too heavy for a lightweight monitoring brief.
- A task that later passed could still show an old error because the completion gate did not clear `error`.

Fixes applied:
- Replaced stale model ids with `opencode-go/...`.
- Set workflow `reviewPolicy` to `lead_only`.
- Constrained fetch/extract/report prompts:
  - only use provided or actual sources
  - do not invent facts
  - cap to eight events/rows
  - include `source_status`
  - keep final brief under 900 characters
- Strengthened `weak-research-extractor` and `research-report-analyst` profiles.
- Fixed the completion gate so a passed task writes `error: null`.

Acceptance result:
- Session reached `done`.
- Three business nodes completed.
- Final brief respected source boundaries and did not create unsupported high-confidence conclusions.

### Passed: `self-media-comment-reply-routing`

Test task:
- Input: six comments covering praise, normal question, hostile complaint, purchase intent, spam, and data-safety complaint.
- Expected:
  - `c001` praise: auto reply allowed.
  - `c002` normal question: auto reply allowed.
  - `c003` hostile/negative: manual review.
  - `c004` transaction intent: manual compliance review.
  - `c005` spam/ad: report or risk queue, no reply.
  - `c006` data-safety complaint: urgent manual review.

Observed failures before tuning:
- Classification and draft nodes were semantically usable.
- The final review node used a heavier strong-model review pattern and timed out after 120 seconds.
- The review prompt was too open-ended, so the model tried to produce a full qualitative report instead of a compact gate decision.

Fixes applied:
- Set workflow `reviewPolicy` to `lead_only`.
- Changed final `comment-log-review` to `opencode-go/deepseek-v4-flash`.
- Set `comment-log-review.noTools = true`.
- Rewrote final review as a fixed-schema lightweight gate:
  - `auto_send`
  - `manual_review`
  - `report/risk_list`
  - `log schema`
  - persona consistency check
  - `gate_result(pass/fail)`
- Added the rule: ads, attacks, complaints, transaction intent, and data-safety risk must be `auto_send=false`.

Acceptance result:
- Retest session reached `done`.
- Final result: PASS.
- `c001/c002` were auto-send; `c003/c004/c005/c006` were manual/risk; `c005` was report/no reply.
- Known minor issue: one artifact had a mojibake glyph around a Chinese heading. It did not affect routing correctness, but future UI/export work should normalize encoding.

### Passed With Runtime Caveats: `sales-call-crm-writeback`

Test task:
- Input: a sales call transcript with metadata, CRM field mapping, products, budget, objections, decision maker, and promised follow-up.
- Expected:
  - intent around 4/5 with original quote evidence
  - products: AI customer support and lead scoring
  - objections: SCRM integration, data security/no cross-border transfer, budget/price, CTO decision
  - next action: send quote, security whitepaper, and API checklist
  - follow-up: next Wednesday 15:00, resolved against call date
  - CRM payload follows the provided field mapping
  - idempotency key includes `call_id`, `customer_id`, and `call_time`

Observed failure before tuning:
- The first transcript node completed.
- The analysis node timed out when it used a heavier open-ended analysis pattern.

Fixes applied:
- Set workflow `reviewPolicy` to `lead_only`.
- Changed analysis/follow-up nodes to Flash with `noTools: true`.
- Rewrote analysis, validation, and follow-up prompts into short fixed schemas.

Retest result:
- Session `0e532fdb-0c25-4081-9ffe-db7052962853` reached `done`.
- Four business nodes completed:
  - `call-transcript`
  - `call-analysis`
  - `call-validate-payload`
  - `call-followup`
- Final Lead output length was 4205 characters.
- Intent was `4/5`.
- Follow-up time was resolved to `2026-07-08T15:00:00+08:00`.
- Outputs included CRM payload, idempotency key, follow-up task draft, two talk-track drafts, and eight manual confirmation items.

Quality notes:
- The workflow correctly surfaced a P1 data-quality issue: the supplied transcript only covered the first 7 minutes of an 18m42s call, so 62.6% of the call was missing.
- The final report marked all downstream analysis as `partial` and recommended rerunning after a complete transcript is available.
- This is a good example of a workflow being "usable" while still correctly refusing overconfidence.

Runtime caveats:
- During this retest, monitor state showed some nodes as `noTools: false` even though the workflow definition now marks analysis/follow-up nodes as `noTools: true`.
- `call-validate-payload` requested `opencode-go/deepseek-v4-flash`, but the effective runtime model was reported as `fun/gpt-5.4-mini`.
- The business result passed, but future contributors should verify that workflow JSON model/tool settings are actually propagated after backend restart. Treat "requested model" and "effective model" as separate debug fields.

## 2. DeepSeek Failure Modes Seen So Far

### 2.1 Strong model timeout on open-ended review

Pattern:
- `deepseek-v4-pro` performs poorly when a business node says "review/summarize/think comprehensively" without tight length and schema constraints.
- It is especially fragile when the upstream artifact is long.

Fix:
- Use Flash for deterministic extraction, routing, schema validation, and lightweight gates.
- Reserve the stronger model for genuinely difficult synthesis, and still bound the output:
  - max rows/events/items
  - fixed sections
  - explicit word/character budget
  - no new facts beyond upstream material

### 2.2 Long upstream artifacts poison downstream nodes

Pattern:
- Early nodes produce full essays.
- Later nodes spend the whole timeout reading/compressing instead of deciding.

Fix:
- Put output budgets on upstream prompts.
- For monitoring/reporting nodes, cap events and rows.
- For extraction nodes, require fixed JSON-like fields and `null/[]` for missing data.
- Add "do not restate all source text" to prompts.

### 2.3 Models fabricate when the workflow name implies external monitoring

Pattern:
- Prompts like "抓取近 7 天热点" or "监控行业动态" can make the model invent plausible current events when no real sources are provided or tool access is unavailable.

Fix:
- Separate source acquisition from source interpretation.
- Require `source_status`:
  - `provided`
  - `fetched`
  - `unverified`
  - `missing`
- Add the rule: if no source is available, output a missing-source report instead of inventing facts.

### 2.4 Tool-enabled business nodes overthink

Pattern:
- Nodes that only need extraction/classification may still behave like engineering agents when tools are enabled.
- They may spend time exploring environment or waiting for unused tool affordances.

Fix:
- Set `noTools: true` for pure text/schema nodes:
  - classification
  - routing
  - CRM payload validation
  - final gate checks
  - follow-up draft generation

### 2.5 Reviewer policy can be too expensive for low-risk workflows

Pattern:
- `lead_plus_reviewer` adds useful scrutiny, but for lightweight workflow templates it creates extra latency and another timeout surface.

Fix:
- Use `lead_only` when the final node is already a strict gate and the output is not directly mutating external systems.
- Keep `lead_plus_reviewer` for high-risk writes, compliance, finance/legal/medical judgment, destructive actions, or externally visible automation.

### 2.6 Stale errors can survive successful retries

Pattern:
- A node can pass after a retry but the session still displays an old error.

Fix already applied:
- Completion gate pass now clears `error` by writing `error: null`.

### 2.7 Requested model can differ from effective model

Pattern:
- A workflow definition may request `opencode-go/deepseek-v4-flash`, while the runtime monitor reports another effective model.
- This happened in the sales CRM retest: `call-validate-payload` requested DeepSeek Flash but ran as `fun/gpt-5.4-mini`.

Fix:
- Always inspect monitor task fields, not only `workflows.json`.
- Compare:
  - `requestedModel`
  - `model`
  - `noTools`
  - `profileId`
- Restart backend after editing `workflows.json` or `agent-profiles.json`.
- If the mismatch persists after restart, debug the model resolution/router layer before judging model-specific quality.

## 3. Prompt And Profile Improvement Rules

Use these defaults when tuning remaining workflows.

1. Put the node's job in one sentence.
2. Tell the node what not to do.
3. Use fixed output fields.
4. Use hard caps:
   - max items
   - max rows
   - max characters
5. Preserve evidence:
   - quote original text
   - cite source id/url when available
   - mark missing fields as `null` or `[]`
6. Do not let downstream nodes invent or reinterpret upstream facts.
7. Add human-review routing rules for risk cases.
8. Prefer Flash for routine structured work.
9. Prefer strong models only for bounded synthesis or ambiguous judgment.
10. If a node timed out once, first shorten the prompt and upstream output before changing runtime code.

Useful profile boundaries:
- `weak-research-extractor`: source-bound extraction, no invented facts.
- `weak-structured-operator`: schema, formatting, batch transformation, validation.
- `classification-router`: labels, confidence, route, escalation reason.
- `monitor-alert-operator`: severity, trigger threshold, alert summary.
- `structured-writeback-operator`: field validation, payload mapping, idempotency, retry policy.
- `strong-quality-reviewer`: final hidden-risk review, only after the artifacts are already compact.

## 4. Standard Debugging Procedure

### Step 1: Inspect the workflow

```bash
node -e 'const fs=require("fs"); const w=JSON.parse(fs.readFileSync("pi-backend/workflows.json","utf8")); const id=process.argv[1]; console.log(JSON.stringify(w[id], null, 2));' self-media-comment-reply-routing
```

Check:
- model ids exist
- profile ids exist
- dependency graph is valid
- `reviewPolicy` matches risk level
- final node has a fixed acceptance gate
- prompts include output caps
- task settings that matter at runtime are explicit: `model`, `noTools`, `budget`, `acceptanceCriteria`

### Step 2: Design a realistic test task

Do not only run static checks. Build a task input with:
- normal happy path
- one ambiguous case
- one high-risk case
- one missing-field or malformed case
- expected output for every case

For classification workflows, prepare a small labeled set. For writeback workflows, prepare the expected payload.

### Step 3: Run the workflow through the API

```bash
curl -sS -X POST http://127.0.0.1:3000/api/workflows/self-media-comment-reply-routing/run \
  -H 'content-type: application/json' \
  -d '{"input":"PASTE_TEST_TASK_HERE"}'
```

Save the returned `sessionId`.

### Step 4: Poll session state

```bash
curl -sS http://127.0.0.1:3000/api/monitor | jq '.sessions[] | select(.id=="SESSION_ID")'
```

If a run is clearly stuck:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/orchestrate/SESSION_ID/abort
```

### Step 5: Inspect artifacts and ledger

Artifacts are written under:

```bash
/tmp/pi-multi-agent/SESSION_ID/artifacts
```

Useful commands:

```bash
ls -la /tmp/pi-multi-agent/SESSION_ID/artifacts
sed -n '1,220p' /tmp/pi-multi-agent/SESSION_ID/ledger.jsonl
```

Compare each node output against the expected result. Mark issues as:
- wrong label/routing
- invented fact
- missing source/evidence
- too verbose
- timeout
- bad schema
- stale error
- UI cannot explain next action
- requested model differs from effective model
- configured `noTools` differs from monitor state

### Step 6: Patch the smallest layer that caused the issue

Patch order:
1. Workflow prompt.
2. Workflow model/noTools/reviewPolicy.
3. Profile instruction.
4. Runtime orchestration.
5. UI interaction.

Most failures so far were fixed at layers 1 and 2.

### Step 7: Restart backend when needed

Changing `workflows.json`, `agent-profiles.json`, or server runtime requires restart.

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill PID
cd pi-backend && node monitor-server.js
```

### Step 8: Rerun the same test

Use the same input until the result reaches:
- session status `done`
- all business nodes completed
- final output matches expected routing/payload/report
- no stale task error remains

### Step 9: Run static checks

From `pi-backend`:

```bash
npm run check:workflow-usability
npm run check:workflow-catalog
node scripts/check-multi-agent-protocol.mjs
npm run check:weak-strong-profiles
```

From repo root, also check stale provider names:

```bash
rg -n "opencore-go" pi-backend pi-frontend || true
```

## 5. Acceptance Criteria For A Usable Workflow

A workflow is usable only when:
- it completes with a realistic task input
- every node has a clear purpose and compact output
- final output is directly useful to the user
- risky cases are routed to manual review
- missing sources or fields are explicit
- no invented facts are present
- schema/payload nodes are stable across reruns
- the UI can show what to input, what is running, and what result was produced

For high-risk workflows, add:
- idempotency key
- retry policy
- manual approval gate
- original evidence quote or source link
- rollback or human escalation path

## 6. Recommended Debug Queue

Continue in this order:

1. `support-ticket-priority-routing`
   - High value, classification/routing pattern, easy to benchmark with labeled tickets.
2. `ecommerce-inventory-pricing-alert`
   - Tests monitoring/alert thresholds and human approval before price changes.
3. `self-media-title-cover-ab`
   - Tests generate-multiple-variants and ranking criteria.
4. `industry-competitor-diff-tracking`
   - Tests source diffing and anti-fabrication rules.
5. `support-prehandoff-info-collection`
   - Tests multi-turn field collection and missing-field handling.
6. `sales-call-crm-writeback`
   - Business run passed, but retest once after backend restart to verify `noTools` and effective model propagation.

## 7. Template For Future Debug Notes

Use this format after each workflow is tested:

```md
### Workflow: WORKFLOW_ID

Test input:
- ...

Expected result:
- ...

First run result:
- status:
- failed node:
- artifact path:

Diagnosis:
- ...

Changes:
- workflow prompt:
- profile:
- model/noTools/reviewPolicy:
- runtime/UI:

Retest result:
- session id:
- status:
- final comparison:

Remaining risk:
- ...
```
