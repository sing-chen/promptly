---
title: Summarize a research paper
category: research
tags: [summarize, single-shot, claude, model-agnostic]
purpose: Condense an academic paper into a skimmable summary with key findings and limitations.
models: [claude, gemini]
complexity: simple
notes: Works well for papers under ~30 pages pasted directly. For very long papers, chunk by section first.
added: 2026-04-02
updated: 2026-04-02
---

You are summarizing an academic paper for someone who won't read the full text.

Paper text or abstract + key sections: {{paper_text}}

Summarize in this structure: One-sentence takeaway, Key findings (bulleted), Methodology (2-3 sentences), Limitations, Why it matters. Avoid jargon where possible; define any term you must use.
