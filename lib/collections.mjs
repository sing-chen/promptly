// Curated by hand — edit this list to feature a collection on the homepage rail.
// Shape: { slug, title, description, promptSlugs: string[] }
export const collections = [
  {
    slug: 'client-onboarding-kit',
    title: 'Client Onboarding Kit',
    description: 'Everything needed to take a new client from kickoff to first deliverable.',
    promptSlugs: ['draft-the-brief', 'post-meeting-follow-up']
  }
];

export function getCollection(slug) {
  return collections.find(c => c.slug === slug);
}
