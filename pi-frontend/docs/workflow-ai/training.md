# Workflow Training

## Train mode

Train mode is used when a workflow should learn a repeated way of working, not just run once. The system observes or records how a stronger model solves the task.

## Strong to weak transfer

A strong model can produce high-quality examples, reasoning patterns, review criteria, and final outputs. Train mode uses those examples so a weaker or cheaper model can imitate the strong model on a narrow task.

## Generic to specialized

A generic node becomes specialized when it has enough task-specific instructions, examples, constraints, and evaluation checks to perform reliably in one domain.

## When to train

Train when the same task repeats often, mistakes are costly, the output style must be consistent, or a weak model needs help matching a strong model on a well-defined task.
