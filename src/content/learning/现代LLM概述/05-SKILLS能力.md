---
order: 5
title: '05-SKILLS能力'
description: 'SKILLS能力说明，说明如何制作一个SKILLS'
pubDate: '2026-02-18'
tags: ['AI']
---

# SKILLS能力

在MCP和Tool Calls中，模型不得不处理所有的上下文，这些上下文包含MCP的定义，参数信息，工具说明和更多辅助的提示词，这导致了一个问题，即模型的上下文窗口可能不够大，并且在大量MCP和Tool Calls的场景下，模型会不得不塞入很多不需要的工具和MCP信息，这些信息不仅会导致模型推理变慢，还可能对一些不太聪明的模型造成误导。

因此为了解决这个问题，让模型按需引入信息，SKILLS能力应运而生。从本质上来说，SKILLS通过把所有能力都浓缩成一个元信息，模型加载所有的少量Metadata，而真正的能力只有在需要时候才加载，这样就可以节省上下文。

一个SKILLS的定义如下（来源于官方文档）

https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf?hsLang=en

1. SKILL.md (required): Instructions in Markdown with YAML frontmatter
2. scripts/ (optional): Executable code (Python, Bash, etc.)
3. references/ (optional): Documentation loaded as needed
4. assets/ (optional): Templates, fonts, icons used in output

## 简单案例

假设说在项目结束之后，我需要将所有的项目文件头部增加版权信息，一般是注释头，那么我就可以新建一个SKILL.md为

```markdown
---
name: 注释头添加工具
description: 对项目文件添加注释头
---

# 注释头添加工具（Header Comment Injector）

该工具用于自动为项目中的源代码文件添加统一格式的注释头信息，适用于团队规范、版权声明和文件说明管理。

## 功能特性

- 自动为文件顶部插入注释头
- 支持多种编程语言（如 Python、JavaScript、Java、Shell 等）
- 可自定义注释模板内容
- 自动跳过已有注释头的文件（可配置）
- 批量处理整个项目目录

## 示例注释头格式

```text
/**
 * File: main.py
 * Author: Your Name
 * Created: 2026-02-18
 * Description: 项目主入口文件
 */
```

那么此时我新建一个空项目

![image-20260218194349282](./05-SKILLS能力.assets/image-20260218194349282.png)

此时claude已经建立了一个示例项目，并且拥有一个已经写好的SKILL，我开始命令他

```
我的名字是phil616，把今天日期和我的名字以及MIT许可证添加到文件注释头中
```

此时Claude Code就会调用SKILL

![image-20260218194523224](./05-SKILLS能力.assets/image-20260218194523224.png)

他会严格按照SKILL要求进行输出

![image-20260218194641540](./05-SKILLS能力.assets/image-20260218194641540.png)

同时，SKILLS里面的资源，脚本和其他内容都可以按需披露
