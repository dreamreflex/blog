import { getCollection } from 'astro:content';
import { resolveImage } from '../utils/resolveImage';

export async function GET() {
	const posts = await getCollection('blog');
	
	const searchIndex = await Promise.all(posts.map(async (post) => {
		const imgMeta = await resolveImage(post.data.heroImage);
		return {
			id: post.id,
			slug: post.id, // In Astro v5 content collections, id is often the slug for blog
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			tags: post.data.tags || [],
			heroImage: imgMeta?.src || ''
		};
	}));

	return new Response(JSON.stringify(searchIndex), {
		headers: {
			'content-type': 'application/json',
		},
	});
}
