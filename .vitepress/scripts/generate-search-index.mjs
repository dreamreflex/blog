import fs from 'fs'
import path from 'path'

const root = process.cwd()
const markdownExt = /\.mdx?$|\.md$/i

function walk(dir) {
  const res = []
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) {
      // skip node_modules and .vite and .vitepress directories
      if (name.name === 'node_modules' || name.name === '.vite' || name.name === '.vitepress') continue
      res.push(...walk(full))
    } else if (name.isFile() && markdownExt.test(name.name)) {
      res.push(full)
    }
  }
  return res
}

function extractTitleAndText(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const fmMatch = raw.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---/)
  let title = null
  if (fmMatch) {
    const fm = fmMatch[1]
    const titleMatch = fm.match(/^\s*title:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/m)
    if (titleMatch) title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || '').trim()
  }
  if (!title) {
    const h1 = raw.match(/^\s*#\s+(.+)$/m)
    if (h1) title = h1[1].trim()
  }
  if (!title) {
    title = path.basename(filePath).replace(markdownExt, '').replace(/^\d{4}-\d{2}-\d{2}-?/, '')
  }
  // strip frontmatter and code blocks and images, then collapse markdown syntax
  let body = raw.replace(/^---[\s\S]*?---\s*/,'')
  body = body.replace(/```[\s\S]*?```/g, '')
  body = body.replace(/!\[.*?\]\(.*?\)/g, '')
  body = body.replace(/[`*_>\-#\[\]\(\)~]/g, ' ')
  body = body.replace(/\s+/g, ' ').trim()
  return { title, text: body }
}

const includeDirs = ['blog', 'learning']
let files = []
for (const d of includeDirs) {
  const full = path.join(root, d)
  if (fs.existsSync(full)) files.push(...walk(full))
}
// also include top-level pages (root)
files.push(...walk(root).filter(f => path.dirname(f) === root && markdownExt.test(f)))

// dedupe
files = Array.from(new Set(files))

const docs = files.map((f) => {
  const rel = path.relative(root, f).replace(/\\/g, '/')
  const url = '/' + rel.replace(markdownExt, '').replace(/(^|\/)index$/,'$1')
  const { title, text } = extractTitleAndText(f)
  return { id: url, title, text, url }
})

const outDir = path.join(root, 'public')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'search-index.json'), JSON.stringify(docs, null, 2), 'utf8')
console.log(`Generated public/search-index.json with ${docs.length} documents`)


