# Model Routing

## Capability tiers

Weak models are best for cheap, repeatable, well-scoped steps. Strong models are best for ambiguous planning, hard reasoning, high-stakes review, and producing training demonstrations.

## Routing principle

Use the weakest model that can reliably complete a node's responsibility. Escalate to a stronger model when the node plans the workflow, resolves ambiguity, creates examples, or reviews important output.

## Workflow design

A common pattern is strong model for architecture and review, weaker models for extraction, formatting, classification, or templated generation, and optional escalation when confidence is low.

## Node order

Model routing depends on node order: upstream nodes prepare context, middle nodes transform it, and downstream nodes review or package it. Stronger nodes should receive enough structured context to avoid redoing earlier work.
