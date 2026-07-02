# Workflow Skills

## Where skill links are

The workflow AI should point to skill locations instead of loading every skill at startup.

- Current project/global skills API: `/api/skills?cwd=<workflow cwd>`
- Skill marketplace/search API: `/api/skills/search`
- Install API: `/api/skills/install`
- Local discovery guide: `docs/SKILL_find_skills.md`
- A returned skill item includes its `filePath`; the agent can read that `SKILL.md` only when the workflow or user question actually needs it.

## Fixed skills

Fixed skills are part of a profile or node contract. They should be used whenever that node runs, because the task depends on that knowledge or tool behavior.

## Configurable skills

Configurable skills are selectable per node. They are useful when the same profile can support different domains or output formats, and the user wants to decide which capability is active for this workflow.

## Configuration rule

When the user asks how to configure a skill, first identify the node, then inspect available skills for the workflow cwd, then read the selected skill file if deeper instructions are required.
