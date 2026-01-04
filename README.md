# Dream Reflex Blog Site

云梦镜像博客站开放源代码仓库

## 网站

该网站部署在[dreamreflex-blog](https://blog.dreamreflex.com)

运维人员在[ESA Console](https://esa.console.aliyun.com/edge/pages/detail/blog/version)查看构建情况。

特性：

- 极简样式（打造你自己的风格！）
- 100/100 Lighthouse 性能评分
- SEO 友好，包含规范 URL 和 OpenGraph 数据
- 支持站点地图
- 支持 RSS 订阅
- 支持 Markdown 和 MDX
- 支持图片全屏预览和缩放
- 支持全文模糊搜索
## 编写
### 如何添加新文章

1. 在 `src/content/blog/` 目录下创建一个新的 `.md` 或 `.mdx` 文件。
2. 文件名即为文章的 URL slug（例如 `my-new-post.md` 将对应 `/blog/my-new-post/`）。
3. 在文件开头添加 Frontmatter 元数据：

```markdown
---
title: '文章标题'
description: '这里是文章的简短描述，用于 SEO 和列表展示'
pubDate: '2025-01-01'
heroImage: './my-new-post.assets/cover.png'
tags: ['tag1', 'tag2']
---

这里是正文内容...
```

### 静态资源处理

为了保持项目结构清晰，建议采用**资源共存（Colocation）**的方式管理博客图片：

1. 对于名为 `my-post.md` 的文章，在同级目录下创建一个名为 `my-post.assets` 的文件夹。
2. 将该文章引用的所有图片放入该文件夹中。
3. 在 Markdown 中使用相对路径引用图片：

```markdown
![图片描述](./my-post.assets/image-name.png)
```

这种方式的好处是文章内容与资源紧密关联，方便迁移和管理。对于全站通用的静态资源（如 favicon、logo），请继续放在 `public/` 目录下。

## 项目结构

在你的 Astro 项目中，你会看到以下文件夹和文件：

```text
├── public/
├── src/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

Astro 在 `src/pages/` 目录下查找 `.astro` 或 `.md` 文件。每个文件都会根据其文件名作为一个路由暴露出来。

`src/components/` 没有什么特别之处，但这通常是我们放置 Astro/React/Vue/Svelte/Preact 组件的地方。

`src/content/` 目录包含相关的 Markdown 和 MDX 文档的“集合”。使用 `getCollection()` 从 `src/content/blog/` 获取文章，并使用可选的 schema 对 frontmatter 进行类型检查。查看 [Astro 内容集合文档](https://docs.astro.build/en/guides/content-collections/) 了解更多信息。

任何静态资源，如图片，都可以放在 `public/` 目录下。

## 命令

所有命令都在项目根目录的终端中运行：

| 命令 | 操作 |
| :--- | :--- |
| `npm install` | 安装依赖 |
| `npm run dev` | 在 `localhost:4321` 启动本地开发服务器 |
| `npm run build` | 构建生产站点到 `./dist/` |
| `npm run preview` | 在部署前本地预览构建结果 |
| `npm run astro ...` | 运行 CLI 命令，如 `astro add`, `astro check` |
| `npm run astro -- --help` | 获取 Astro CLI 使用帮助 |

## 想要了解更多？

查看 [我们的文档](https://docs.astro.build) 或加入我们的 [Discord 服务器](https://astro.build/chat)。

## 致谢

本主题基于可爱的 [Bear Blog](https://github.com/HermanMartinus/bearblog/)。
