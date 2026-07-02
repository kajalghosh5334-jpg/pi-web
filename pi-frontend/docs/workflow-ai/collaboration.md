# Workflow Collaboration

## Dependencies

A dependency means one node should receive the upstream node's output before it runs. Dependencies are the communication contract between nodes.

## Handoff

Good handoff includes the input materials used, important facts, assumptions, unresolved questions, and the expected output format for the next node.

## Collaboration pattern

Start with collection or extraction, then analysis or generation, then review, then final formatting or writeback. Branch only when two nodes can work independently on the same prepared context.

## Coordination

Each node should have one clear responsibility. If a node needs too many unrelated instructions, split it into smaller nodes so skills, model tier, retries, and training data remain clean.
