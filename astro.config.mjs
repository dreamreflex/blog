// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkFallbackImage } from './src/plugins/remark-fallback-image.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://example.com',
	markdown: {
		remarkPlugins: [remarkFallbackImage, remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	integrations: [
		mdx({
			remarkPlugins: [remarkFallbackImage, remarkMath],
			rehypePlugins: [rehypeKatex],
		}),
		sitemap(),
		icon(),
		react()
	],
});
