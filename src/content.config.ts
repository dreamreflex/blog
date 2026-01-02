import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: () =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.string().optional(),
			tags: z.array(z.string()).default(['general']),
			editor: z.string().optional(),
			editorNote: z.string().optional(),
		}),
});

const learning = defineCollection({
	loader: glob({ base: './src/content/learning', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.string().optional(),
			tags: z.array(z.string()).default(['general']),
			editor: z.string().optional(),
			editorNote: z.string().optional(),
		}),
});

export const collections = { blog, learning };
