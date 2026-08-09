import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import '../../styles/search.css';

export interface SearchPost {
	id: string;
	slug: string;
	title: string;
	description: string;
	pubDate: string;
	tags: string[];
	heroImage: string;
}

interface SearchProps {
	posts: SearchPost[];
}

export default function Search({ posts }: SearchProps) {
	const [query, setQuery] = useState('');

	const fuse = useMemo(() => {
		return new Fuse(posts, {
			keys: [
				{ name: 'title', weight: 1 },
				{ name: 'tags', weight: 0.8 },
				{ name: 'description', weight: 0.5 },
			],
			threshold: 0.35,
			ignoreLocation: true,
		});
	}, [posts]);

	const results = useMemo(() => {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) return posts;
		return fuse.search(normalizedQuery).map((result) => result.item);
	}, [query, fuse, posts]);

	return (
		<div className="search-wrapper">
			<div className="search-container">
				<input
					type="text"
					id="search-input"
					placeholder="搜索标题、描述或标签…"
					aria-label="搜索文章"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					autoFocus
				/>
			</div>

			<p className="result-count" aria-live="polite">
				{query.trim() ? `找到 ${results.length} 篇文章` : `共 ${results.length} 篇文章`}
			</p>

			{results.length === 0 && (
				<p className="no-results">没有找到匹配的文章，请尝试其他关键词。</p>
			)}

			<ul className="results-grid">
				{results.map((post) => (
					<li key={post.slug} className="post-card">
						<a href={`/blog/${post.slug}/`}>
							{post.heroImage && (
								<img
									width={720}
									height={360}
									src={post.heroImage}
									alt=""
									style={{ width: '100%', height: '200px', objectFit: 'cover' }}
								/>
							)}
							<div className="post-content">
								<h3 className="post-title">{post.title}</h3>
								<span className="post-date">
									{new Date(post.pubDate).toLocaleDateString('zh-CN', {
										year: 'numeric',
										month: 'long',
										day: 'numeric',
									})}
								</span>
								<p className="post-desc">{post.description}</p>
								{post.tags.length > 0 && (
									<div className="post-tags" aria-label="文章标签">
										{post.tags.map((tag) => <span key={tag} className="post-tag">#{tag}</span>)}
									</div>
								)}
							</div>
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
