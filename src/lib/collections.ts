export interface Collection {
  slug: string;
  title: string;
  description: string;
  promptSlugs: string[];
}

// Curated by hand — edit this list to feature a collection on the homepage rail.
export const collections: Collection[] = [
  {
    slug: 'client-onboarding-kit',
    title: 'Client Onboarding Kit',
    description: 'Everything needed to take a new client from kickoff to first deliverable.',
    promptSlugs: ['draft-the-brief', 'post-meeting-follow-up']
  }
];

export function getCollection(slug: string) {
  return collections.find(c => c.slug === slug);
}
