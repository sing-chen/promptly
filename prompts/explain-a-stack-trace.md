---
title: Explain a stack trace
categories: [code]
tags: [debug, single-shot, claude, model-agnostic]
purpose: Get a plain-language explanation of an error and likely fix, from a raw stack trace.
models: [claude, gpt, gemini]
complexity: simple
notes: Works best with the full trace pasted in, not just the last line. For flaky/intermittent bugs, use a dedicated debugging-agent prompt instead.
added: 2026-05-10
updated: 2026-05-10
---

You are debugging an error from a stack trace.

Stack trace:
{{stack_trace}}

Relevant code context (if any): {{code_context}}

Explain in plain language what's going wrong, point to the most likely root cause, and suggest a fix. If the trace is ambiguous, say what additional info would resolve it.
