import fs from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';

export function remarkFallbackImage() {
  return (tree, file) => {
    // If no history, we can't determine file path.
    if (!file.history || file.history.length === 0) return;
    
    const filePath = file.history[0];
    const fileDir = path.dirname(filePath);

    visit(tree, 'image', (node) => {
      const url = node.url;
      if (!url || url.startsWith('http') || url.startsWith('https') || url.startsWith('//') || url.startsWith('data:')) return;
      
      let absolutePath;
      try {
        if (url.startsWith('/')) {
            absolutePath = path.join(process.cwd(), 'public', url);
        } else {
            absolutePath = path.resolve(fileDir, url);
        }

        // Check if image exists
        if (!fs.existsSync(absolutePath)) {
            console.warn(`[Markdown] Image missing: "${url}" in ${path.relative(process.cwd(), filePath)}. Using fallback.`);
            
            // Use src/assets/fallback.png as fallback
            const fallbackAbsPath = path.join(process.cwd(), 'src', 'assets', 'fallback.png');
            
            // Calculate relative path from current markdown file to fallback
            let relativeFallback = path.relative(fileDir, fallbackAbsPath).split(path.sep).join('/');
            
            if (!relativeFallback.startsWith('.')) {
            relativeFallback = './' + relativeFallback;
            }
            
            node.url = relativeFallback;
            node.alt = `[Missing Image] ${node.alt || ''}`;
        }
      } catch (e) {
        console.error(`[Markdown] Error resolving image path: ${url}`, e);
      }
    });
  };
}
