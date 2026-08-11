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

export function getRelatedPrompts(prompts, current, limit = 4) {
  const scored = prompts
    .filter(p => p.slug !== current.slug)
    .map(p => {
      let score = 0;
      if (p.categories.some(c => current.categories.includes(c))) score += 2;
      const overlap = p.tags.filter(t => current.tags.includes(t)).length;
      score += overlap;
      if (current.sequence && p.sequence === current.sequence) score += 3;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.p);
}
