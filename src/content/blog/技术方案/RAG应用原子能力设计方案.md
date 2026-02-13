---
title: 'RAG原子能力设计方案'
description: 'RAG应用的原子能力和基础能力设计'
pubDate: '2026-01-13'
tags: ['技术方案', '人工智能']
---

# RAG原子能力设计方案

## 概览

RAG应用逻辑和流程本身是开发者需要关注的，但其原子能力是支撑RAG的基础

![image-20260113162058557](./RAG应用原子能力设计方案.assets/image-20260113162058557.png)

### 多轮对话管理

多轮对话是由一个UUID唯一标识的对话列表，数据结构采用的是有序消息数组

一个通用的JSON结构是：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的法律助手"
    },
    {
      "role": "user",
      "content": "什么是合同？"
    },
    {
      "role": "assistant",
      "content": "合同是当事人之间设立、变更、终止民事法律关系的协议。"
    },
    {
      "role": "user",
      "content": "那口头合同有效吗？"
    }
  ]
}
```

| role                | 含义                           |
| ------------------- | ------------------------------ |
| `system`            | 系统指令 / 角色设定 / 全局约束 |
| `user`              | 用户输入                       |
| `assistant`         | 模型回复                       |
| `tool` / `function` | 工具或函数返回（部分厂商）     |

Chat Completions 风格

```json
{
  "model": "gpt-4.1",
  "messages": [
    {"role": "system", "content": "你是一个技术助手"},
    {"role": "user", "content": "解释一下多轮对话"},
    {"role": "assistant", "content": "多轮对话是..."},
    {"role": "user", "content": "给我一个示例"}
  ]
}
```

### 知识库能力

知识库在采用外部知识库时模型比较简单，只有输入二元组和输出二元组

对于入参二元组INPUT = questionString + userspace(route)由系统管理

而响应二元组RESP = list(rankNumber+result)由知识库本身管理，但需要抽象细节，且这部分没有切片过程，只有读取过程。

### 模型管理

模型管理部分只有Meta管理是需要系统完成的，通用IO和限额限流都可以由API完成。

IO的函数式封装和第三方API封装可以由固定逻辑
