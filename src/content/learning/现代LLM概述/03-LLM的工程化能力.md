---
order: 3
title: '03-LLM的工程化能力'
description: 'LLM工程化能力说明，说明LLM提供商提供的工程化能力都是什么'
pubDate: '2026-02-14'
tags: ['AI']
---

# 03-LLM的工程化能力

LLM的工程化能力指的是，LLM本身是大语言模型，只能输出文字，但它具有一定智能，如果我让他通过语言去描述动作，我再执行它的动作，那么GPT就具有了工程能力。

## 最简案例

假设说我编写了一个Python脚本，可以控制灯的开关，当我向模型提问：

```
你是一个根据时间来判断是否应该打开客厅灯的机器人，我会给你当前的时间，如果是处于晚上8点到10点，则需要你输出“Open”这个单词，如果不是，则输出“Close”这个单词，其余什么都不输出。
当前时间是晚上7点。
```

此时模型必然输出

"Close"

这个单词，那么我编写一个Python脚本，检测模型输出是否等于“Open”，如是，则通过脚本把灯打开。

那么LLM便有了工程能力。

## Tool Calls

Tool Calls是模型最原生的工具调用能力，以Deepseek提供的API为参考，这里面进行了一些拓展

```
# sk-23f27280f8d04d8c857f5b14672e14ea
from openai import OpenAI
import json
import random

def send_messages(messages):
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        tools=tools
    )
    return response.choices[0].message

client = OpenAI(
    api_key="sk-23f27280f8d04d8c857f5b14672e14ea",
    base_url="https://api.deepseek.com",
)


tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location, the user should supply a location first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"]
            },
        }
    },
]

mock = False

messages = [{"role": "user", "content": "How's the weather in Hangzhou, Zhejiang?"}]
message = send_messages(messages)
# 此时响应的信息中包含了模型希望调用的工具
print(f"User>\t {messages[0]['content']}")
tool = message.tool_calls[0]

# 打印模型希望调用的工具参数
print(f"Tools>\t {tool.function.name}")         # Tools>   get_weather
print(f"Tools>\t {tool.id}")                    # Tools>   call_00_tnoHD8lWGMiMSsnQVcfiZpyv
print(f"Tools>\t {tool.function}")              # Tools>   Function(arguments='{"location": "Hangzhou, Zhejiang"}', name='get_weather')
print(f"Tools>\t {tool.function.arguments}")    # Tools>   {"location": "Hangzhou, Zhejiang"}
messages.append(message)
# 可以根据模型希望的内容去调用实际工具

if mock:
    messages.append(
        {
            "role": "tool", 
            "tool_call_id": tool.id, 
            "content": "24℃"
        }
    )
else:
    # 解析工具参数
    arguments = json.loads(tool.function.arguments)
    location = arguments["location"]
    # 随机编一个天气
    weather = f"{random.randint(18, 39)}℃"
    print(f"Tools>\t 温度是 {weather}")
    messages.append(
        {
            "role": "tool", 
            "tool_call_id": tool.id, 
            "content": weather
        }
    )
    # 调用实际工具
message = send_messages(messages)
print(f"Model>\t {message.content}")
```

它的输出是

```
PS D:\DreamReflexTech\devops-blog\playgrounds> python .\main.py
User>    How's the weather in Hangzhou, Zhejiang?
Tools>   get_weather
Tools>   call_00_TFDN6pHzQnfWLRz7slT87VIE
Tools>   Function(arguments='{"location": "Hangzhou, Zhejiang"}', name='get_weather')
Tools>   {"location": "Hangzhou, Zhejiang"}
Tools>   温度是 33℃
Model>   The current weather in Hangzhou, Zhejiang is 33°C (approximately 91°F). It's quite warm there!
PS D:\DreamReflexTech\devops-blog\playgrounds> 
```

能够看得出来，此时脚本作为一个客户端，在模型返回的内容中解析到了希望调用获取天气的工具，并且通过一些手段得到了温度信息，返回给了模型，模型就具有了与现实世界交互的能力。

现在我们就可以编写各类工具供大模型使用。

目前存在的问题是：大模型可以通过调用工具像调用函数一样获取信息，但仍需要我们手动编辑执行器来解析它的命令。比如说让他开灯这个指令还是需要我们手动约束完成。或者编写一个工具让他调用，为了进一步封装Tool Calls，出现了MCP

## MCP

对于上文的Tool Calls来说，我们还需要进一步封装工具和执行层，并且争取让一个执行器自动完成任务。对于Tool Calls来说，如何定义工具，如何暴露接口是模型厂商内部的一种接口形式，代码无法应用到所有模型，但所有LLM都有预测能力，所以可以直接用自然语言描述能力，让能力通用。

下面以一个非常简单的场景案例

我希望一个大模型能够自动扫描的文章并且修改错别字。那么我需要让大模型读取到我的文章，并且把大模型修改后的文章写回文件。

