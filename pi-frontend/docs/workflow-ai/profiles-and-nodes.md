# Profiles And Nodes

## Profiles

A profile is a reusable worker identity: it combines a role, model preference, prompt pattern, and optional skills. Different profiles can cooperate in one workflow by passing intermediate results through node dependencies.

## Generic nodes

Generic workflow nodes are broad starting points, such as collect material, extract facts, analyze, generate variants, review quality, route cases, monitor changes, and write back structured output. They should be easy to understand and reusable across domains.

## Specialized nodes

A specialized node is a generic node adapted to a specific task, domain, style, or evaluation target. It may have a tighter prompt, fixed skills, stronger constraints, and learned examples from train mode.

## Relationship

Generic nodes are the raw building blocks. Specialized nodes are what the system gradually creates when a repeated task needs more consistency than a general-purpose profile can provide.

## Node purpose

Nodes break a hard task into smaller responsibilities. This makes model choice, skill choice, review, retry, and training more controllable than putting the whole job into one prompt.
