// @ts-nocheck
import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

// helper: generate sidebar groups for a directory (root files + subdir groups)
function generateSidebarFor(dirRelativePath) {
  const root = path.resolve(process.cwd(), dirRelativePath)
  if (!fs.existsSync(root)) return []

  const entries = fs.readdirSync(root, { withFileTypes: true })
  // collect files in root (excluding index.md which maps to /blog/)
  const rootFiles = entries
    .filter((e) => e.isFile() && /\.mdx?$|\.md$/i.test(e.name))
    .map((f) => f.name)

  const groups = []
// helper: read frontmatter from a markdown file, return parsed object
function getFrontmatterFromFile(fullPath) {
  try {
    const content = fs.readFileSync(fullPath, 'utf8')
    const fmMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---/)
    if (fmMatch) {
      const fm = fmMatch[1]
      const frontmatter = {}

      // parse title
      const titleMatch = fm.match(/^\s*title:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/m)
      if (titleMatch) frontmatter.title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || '').trim()

      // parse order
      const orderMatch = fm.match(/^\s*order:\s*(\d+)$/m)
      if (orderMatch) frontmatter.order = parseInt(orderMatch[1])

      // parse date (if needed for fallback sorting)
      const dateMatch = fm.match(/^\s*date:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/m)
      if (dateMatch) frontmatter.date = (dateMatch[1] || dateMatch[2] || dateMatch[3] || '').trim()

      return frontmatter
    }
  } catch (e) {
    // ignore and fallback
  }
  return {}
}

  // add root files as a flat group (if any)
  const rootItems = rootFiles
    .filter((name) => name.toLowerCase() !== 'index.md')
    .map((name) => {
      const basename = name.replace(/\.mdx?$/i, '')
      const fullPath = path.join(root, name)
      const frontmatter = getFrontmatterFromFile(fullPath)
      const title = frontmatter.title || basename.replace(/^\d{4}-\d{2}-\d{2}-?/, '')
      return {
        text: title,
        link: `/${dirRelativePath}/${basename}`,
        order: frontmatter.order,
        date: frontmatter.date
      }
    })
    .sort((a, b) => {
      // 按 order 升序排序，如果没有 order 则按 date 降序
      if (a.order != null && b.order != null) {
        return a.order - b.order
      }
      if (a.order != null) return -1
      if (b.order != null) return 1

      // 如果都没有 order，按日期降序（最新的在前面）
      const dateA = a.date ? new Date(a.date).getTime() : 0
      const dateB = b.date ? new Date(b.date).getTime() : 0
      return dateB - dateA
    })
  if (rootItems.length) {
    groups.push({ text: '文章', items: rootItems })
  }

  // add subdirectories as groups
  const subdirs = entries.filter((e) => e.isDirectory())
  for (const d of subdirs) {
    const subPath = path.join(root, d.name)
    const subEntries = fs.readdirSync(subPath, { withFileTypes: true })
    const subItems = subEntries
      .filter((e) => e.isFile() && /\.mdx?$|\.md$/i.test(e.name))
      .map((f) => {
        const basename = f.name.replace(/\.mdx?$/i, '')
        const fullPath = path.join(subPath, f.name)
        const frontmatter = getFrontmatterFromFile(fullPath)
        const title = frontmatter.title || basename.replace(/^\d{4}-\d{2}-\d{2}-?/, '')
        return {
          text: title,
          link: `/${dirRelativePath}/${d.name}/${basename}`,
          order: frontmatter.order,
          date: frontmatter.date
        }
      })
      .sort((a, b) => {
        // 按 order 升序排序，如果没有 order 则按 date 降序
        if (a.order != null && b.order != null) {
          return a.order - b.order
        }
        if (a.order != null) return -1
        if (b.order != null) return 1

        // 如果都没有 order，按日期降序（最新的在前面）
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      })
    if (subItems.length) {
      groups.push({ text: d.name, items: subItems })
    }
  }

  return groups
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  head: [
    ['link', { rel: 'icon', href: '/dreamreflex-logo-square-no-bg.svg' }]
  ],
  title: "DreamReflex Blog",
  description: "云梦镜像博客",
  themeConfig: {
    // local search provider (merged from duplicate key)
    editLink: {
      pattern: 'https://github.com/dreamreflex/blog/edit/main/:path',
      text: '在Github上编辑此页'
    },
    search: {
      provider: 'local'
    },
    // https://vitepress.dev/reference/default-theme-config
    // 站点 Logo（使用项目 public 下的真实 logo）
    logo: '/dreamreflex-logo-square-no-bg.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '博客', link: '/blog/' },
      { text: '学习中心', link: '/learning/' },
      { text: '文档中心', link: 'https://doc.dreamreflex.com' }
    ],

    // 为不同目录提供独立侧边栏（博客 / 学习中心 / 默认）
    // 使用运行时从文件系统自动生成 /blog/ 侧边栏（支持根目录文章与子目录分组）
    sidebar: {
      // '/docs/': generateSidebarFor('docs'),
      '/blog/': generateSidebarFor('blog'),
      '/learning/': generateSidebarFor('learning'),
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
    ,
    // Footer 备案信息
    footer: {
      message: 'Dream Reflex Blog, Built by <a href="https://github.com/vuejs/vitepress">VitePress</a>',
      copyright: 'Copyright © 2025 Dream Reflex Inc. All Rights Reserved.'
    }
  },
  markdown: {
    toc: { level: [2, 3] },
    math: true
  }
})
