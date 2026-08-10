import type { CollectionEntry } from 'astro:content';

type Prompt = CollectionEntry<'prompts'>;

export function getSequenceSteps(prompts: Prompt[], sequenceSlug: string) {
  return prompts
    .filter(p => p.data.sequence === sequenceSlug)
    .sort((a, b) => (a.data.sequence_step ?? 0) - (b.data.sequence_step ?? 0));
}

export function getAllSequenceSlugs(prompts: Prompt[]): string[] {
  const set = new Set<string>();
  prompts.forEach(p => {
    if (p.data.sequence) set.add(p.data.sequence);
  });
  return Array.from(set);
}

export function getRelatedPrompts(prompts: Prompt[], current: Prompt, limit = 4) {
  const scored = prompts
    .filter(p => p.slug !== current.slug)
    .map(p => {
      let score = 0;
      if (p.data.category === current.data.category) score += 2;
      const overlap = p.data.tags.filter(t => current.data.tags.includes(t)).length;
      score += overlap;
      if (current.data.sequence && p.data.sequence === current.data.sequence) score += 3;
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.p);
}
