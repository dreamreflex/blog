---
order: 2
title: '02-LLM的接口'
description: 'LLM接口说明，说明LLM提供商提供的接口都是什么'
pubDate: '2026-02-13'
tags: ['AI']
---

# 02-LLM的接口说明

LLM提供商指的是参数模型的提供商，这些提供商通常有自己的模型，如 OpenAI，Google，Microsoft 等。

他们提供的接口根据不同程度的封装提供给不同需求用户。下面的以Deepseek为例，介绍DeepSeek的接口信息

## 对话补全

参考 [DeepSeek对话补全API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)

```
from openai import OpenAI

# for backward compatibility, you can still use `https://api.deepseek.com/v1` as `base_url`.
client = OpenAI(api_key="<your API key>", base_url="https://api.deepseek.com")

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
  ],
    max_tokens=1024,
    temperature=0.7,
    stream=False
)

print(response.choices[0].message.content)
```

这段代码放回的是

```
PS D:\DreamReflexTech\devops-blog\playgrounds> python .\main.py
Hello! How can I assist you today?
```

这是最基础的对话，根据Hello来自动进行输出。

## 多轮对话

对于多轮对话来说，本质上是维护Messages数组，这是一个需要自己维持的会话消息，这个数组唯一标识了一个连续的对话，但本质上是将对话内容全部给到模型，模型根据全部上下文进行输出，这也是GPT记忆能力的来源。

```
[
    {"role": "user", "content": "What's the highest mountain in the world?"},
    {"role": "assistant", "content": "The highest mountain in the world is Mount Everest."},
    {"role": "user", "content": "What is the second?"}
]
```

所有的长会话都基于此

## 思考模式

思考模式的基本原理是CoT模型，思考链允许模型生成内容的同时关注自己生成的内容（即自己的输出作为encoder的输入，进而提升对未知信息的判断力）

这种能力属于给模型一个草稿纸，缓存更多信息，因此思考的更长获得的陌生信息就越多，输出便越有智慧性。

但同时CoT模型也仍然受到模型能力的限制。这也是CoT备受质疑的原因。

在DeepSeek中，开启思考模式可参考API https://api-docs.deepseek.com/zh-cn/guides/thinking_mode 

## FIM 补全

FIM（Fill-In-the-Middle）补全 API指的是在上下文中直接补全，而不是推倒重来，这是模型的一个进阶能力，它具备同时扫描前后文的能力。

## 格式化输出

GPT非常依赖输入来进行输出，如果直接允许GPT以JSON格式输出内容，那么GPT也是可以进行输出的，但是由于幻觉的存在，JSON的正确率无法得到保证，一旦解析出错可能会白白浪费掉Token，但模型厂商提供了JSON Schema校验，相当于自动过滤了不符合标准的JSON输出。

在模式输出完成之后，模型厂商会进行一次Parser，如果解析失败，则不会返回此次生成，自然也能缓解Token浪费。

## 其他

其他的所有接口都基于上述最基础的几种输出能力，但不包括工程化改造。
