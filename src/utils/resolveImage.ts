import type { ImageMetadata } from 'astro';

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/*.{jpeg,jpg,png,gif}');

export async function resolveImage(imagePath: string | undefined | null | any): Promise<ImageMetadata | undefined> {
    if (!imagePath || typeof imagePath !== 'string') return undefined;
    
    // Normalize path. Expecting inputs like "../../assets/foo.jpg" or "/src/assets/foo.jpg"
    // We assume images are in src/assets
    const filename = imagePath.split('/').pop();
    const globPath = `/src/assets/${filename}`;
    
    if (images[globPath]) {
        const mod = await images[globPath]();
        return mod.default;
    }
    
    // Check if the image path is relative to the content directory (for blog post assets)
    // This is a simplified check. Astro's content collection schema handles resolving
    // relative paths in frontmatter to image metadata objects if using the `image()` helper.
    // However, since we are dealing with string paths here (likely from legacy or raw string usage),
    // we might need to handle other cases.
    
    // If the image path is not found in /src/assets via glob, and it was explicitly provided,
    // we should probably just return undefined or let it fail if it's a real path but not in our glob.
    // But per user request: "If a blog post does not specify a default cover, do not add a default cover".
    // So we should REMOVE the fallback logic.

    console.warn(`[ImageUtils] Image not found: ${imagePath}.`);
    return undefined;
}
