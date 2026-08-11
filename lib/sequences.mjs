// Operates on the flat prompt object shape produced by scripts/build.mjs:
// { slug, title, categories, tags, sequence, sequence_step, depends_on, ... }
// (ported from the old Astro CollectionEntry-based version — logic unchanged)

export function getSequenceSteps(prompts, sequenceSlug) {
  return prompts
    .filter(p => p.sequence === sequenceSlug)
    .sort((a, b) => (a.sequence_step ?? 0) - (b.sequence_step ?? 0));
}

export function getAllSequenceSlugs(prompts) {
  const set = new Set();
  prompts.forEach(p => {
    if (p.sequence) set.add(p.sequence);
  });
  return Array.from(set);
}
