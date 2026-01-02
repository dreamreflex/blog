import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import '../../styles/search.css';

interface Post {
	id: string;
	slug: string;
	title: string;
	description: string;
	pubDate: string;
	tags: string[];
	heroImage: string;
}

export default function Search() {
	const [query, setQuery] = useState('');
	const [posts, setPosts] = useState<Post[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/search.json')
			.then(response => response.json())
			.then(data => {
				setPosts(data);
				setLoading(false);
			})
			.catch(console.error);
	}, []);

	const fuse = useMemo(() => {
		return new Fuse(posts, {
			keys: [
				{ name: 'title', weight: 1 },
				{ name: 'tags', weight: 0.8 },
				{ name: 'description', weight: 0.5 },
			],
			threshold: 0.4, // 0.0 requires perfect match, 1.0 matches anything
			includeScore: true,
		});
	}, [posts]);

	const results = useMemo(() => {
		if (!query) return posts;
		return fuse.search(query).map(result => result.item);
	}, [query, fuse, posts]);

	return (
		<div className="search-wrapper">
			<div className="search-container">
				<input
					type="text"
					id="search-input"
					placeholder="Search by title, description or tags..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					autoFocus
				/>
			</div>

			{loading && <div className="loading-msg">Loading search index...</div>}

			{!loading && results.length === 0 && (
				<p className="no-results">No posts found matching your search.</p>
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
									{new Date(post.pubDate).toLocaleDateString('en-us', {
										year: 'numeric',
										month: 'short',
										day: 'numeric',
									})}
								</span>
								<p className="post-desc">{post.description}</p>
							</div>
						</a>
					</li>
				))}
			</ul>
		</div>
	);
}
