import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowStore = join(__dirname, "..", "workflows.json");
const workflows = JSON.parse(readFileSync(workflowStore, "utf-8"));

const legacy = {
  "restart-check": { status: "legacy", domain: "internal", templateType: "manual-check" },
  "workflow-ui-check": { status: "legacy", domain: "internal", templateType: "manual-check" },
  "smoke-workflow-e2e": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "smoke-workflow-e2e-2": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "smoke-workflow-e2e-3": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "smoke-workflow-1782761344971": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "smoke-workflow-1782761400725": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "smoke-workflow-1782761431560": { status: "legacy", domain: "internal", templateType: "smoke-test" },
  "eval-weak-to-strong-2026-06-29t21-09-41-525z": { status: "legacy", domain: "evaluation", templateType: "eval-run" },
};

const templates = {
  "template-fetch-summarize": "fetch-summarize",
  "template-generate-variants": "generate-variants",
  "template-classify-route": "classify-route",
  "template-monitor-alert": "monitor-alert",
  "template-extract-writeback": "extract-writeback",
};

const active = {
  "self-media-content-pipeline": ["self-media", "generate-variants"],
  "self-media-comment-reply-routing": ["self-media", "classify-route"],
  "self-media-topic-mining": ["self-media", "fetch-summarize"],
  "self-media-ai-track-topic-research": ["self-media", "fetch-summarize"],
  "self-media-title-cover-ab": ["self-media", "generate-variants"],
  "self-media-data-review-weekly": ["self-media", "fetch-summarize"],

  "industry-research-brief": ["research", "fetch-summarize"],
  "industry-source-monitoring-daily": ["research", "fetch-summarize"],
  "industry-competitor-diff-tracking": ["research", "monitor-alert"],
  "industry-interview-summary": ["research", "extract-writeback"],
  "industry-sentiment-risk-alert": ["research", "monitor-alert"],

  "ecommerce-listing-optimization": ["ecommerce", "generate-variants"],
  "ecommerce-review-mining": ["ecommerce", "fetch-summarize"],
  "ecommerce-inventory-pricing-alert": ["ecommerce", "monitor-alert"],
  "ecommerce-promo-creative-batch": ["ecommerce", "generate-variants"],

  "support-kb-response-pipeline": ["customer-support", "classify-route"],
  "support-auto-answer": ["customer-support", "classify-route"],
  "support-ticket-priority-routing": ["customer-support", "classify-route"],
  "support-prehandoff-info-collection": ["customer-support", "extract-writeback"],
  "support-service-quality-review": ["customer-support", "fetch-summarize"],

  "sales-call-crm-writeback": ["sales", "extract-writeback"],
  "sales-lead-scoring": ["sales", "classify-route"],
  "sales-precall-brief": ["sales", "fetch-summarize"],
  "sales-objection-coach": ["sales", "classify-route"],
  "sales-followup-cadence": ["sales", "generate-variants"],
};

for (const [id, meta] of Object.entries(legacy)) {
  if (workflows[id]) workflows[id] = { ...workflows[id], ...meta };
}

for (const [id, templateType] of Object.entries(templates)) {
  if (workflows[id]) workflows[id] = { ...workflows[id], status: "template", domain: "generic", templateType };
}

for (const [id, [domain, templateType]] of Object.entries(active)) {
  if (workflows[id]) workflows[id] = { ...workflows[id], status: "active", domain, templateType };
}

writeFileSync(workflowStore, `${JSON.stringify(workflows, null, 2)}\n`);
console.log(`organized workflow catalog: ${Object.keys(workflows).length} workflows`);
