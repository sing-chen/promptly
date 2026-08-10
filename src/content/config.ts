import { defineCollection, z } from 'astro:content';

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
] as const;

const prompts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()).min(1),
    purpose: z.string().optional(),
    sequence: z.string().optional(),
    sequence_step: z.number().optional(),
    depends_on: z.string().optional(),
    example_output: z.string().optional(),
    models: z.array(z.string()).optional(),
    complexity: z.enum(['simple', 'multi-step', 'agentic']).optional(),
    notes: z.string().optional(),
    updated: z.coerce.date().optional(),
    added: z.coerce.date().optional()
  })
});

export const collections = { prompts };
