import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflows = JSON.parse(readFileSync(join(__dirname, "..", "workflows.json"), "utf-8"));
const profiles = JSON.parse(readFileSync(join(__dirname, "..", "agent-profiles.json"), "utf-8"));

const legacyWorkflowIds = new Set([
  "restart-check",
  "workflow-ui-check",
  "smoke-workflow-e2e",
  "smoke-workflow-e2e-2",
  "smoke-workflow-e2e-3",
  "smoke-workflow-1782761344971",
  "smoke-workflow-1782761400725",
  "smoke-workflow-1782761431560",
  "eval-weak-to-strong-2026-06-29t21-09-41-525z",
]);

const expectedDomains = new Set(["self-media", "research", "ecommerce", "customer-support", "sales"]);
const expectedTemplateTypes = new Set(["fetch-summarize", "generate-variants", "classify-route", "monitor-alert", "extract-writeback"]);

const summary = {
  total: 0,
  legacy: [],
  templates: [],
  industry: {},
  invalid: [],
};

for (const [id, workflow] of Object.entries(workflows)) {
  summary.total += 1;
  const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
  const isLegacy = workflow.status === "legacy" || legacyWorkflowIds.has(id) || /^smoke-/.test(id) || /^eval-/.test(id);
  const isTemplate = id.startsWith("template-");

  if (isLegacy) {
    summary.legacy.push(id);
    continue;
  }

  if (isTemplate) {
    summary.templates.push(id);
    assert.ok(expectedTemplateTypes.has(workflow.templateType), `${id} should declare a known templateType`);
  } else {
    assert.ok(expectedDomains.has(workflow.domain), `${id} should declare a known domain`);
    summary.industry[workflow.domain] ||= [];
    summary.industry[workflow.domain].push(id);
  }

  assert.ok(tasks.length >= 3, `${id} should have at least three tasks`);
  const taskIds = new Set(tasks.map((task) => task.id));
  const modelTiers = new Set();

  for (const task of tasks) {
    assert.ok(task.id, `${id} has a task without id`);
    assert.ok(task.profileId, `${id}/${task.id} should declare profileId`);
    assert.ok(profiles[task.profileId], `${id}/${task.id} references missing profile ${task.profileId}`);
    assert.ok(Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length >= 3, `${id}/${task.id} should have acceptance criteria`);
    for (const dep of task.deps || []) {
      assert.ok(taskIds.has(dep), `${id}/${task.id} references missing dependency ${dep}`);
    }
    modelTiers.add(profiles[task.profileId].projectConfig?.modelTier || "unknown");
  }

  assert.ok(modelTiers.has("weak"), `${id} should include weak model work`);
  assert.ok(modelTiers.has("strong"), `${id} should include strong model work`);
}

for (const domain of expectedDomains) {
  assert.ok((summary.industry[domain] || []).length >= 3, `domain ${domain} should have at least three workflows`);
}

for (const templateType of expectedTemplateTypes) {
  assert.ok(summary.templates.some((id) => workflows[id]?.templateType === templateType), `missing template type ${templateType}`);
}

console.log(JSON.stringify(summary, null, 2));
