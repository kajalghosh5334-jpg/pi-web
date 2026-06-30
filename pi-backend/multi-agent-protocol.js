export function cleanInlineText(text, max = 160) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHandoffStatus(value) {
  const text = cleanInlineText(value, 60).toLowerCase();
  if (/blocked|阻塞|卡住|无法继续/.test(text)) return "blocked";
  if (/incomplete|未完成|部分完成|缺失/.test(text)) return "incomplete";
  if (/completed|complete|done|完成|已完成/.test(text)) return "completed";
  return "";
}

function extractHandoffField(text, labels) {
  const source = String(text || "");
  const labelPattern = labels.map(escapeRegExp).join("|");
  const nextLabels = [
    "完成状态",
    "对照验收标准",
    "给下游的交付物",
    "下游交付物",
    "未完成 / 阻塞原因",
    "未完成/阻塞原因",
    "未完成",
    "阻塞原因",
    "下一步建议",
    "Memory Diff",
    "memoryDiff",
    "记忆差异",
  ].map(escapeRegExp).join("|");
  const match = source.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:[*_]{0,2})\\s*(?:${labelPattern})\\s*(?:[*_]{0,2})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:[-*]\\s*)?(?:[*_]{0,2})\\s*(?:${nextLabels})\\s*(?:[*_]{0,2})\\s*[:：]|$)`, "i"));
  return match ? match[1].trim() : "";
}

function normalizeBlockingReason(value) {
  const text = cleanInlineText(value || "", 260)
    .replace(/^[*_：:\s。,.，、-]+|[*_\s。,.，、-]+$/g, "")
    .trim();
  if (!text) return "无";
  if (/^(无|没有|暂无|不适用|none|no|n\/a|null|nil)$/i.test(text)) return "无";
  if (/^(无|没有|暂无|不适用)[。；;，,\s]*(下一步建议|Memory Diff|memoryDiff|记忆差异)?/i.test(text)) return "无";
  return text;
}

export function parseHandoffPacket(output, acceptanceCriteria = []) {
  const text = String(output || "");
  const completionRaw = extractHandoffField(text, ["完成状态"]);
  const acceptanceRaw = extractHandoffField(text, ["对照验收标准"]);
  const deliverablesRaw = extractHandoffField(text, ["给下游的交付物", "下游交付物"]);
  const blockingRaw = extractHandoffField(text, ["未完成 / 阻塞原因", "未完成/阻塞原因", "阻塞原因", "未完成"]);
  const nextRaw = extractHandoffField(text, ["下一步建议"]);
  const memoryDiffRaw = extractHandoffField(text, ["Memory Diff", "memoryDiff", "记忆差异"]);
  const completionStatus = normalizeHandoffStatus(completionRaw);
  const found = Boolean(completionRaw || acceptanceRaw || deliverablesRaw || blockingRaw || nextRaw || memoryDiffRaw);
  const issues = [];
  if (!found) issues.push("missing_handoff_packet");
  if (!completionStatus) issues.push("missing_completion_status");
  if (!deliverablesRaw) issues.push("missing_downstream_deliverable");
  if (Array.isArray(acceptanceCriteria) && acceptanceCriteria.length && !acceptanceRaw) issues.push("missing_acceptance_mapping");
  const blockingReason = normalizeBlockingReason(blockingRaw);
  return {
    found,
    completionStatus: completionStatus || "unknown",
    rawCompletionStatus: cleanInlineText(completionRaw, 120),
    acceptanceMapping: cleanInlineText(acceptanceRaw, 700),
    downstreamDeliverable: cleanInlineText(deliverablesRaw, 900),
    blockingReason: blockingReason || "无",
    nextStep: cleanInlineText(nextRaw, 500),
    memoryDiff: cleanInlineText(memoryDiffRaw, 700),
    issues,
  };
}

function extractSubstantiveBody(output) {
  const text = String(output || "").trim();
  const body = text.split(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:[*_]{0,2})\s*交接包\s*(?:[*_]{0,2})\s*[:：]?/)[0] || "";
  return body
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/g, "")
    .replace(/<\|\|DSML\|\|tool_calls>[\s\S]*?<\/\|\|DSML\|\|tool_calls>/g, "")
    .trim();
}

export function evaluateArtifactOutput(output, handoffPacket = null, task = null) {
  const issues = [];
  const text = String(output || "").trim();
  const bodyBeforeHandoff = extractSubstantiveBody(text);
  if (text.length < 80) issues.push("output_too_short");
  if (handoffPacket?.found && bodyBeforeHandoff.replace(/\s+/g, "").length < 80) issues.push("handoff_only_output");
  if (task?.noTools === true && /DSML[\s\S]*tool_calls|<｜｜DSML｜｜tool_calls>|<\|\|DSML\|\|tool_calls>/i.test(text)) issues.push("no_tools_tool_call_placeholder");
  if (!/给下游的交付物|下游交付物|交付物/.test(text)) issues.push("missing_downstream_deliverable_section");
  if (handoffPacket?.issues?.length) issues.push(...handoffPacket.issues);
  if (handoffPacket?.completionStatus && handoffPacket.completionStatus !== "completed") issues.push(`handoff_status_${handoffPacket.completionStatus}`);
  return {
    status: issues.length ? "incomplete" : "ready",
    issues: Array.from(new Set(issues)),
  };
}

export function buildCompletionGate(task, quality, artifactId, output, handoffPacket = null, defaultMaxOutputChars = 120000) {
  const issues = [];
  if (!output?.trim()) issues.push("empty_output");
  if (!artifactId) issues.push("missing_artifact");
  if (String(output || "").length > (task.budget?.maxOutputChars || defaultMaxOutputChars)) issues.push("output_budget_exceeded");
  if (quality?.status !== "ready") issues.push(...(quality?.issues || ["artifact_not_ready"]));
  if (!handoffPacket?.found) issues.push("missing_handoff_packet");
  if (handoffPacket?.completionStatus && handoffPacket.completionStatus !== "completed") issues.push(`handoff_status_${handoffPacket.completionStatus}`);
  if (handoffPacket?.blockingReason && handoffPacket.blockingReason !== "无") issues.push("handoff_has_blocking_reason");
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria.filter(Boolean) : [];
  if (criteria.length) {
    const acceptanceMapping = String(handoffPacket?.acceptanceMapping || "").toLowerCase();
    const hasPositiveAcceptanceMapping = /✅|✓|✔|满足|通过|全部|已覆盖|覆盖|完成|达成|ok|pass|passed|yes/.test(acceptanceMapping);
    const lower = `${String(output || "")}\n${acceptanceMapping}`.toLowerCase();
    for (const criterion of criteria) {
      const normalized = String(criterion || "").trim();
      if (!normalized) continue;
      const keyTerms = normalized
        .split(/[\s,，。；;、:：/]+/)
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length >= 3)
        .slice(0, 4);
      if (keyTerms.length && !hasPositiveAcceptanceMapping && !keyTerms.some((term) => lower.includes(term))) {
        issues.push(`acceptance_maybe_missing:${normalized.slice(0, 80)}`);
      }
    }
  }
  return {
    taskId: task.id,
    status: issues.length ? "failed" : "passed",
    artifactId,
    qualityStatus: quality?.status || "unknown",
    definitionOfDone: task.definitionOfDone || "",
    acceptanceCriteria: criteria,
    handoffStatus: handoffPacket?.completionStatus || "missing",
    handoffIssues: handoffPacket?.issues || [],
    issues: Array.from(new Set(issues)),
    checkedAt: Date.now(),
  };
}
