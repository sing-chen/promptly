// Controlled category vocabulary (BUILD_BRIEF.md §3) — single source of truth,
// shared by content validation and page generation.
export const CATEGORIES = [
  'writing',
  'code',
  'marketing',
  'research',
  'data-analysis',
  'product',
  'education',
  'creative',
  'ops-admin'
];

// One-line description shown under the heading on each category page
// (lib/render.mjs's renderCategoryPage). Keyed by slug so a missing entry
// degrades gracefully (no description line) rather than breaking a build.
export const CATEGORY_DESCRIPTIONS = {
  writing: 'Drafting and editing prose — emails, docs, and other written output.',
  code: 'Reading, writing, and explaining code — debugging, review, and generation.',
  marketing: 'Copy and campaign material — ads, positioning, and audience-facing content.',
  research: 'Finding, summarizing, and synthesizing information from sources.',
  'data-analysis': 'Making sense of data — analysis, interpretation, and reporting.',
  product: 'Product and project work — briefs, specs, and planning.',
  education: 'Teaching and learning — explanations, lesson material, and study aids.',
  creative: 'Open-ended creative work — brainstorming, ideation, and non-prose output.',
  'ops-admin': 'Operational and administrative tasks — process, logistics, and busywork.'
};