对于操作文件来说，我可以使用Python的read和write功能，伪代码大概是

```
prompt="你是一个作家，你需要分析文章的问题，然后写出修改后的版本,如果你输出read(文章名称)，你就会得到文章，如果你输出write(文章名，文章内容)，就可以修改文章"
msg = send_to_llm(prompt)
if msg == read
	article_content = read(msg.article_name)
	send_to_llm(article_content)
if msg == write
	write(msg.article_name, msg.article_content)
```

再将上述伪代码循环，便制作出了一个智能文章修改机器人，也成为智能体。

其中read和write函数是我们提供给智能体的，read和write函数本身是执行器，read/write 是 MCP Server 暴露的 tools（能力函数），read和write的细节由他们自己实现维护，我们并不关系实现细节和底层原理。

而判断大模型需要干什么的分支判断和循环便是MCP Host，我们构建了一个MCP Host，它通过read和write函数去执行大模型的要求。

从上述的简单情景中，我们就可以制作出一个智能体

### MCP Host

一个Agent代码是

```
# host.py

import json

class MCPHost:
    def __init__(self, llm, client):
        self.llm = llm
        self.client = client

    def run(self, article_path):
        tools = self.client.get_tools_schema()

        system_prompt = f"""
你是文章校对助手。
你可以调用如下工具（用JSON格式返回调用）：

{json.dumps(tools, ensure_ascii=False, indent=2)}

目标：
1. 读取文章
2. 修正错别字和病句
3. 写回文件
"""

        conversation = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"请处理文件：{article_path}"}
        ]

        while True:
            response = self.llm(conversation)

            # 如果模型输出工具调用
            if response.get("tool_call"):
                name = response["tool_call"]["name"]
                args = response["tool_call"]["arguments"]

                result = self.client.call_tool(name, args)

                conversation.append({
                    "role": "tool",
                    "name": name,
                    "content": result if isinstance(result, str) else "ok"
                })
            else:
                print("模型完成任务：")
                print(response["content"])
                break
```

### MCP Client

由于MCP Server是分布于四面八方的，可能在公网，可能是本地，可能是第三方，也可以是其他人的，所以我们还需要设立一个专门的MCP Client去调用Server，这个Client结构如下

```
# mcp_client.py

class MCPClient:
    def __init__(self, server):
        self.server = server

    def call_tool(self, name, args):
        tool = getattr(self.server, name)
        return tool(**args)

    def get_tools_schema(self):
        return self.server.list_tools()
```

### MCP Server

此时我们就可以实现一个自己的文件系统工具

```
# file_server.py

class FileSystemServer:
    def read_file(self, path: str) -> str:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def write_file(self, path: str, content: str):
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def list_tools(self):
        return {
            "read_file": {
                "description": "Read a text file",
                "args": {"path": "string"}
            },
            "write_file": {
                "description": "Write text to a file",
                "args": {
                    "path": "string",
                    "content": "string"
                }
            }
        }
```

我们再在这个基础上模拟一个大模型

```
import json

class FakeLLM:
    def __call__(self, messages):
        last = messages[-1]["content"]

        if "请处理文件" in last:
            return {
                "tool_call": {
                    "name": "read_file",
                    "arguments": {"path": last.split("：")[1]}
                }
            }

        if "这是文章内容" in last or len(last) > 50:
            fixed = last.replace("错别字", "正确文字")
            return {
                "tool_call": {
                    "name": "write_file",
                    "arguments": {
                        "path": "article.txt",
                        "content": fixed
                    }
                }
            }

        return {"content": "文章已修改完成"}
```

那么此时这个Agent就可以真正跑起来

```
from file_server import FileSystemServer
from mcp_client import MCPClient
from host import MCPHost
from fake_llm import FakeLLM

server = FileSystemServer()
client = MCPClient(server)
llm = FakeLLM()

host = MCPHost(llm, client)
host.run("article.txt")
```

## Agent智能体

由于MCP的存在，MCP赋予了大模型操作其他内容的能力，MCP是连接大模型和物理世界的接口，那么大模型就可以在编码，创作，执行等方面大放异彩，让LLM具有人类的能力。

人类在编码时候本质上是在GUI操作文本字符串，而大模型也可以通过POSIX接口操作OS，人类在电脑上的办公，本质上都是在调用各类接口，例如窗体接口，HTTP的API等等，如果把这些能力都封装成MCP Server，那么Agent就可以利用这些MCP Server执行真正的行为，进而干预物理世界。

举一个简单的例子，假设说我在监控一个服务器的运行状态，常规情况下，我需要监控CPU，延迟，IO等数据，如果我把bash接口封装为MCP Server，那么大模型就可以通过调用 bash 和附加命令来获取系统情况。例如通过htop数据进行分析，如果出现问题，通过HTTP接口发起WebHook调用告知我风险。那么他便替代了运维工程师的某个工作。