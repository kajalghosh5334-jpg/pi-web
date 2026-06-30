import { ConceptPreview } from "@/components/concepts/ConceptPreview";

export default function SignalConceptPage() {
  return (
    <ConceptPreview
      id="signal"
      title="Signal Ops"
      subtitle="live collaboration board"
      description="Signal 方向强化实时编排感。适合你现在最在意的多 agent 闭环问题，把派发、通信、失败隔离、确认升级和产物流转都做成一眼能懂的动态面板。"
      mood="radial-gradient(circle at bottom left, rgba(15,118,110,0.20), transparent 28%), linear-gradient(180deg, #edf7f6 0%, #dcebea 100%)"
      accent="#0f766e"
      nav={[
        { label: "Dispatch", hint: "Supervisor routing and intake" },
        { label: "Agents", hint: "Worker lanes and dependencies" },
        { label: "Escalations", hint: "Approvals, blockers, retries" },
        { label: "Synthesis", hint: "Completion and write-back" },
      ]}
      sidebar={[
        {
          title: "Ops goals",
          items: ["Make task lifecycle visible at a glance", "Force protocol-driven progress signals", "Isolate failures without freezing the whole UI"],
        },
        {
          title: "Current rules",
          items: ["Progress is emitted as protocol events", "Timeouts and retries are bounded", "Final answer is written back only after merge review"],
        },
      ]}
      workflows={[
        { name: "Dispatch graph", summary: "Show deterministic task routing and ownership lanes." },
        { name: "Resilience drill", summary: "Simulate timeout, retry, and escalation paths." },
        { name: "Close the loop", summary: "Verify all tasks merge before transcript write-back." },
      ]}
      scenarios={{
        landing: {
          label: "Dispatch",
          eyebrow: "Visible intake",
          description: "As soon as a complex request arrives, the product shows the lead taking control instead of leaving the user in a blank wait state.",
          inputPlaceholder: "Submit a complex task for routing...",
          statusLine: "This view prioritizes dispatch visibility and early acknowledgement over passive waiting.",
          messages: [
            { role: "user", text: "我需要多 agent 真正有闭环，而且页面要让我看清谁在做什么、卡在哪、何时完成。" },
            { role: "system", text: "Lead accepted the task and is splitting it into deterministic sub-steps." },
            { role: "assistant", text: "Routing started: protocol, UI visibility, and completion-handshake tracks are being assigned." },
          ],
          tasks: [
            { title: "Split request", owner: "supervisor", state: "active" },
            { title: "Open visibility rail", owner: "observer worker", state: "queued" },
            { title: "Prepare completion hook", owner: "protocol worker", state: "queued" },
          ],
        },
        session: {
          label: "Agents",
          eyebrow: "Live worker lanes",
          description: "The main prototype behaves like a live control board: workers, blockers, retries, and handoffs are part of the default surface.",
          inputPlaceholder: "Steer the running task group...",
          statusLine: "The user can watch task ownership and state transitions without reading raw logs.",
          messages: [
            { role: "system", text: "Progress updates are protocol events. The transcript waits for synthesis." },
            { role: "assistant", text: "Frontend worker is implementing the UI shell while protocol worker enforces milestone reporting." },
            { role: "assistant", text: "Observer worker is tracking whether any lane stalls or needs escalation." },
          ],
          tasks: [
            { title: "Shell visibility", owner: "frontend worker", state: "active" },
            { title: "Protocol milestones", owner: "protocol worker", state: "active" },
            { title: "Watchdog lane", owner: "observer worker", state: "queued" },
          ],
        },
        workflow: {
          label: "Synthesis",
          eyebrow: "Closed-loop completion",
          description: "Completion is explicit: every worker lane closes, the supervisor resolves conflicts, then one merged answer is written back into chat.",
          inputPlaceholder: "Confirm synthesis or request another run...",
          statusLine: "This view demonstrates the last mile of orchestration instead of leaving completion as an inferred state.",
          messages: [
            { role: "system", text: "All worker lanes report ready. Merge review is active." },
            { role: "assistant", text: "The supervisor is checking for conflicting conclusions before emitting the final answer." },
            { role: "assistant", text: "Once merged, the outcome is written back into the session and the task group is marked closed." },
          ],
          tasks: [
            { title: "Merge reports", owner: "supervisor", state: "active" },
            { title: "Finalize ledger", owner: "observer worker", state: "queued" },
            { title: "Write back answer", owner: "synthesis worker", state: "queued" },
          ],
        },
      }}
    />
  );
}
