# 项目基础信息

这是一个基于 [Astro](https://astro.build/) 构建的博客项目，使用了 React 集成，并进行了深度的定制。项目采用 pnpm 作为包管理器。

- **主要框架**: Astro
- **集成库**: React, MDX, Sitemap, Astro Icon
- **样式**: 标准 CSS (src/styles/global.css)
- **部署**: ESA (阿里云边缘安全加速)

## 常用命令

| 命令 | 说明 |
| :--- | :--- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动本地开发服务器 (默认端口 4321) |
| `pnpm build` | 构建生产版本 |
| `pnpm preview` | 预览构建后的生产版本 |
| `pnpm astro check` | 检查项目中的类型错误 |

## 如何新建文章

### 1. 确定文章类型和位置
文章内容位于 `src/content/` 目录下，根据类型选择子目录：
- **博客文章**: `src/content/blog/` (支持子目录分类，如 `技术方案`, `最佳实践分享`)
- **学习教程**: `src/content/learning/`
- **出版物**: `src/content/publications/`

### 2. 创建文件
创建一个新的 `.md` 或 `.mdx` 文件。文件名将作为 URL 的一部分 (slug)。

### 3. 编写 Frontmatter
在文件开头添加元数据：

```markdown
---
title: '文章标题'
description: '文章描述'
pubDate: '2025-01-01'
updatedDate: '2025-01-02' # 可选
heroImage: './my-post.assets/cover.png' # 可选
tags: ['tag1', 'tag2']
editor: '作者名' # 可选
editorNote: '编辑备注' # 可选
order: 1 # 仅 learning/publications 需要，用于排序
---
```

### 4. 添加图片资源 (推荐)
为了保持整洁，建议使用“资源共存”模式：
1. 创建同名文件夹：如果文章名为 `my-post.md`，创建文件夹 `my-post.assets/`。
2. 将图片放入该文件夹。
3. 在 Markdown 中引用：`![描述](./my-post.assets/image.png)`。
4. 一般情况下智能体不需要更改图像路径，也不需要插入图片，只有涉及到多媒体资源时才需要注意。

## 如何测试语法规则

Astro 会在构建和开发运行时自动验证内容集合的 Schema (定义在 `src/content.config.ts`)。

### 1. 启动本地服务器验证
运行 `pnpm dev`。如果 Frontmatter 格式不正确（例如缺少必填字段 `title` 或 `pubDate`），控制台会报错，页面也会显示错误信息。

### 2. 构建检查
运行 `pnpm build`。这会执行完整的构建过程，包括：
- 内容集合 Schema 验证
- Markdown/MDX 语法检查
- 链接有效性检查 (如果配置了)
- 代码类型检查

### 3. 类型检查
运行 `pnpm astro check` 可以专门检查 `.astro` 和 `.mdx` 文件中的 TypeScript 类型错误。

### 4. CI/CD 验证
项目配置了 GitHub Actions (`.github/workflows/dev-to-main.yml`)，在推送到 `dev` 分支时会自动运行构建测试。只有构建通过后才会合并到 `main` 分支。
