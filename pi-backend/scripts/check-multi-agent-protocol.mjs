import assert from "node:assert/strict";
import {
  buildCompletionGate,
  evaluateArtifactOutput,
  parseHandoffPacket,
} from "../multi-agent-protocol.js";

const completeOutput = `
执行结果：已经完成实现并验证。正文包含实现范围、关键决策、验证命令、已知风险和下游可复用结论，能够让 Lead 不打开额外文件也判断任务是否可合成。
本次交付明确说明了修改结果、验收依据和后续建议，不是只提供内部协作元数据。

交接包
- 完成状态：completed
- 对照验收标准：验收标准 1 已满足；验收标准 2 已满足
- 给下游的交付物：/tmp/example.md，可直接用于 Lead 汇总
- 未完成 / 阻塞原因：无
- 下一步建议：Lead 可以进入 review
- Memory Diff：progress.md 增加本轮完成记录
`;

const packet = parseHandoffPacket(completeOutput, ["验收标准 1", "验收标准 2"]);
assert.equal(packet.found, true);
assert.equal(packet.completionStatus, "completed");
assert.equal(packet.blockingReason, "无");
assert.match(packet.downstreamDeliverable, /example\.md/);

const quality = evaluateArtifactOutput(completeOutput, packet);
assert.equal(quality.status, "ready");

const gate = buildCompletionGate(
  { id: "t1", acceptanceCriteria: ["验收标准 1"], budget: { maxOutputChars: 10000 } },
  quality,
  "t1-output",
  completeOutput,
  packet,
);
assert.equal(gate.status, "passed");

const boldHandoffOutput = `
## 量化验收指标设计

正文已经覆盖质量、效率、Coach 对齐度、Profile 复用率。每个指标都包含定义、采样方式、目标阈值和失败后的修复动作，可直接进入评测方案。

**交接包**

*完成状态*：completed

*对照验收标准*：
1. 包含至少 6 个指标：满足。
2. 每个指标有明确量化定义：满足。

*给下游的交付物*：
- 本 Markdown 设计块。

*未完成/阻塞原因*：无。

*下一步建议*：
Lead 汇总本结果。

*Memory Diff*：
无改动。
`;
const boldPacket = parseHandoffPacket(boldHandoffOutput, ["包含至少 6 个指标"]);
assert.equal(boldPacket.completionStatus, "completed");
assert.equal(boldPacket.blockingReason, "无");
const boldQuality = evaluateArtifactOutput(boldHandoffOutput, boldPacket);
assert.equal(boldQuality.status, "ready");
const boldGate = buildCompletionGate({ id: "t-bold", acceptanceCriteria: ["包含至少 6 个指标"] }, boldQuality, "t-bold-output", boldHandoffOutput, boldPacket);
assert.equal(boldGate.status, "passed");

const checkmarkOutput = `
正文包含 DAG 依赖管理、并行执行、冲突裁决、一致性检查和端到端示例。方案还说明了失败重试、物料版本、上下游 Contract 校验和最终合成策略。
此外，正文明确给出 Lead 如何消费这些结果、Reviewer 如何判断物料是否可用、以及当某个子任务输出不完整时如何回退到修订流程。

## 交接包

**完成状态：** \`completed\`

**对照验收标准：**
1. ✅ 说明了子任务之间的 DAG 依赖管理和并行执行策略。
2. ✅ 描述了多子任务结果如何合成为最终交付物。

**给下游的交付物：**
- 可直接汇总的设计方案。

**未完成 / 阻塞原因：** 无

**下一步建议：** Lead 汇总。

**Memory Diff：** 无
`;
const checkmarkPacket = parseHandoffPacket(checkmarkOutput, ["说明了子任务之间的DAG依赖管理和并行执行策略"]);
const checkmarkQuality = evaluateArtifactOutput(checkmarkOutput, checkmarkPacket);
const checkmarkGate = buildCompletionGate({ id: "t-check", acceptanceCriteria: ["说明了子任务之间的DAG依赖管理和并行执行策略"] }, checkmarkQuality, "t-check-output", checkmarkOutput, checkmarkPacket);
assert.equal(checkmarkGate.status, "passed");

const missingPacket = parseHandoffPacket("只有正文，没有协议字段。", ["验收标准 1"]);
assert.equal(missingPacket.found, false);
assert.ok(missingPacket.issues.includes("missing_handoff_packet"));

const blockedPacket = parseHandoffPacket(`
- 完成状态：blocked
- 对照验收标准：未满足，需要用户确认
- 给下游的交付物：当前只有风险说明
- 未完成 / 阻塞原因：缺少权限
- 下一步建议：询问用户
`, ["验收标准 1"]);
const blockedQuality = evaluateArtifactOutput("给下游的交付物：当前只有风险说明", blockedPacket);
const blockedGate = buildCompletionGate({ id: "t2", acceptanceCriteria: [] }, blockedQuality, "t2-output", "给下游的交付物：当前只有风险说明", blockedPacket);
assert.equal(blockedGate.status, "failed");
assert.ok(blockedGate.issues.includes("handoff_status_blocked"));

const handoffOnlyOutput = `
交接包
- 完成状态：completed
- 对照验收标准：全部满足
- 给下游的交付物：以上正文为可直接交给 Lead 汇总的子任务结果。
- 未完成/阻塞原因：无
- 下一步建议：Lead 汇总
- Memory Diff：无
`;
const handoffOnlyPacket = parseHandoffPacket(handoffOnlyOutput, ["输出包含明确结论"]);
const handoffOnlyQuality = evaluateArtifactOutput(handoffOnlyOutput, handoffOnlyPacket);
assert.equal(handoffOnlyQuality.status, "incomplete");
assert.ok(handoffOnlyQuality.issues.includes("handoff_only_output"));

const noToolsPlaceholderOutput = `
准备读取上游物料。
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="read"></｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>

交接包
- 完成状态：completed
- 对照验收标准：全部满足
- 给下游的交付物：工具调用结果
- 未完成/阻塞原因：无
- 下一步建议：Lead 汇总
- Memory Diff：无
`;
const noToolsPlaceholderPacket = parseHandoffPacket(noToolsPlaceholderOutput, ["输出包含明确结论"]);
const noToolsPlaceholderQuality = evaluateArtifactOutput(noToolsPlaceholderOutput, noToolsPlaceholderPacket, { noTools: true });
assert.equal(noToolsPlaceholderQuality.status, "incomplete");
assert.ok(noToolsPlaceholderQuality.issues.includes("no_tools_tool_call_placeholder"));

console.log("multi-agent protocol checks passed");
