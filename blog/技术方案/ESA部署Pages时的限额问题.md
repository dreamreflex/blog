# ESA部署Pages时的限额问题

云梦镜像博客（该站点）部署在阿里云的[边缘安全加速 ESA](https://www.aliyun.com/product/esa)，本文主要解决的是ESA的Pages限额问题。

## 问题介绍

在ESA的构建中，每个函数和Pages只允许同时存在5个版本，当用户试图更新第六个时，就会显示构建失败，具体提示如下：

```bash
...
......	Create version failed: er_center create routine with assets code version error: code version number exceeds the quota limit, requestId: 7fa8efd9-4136-4c40-b5a5-57fa7d0a197b
```

其原因是由于阿里云ESA的函数计算与Pages服务是依赖OSS和FC（函数计算）迁移改造来的，在原始的FC中，金丝雀更新允许用户利用百分比覆盖模式进行验证，因此需要多版本切换，但所有版本均需要保存，其成本过高，因此需要5个版本限额避免免费用户滥用。

## 解决思路

本质上的解决思路是，由于ESA的Pages只支持Github，因此可以利用阿里云的OpenAPI功能和Github Actions功能来提前清空版本，代价是只允许最新版本在部署。

**采用的最终策略是极简的直接推送模式：**

1. **直接在main分支上开发和提交** - 无需dev分支
2. **每次推送main分支时自动清理ESA旧版本**
3. **ESA检测到main分支变化后自动触发部署构建**

**策略优势：**
- 极度简化工作流程，无需管理分支和PR
- 每次推送后立即清理版本并部署
- 完全自动化，无需人工干预
- 避免了分支管理带来的复杂性和错误

体验下来的总体效果便是，每次推送main分支，ESA的版本都会被自动清理，清理完成后ESA立即开始部署，不会遇到限额问题。

## 背景信息

### 1. Pages的API

1. ListUserRoutines

阿里云的ESA每个Pages被命名为`Routine`，可以通过[查询用户Routine列表](https://api.aliyun.com/document/ESA/2024-09-10/ListUserRoutines)这个API获取到所有的Pages实例。

相应如下：

```json
{
  "Routines": [
    {
      "RoutineName": "blog",
      "Description": "",
      "DefaultRelatedRecord": "xxxxx.aliyun-esa.net",
      "CreateTime": "2025-12-24T07:48:05Z",
      "HasAssets": true
    }
  ],
  "TotalCount": 1,
  "UsedRoutineNumber": 1,
  "RequestId": "D8772F14-5186-5C37-BDCA-CA11B0E057BF",
  "PageSize": 20,
  "QuotaRoutineNumber": 20,
  "PageNumber": 1
}
```

Routines里面的RoutineName便是唯一标识符，也是Pages的名字。

2. ListRoutineCodeVersions

每个版本被命名为`CodeVersions`在[查询Routine代码版本列表](https://api.aliyun.com/document/ESA/2024-09-10/ListRoutineCodeVersions)这个API可以看到Pages的所有版本

相应如下：

```json
{
  "TotalCount": 5,
  "RequestId": "AEDEF687-E668-5642-A36B-3BA3A6098CDF",
  "PageSize": 20,
  "PageNumber": 1,
  "CodeVersions": [
    {
      "Status": "Available",
      "CodeDescription": "",
      "BuildId": <BuildId>,
      "CreateTime": "2025-12-24T15:27:02Z",
      "CodeVersion": "<CodeVersion>",
      "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"<CommitId>\",\"CommitMessage\":\"docs(learning): add database, middleware, and microservices components\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
      "ConfOptions": {}
    },
  ...
  ]
}
```

当这个CodeVersions数量超过5个时便会触发限额。

3. GetRoutine

而通过[查询边缘函数配置](https://api.aliyun.com/document/ESA/2024-09-10/GetRoutine)这个API可以看到当前的部署信息。

响应体如下：

```json
{
  "Description": "",
  "RequestId": "BC7D8B1B-3CC4-55F7-9FA2-FB139EAF926E",
  "DefaultRelatedRecord": "blog.ebc32e28.er.aliyun-esa.net",
  "CreateTime": "2025-12-24T07:48:05Z",
  "Envs": [
    {
      "CodeVersion": "1766590022381161014",
      "CodeDeploy": {
        "DeployId": "1766590027913271190",
        "CreationTime": "2025-12-24T15:27:07Z",
        "CodeVersions": [
          {
            "Description": "",
            "Percentage": 100,
            "CreateTime": "2025-12-24T15:27:02Z",
            "CodeVersion": "1766590022381161014"
          }
        ],
        "Strategy": "percentage"
      },
      "Env": "production",
      "CanaryCodeVersion": "1766590022381161014"
    },
    {
      "CodeVersion": "1766590022381161014",
      "CodeDeploy": {
        "DeployId": "1766590027519628121",
        "CreationTime": "2025-12-24T15:27:07Z",
        "CodeVersions": [
          {
            "Description": "",
            "Percentage": 100,
            "CreateTime": "2025-12-24T15:27:02Z",
            "CodeVersion": "1766590022381161014"
          }
        ],
        "Strategy": "percentage"
      },
      "Env": "staging",
      "CanaryCodeVersion": "1766590022381161014"
    }
  ],
  "HasAssets": true
}
```

能够看到Envs字段有两个对象，Env分别是`staging`和`production`，由于没有设定AB测试或金丝雀策略，因此他们尽管都使用percentage策略，但都是100%的覆盖率。

4. DeleteRoutineCodeVersion

而删除某个版本的API是[删除边缘函数版本代码](https://api.aliyun.com/document/ESA/2024-09-10/DeleteRoutineCodeVersion)，在这个API中，填入`Name`和`CodeVersion`两个字段便可以删除这个版本。

当响应体是OK时便删除成功。

```
{
  "Status": "OK",
  "RequestId": "D7479AAC-D01E-5FAD-A403-4E5A4C6D5526"
}
```

此时不满足5个版本时，再次进行构建便可以构建成功。

### 2. RAM策略

新增一个用户，给这个用户授权`AliyunESAFullAccess`

### 3. 阿里云CLI

阿里云CLI是阿里云调用API的一个Go语言编写的二进制程序。

下载：

```
/bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"
```

配置：

```bash
aliyun configure set \
  --profile AkProfile \
  --mode AK \
  --access-key-id <ID> \
  --access-key-secret <Secret> \
  --region "cn-hangzhou"
```

获取GetRoutineAPI信息命令

```bash
aliyun esa GetRoutine --region cn-hangzhou --Name blog
```

blog为你的目标Pages名称，可从配置信息中读取。响应如下

```
root@phil616-home-server:~# aliyun esa GetRoutine --region cn-hangzhou --Name blog
{
        "CreateTime": "2025-12-24T07:48:05Z",
        "DefaultRelatedRecord": "blog.ebc32e28.er.aliyun-esa.net",
        "Description": "",
        "Envs": [
                {
                        "CanaryCodeVersion": "1766591259026072336",
                        "CodeDeploy": {
                                "CodeVersions": [
                                        {
                                                "CodeVersion": "1766591259026072336",
                                                "CreateTime": "2025-12-24T15:47:39Z",
                                                "Description": "",
                                                "Percentage": 100
                                        }
                                ],
                                "CreationTime": "2025-12-24T15:47:44Z",
                                "DeployId": "1766591264631481854",
                                "Strategy": "percentage"
                        },
                        "CodeVersion": "1766591259026072336",
                        "Env": "production"
                },
                {
                        "CanaryCodeVersion": "1766591259026072336",
                        "CodeDeploy": {
                                "CodeVersions": [
                                        {
                                                "CodeVersion": "1766591259026072336",
                                                "CreateTime": "2025-12-24T15:47:39Z",
                                                "Description": "",
                                                "Percentage": 100
                                        }
                                ],
                                "CreationTime": "2025-12-24T15:47:44Z",
                                "DeployId": "1766591264258280327",
                                "Strategy": "percentage"
                        },
                        "CodeVersion": "1766591259026072336",
                        "Env": "staging"
                }
        ],
        "HasAssets": true,
        "RequestId": "5950C920-FDA4-5278-AC33-3681EC9F0A63"
}
```

已知1766591259026072336是当前的构建信息，需要删除额外的除1766591259026072336的其他构建版本。

获取所有版本命令：

```bash
aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name blog
```

blog为你的目标Pages名称，可从配置信息中读取。响应如下

```
root@phil616-home-server:~# aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name blog
{
        "CodeVersions": [
                {
                        "BuildId": 4210235297703936,
                        "CodeDescription": "",
                        "CodeVersion": "1766591259026072336",
                        "ConfOptions": {},
                        "CreateTime": "2025-12-24T15:47:39Z",
                        "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"9ac7b7174260a6b4a088f72f8fec279babf95956\",\"CommitMessage\":\"docs(learning): add database, middleware, and microservices components\\n\\n\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
                        "Status": "Available"
                },
                {
                        "BuildId": 4210154238322752,
                        "CodeDescription": "",
                        "CodeVersion": "1766590022381161014",
                        "ConfOptions": {},
                        "CreateTime": "2025-12-24T15:27:02Z",
                        "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"9ac7b7174260a6b4a088f72f8fec279babf95956\",\"CommitMessage\":\"docs(learning): add database, middleware, and microservices components\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
                        "Status": "Available"
                },
                {
                        "BuildId": 4210149166885056,
                        "CodeDescription": "",
                        "CodeVersion": "1766589951252631893",
                        "ConfOptions": {},
                        "CreateTime": "2025-12-24T15:25:51Z",
                        "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"9ac7b7174260a6b4a088f72f8fec279babf95956\",\"CommitMessage\":\"docs(learning): add database, middleware, and microservices components\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
                        "Status": "Available"
                },
                {
                        "BuildId": 4210146728749056,
                        "CodeDescription": "",
                        "CodeVersion": "1766589907904250563",
                        "ConfOptions": {},
                        "CreateTime": "2025-12-24T15:25:07Z",
                        "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"9ac7b7174260a6b4a088f72f8fec279babf95956\",\"CommitMessage\":\"docs(learning): add database, middleware, and microservices components\\n\\n\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
                        "Status": "Available"
                },
                {
                        "BuildId": 4210026067732672,
                        "CodeDescription": "",
                        "CodeVersion": "1766588070246841790",
                        "ConfOptions": {},
                        "CreateTime": "2025-12-24T14:54:30Z",
                        "ExtraInfo": "{\"Source\":\"Github\",\"Branch\":\"main\",\"CommitId\":\"551df6e76a5dbe857d16954e271cd0314843ed85\",\"CommitMessage\":\"docs(readme): add Chinese notes about article ordering and formatter\\n\\n\",\"LoginName\":\"dreamreflex\",\"Repository\":\"blog\"}",
                        "Status": "Available"
                }
        ],
        "PageNumber": 1,
        "PageSize": 20,
        "RequestId": "3FCBB4EB-DC7D-553A-B3B8-A5C564F391C0",
        "TotalCount": 5
}
```

删除其余几个命令：

```bash
aliyun esa DeleteRoutineCodeVersion --region cn-hangzhou --Name blog --CodeVersion 1766588070246841790
aliyun esa DeleteRoutineCodeVersion --region cn-hangzhou --Name blog --CodeVersion 1766589907904250563
...
```

相应如下：

```
root@phil616-home-server:~# aliyun esa DeleteRoutineCodeVersion --region cn-hangzhou --Name blog --CodeVersion 1766588070246841790
{
        "RequestId": "EB8E7788-6B29-5FD2-931F-1E20CD09C457",
        "Status": "OK"
}
```

完成后ESA会自动检测main分支的变化并启动部署流程。

## 构建步骤

### 1. Github Action

**采用极简的直接推送策略：**

每次推送main分支时，自动触发清理workflow：
1. 获取当前ESA的所有版本信息
2. 根据创建时间排序，保留最新的n个版本（可配置，默认1个）
3. 删除多余的旧版本
4. ESA自动检测main分支变化并触发部署

**核心优势：**
- 推送即部署，无需等待
- 自动清理版本，避免限额问题
- 完全无需手动管理分支或PR

#### 1.1 清理配置文件 (clean-esa-main.yml)

```yaml
name: Clean ESA Versions on Main

on:
  push:
    branches: [ main ]

permissions:
  contents: read

jobs:
  clean-esa-versions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 下载阿里云CLI https://help.aliyun.com/zh/cli/
      - name: Download Aliyun Cli
        run: |
          set -euo pipefail
          /bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"

      # 配置阿里云CLI
      - name: Configure Aliyun CLI
        run: |
          aliyun configure set \
            --profile AkProfile \
            --mode AK \
            --access-key-id ${{ secrets.ALIYUN_ACCESS_KEY_ID }} \
            --access-key-secret ${{ secrets.ALIYUN_ACCESS_KEY_SECRET }} \
            --region "cn-hangzhou"

      # 获取Pages名称（可配置）
      - name: Get Pages Name
        id: get-pages-name
        run: |
          # 从配置中读取Pages名称，这里使用默认值blog，可根据需要修改
          echo "pages_name=blog" >> $GITHUB_OUTPUT

      # 获取所有代码版本并清理旧版本
      - name: Clean ESA Code Versions
        env:
          PAGES_NAME: ${{ steps.get-pages-name.outputs.pages_name }}
          # 配置保留的版本数，默认为1（只保留最新版本）
          RETAIN_VERSIONS: ${{ vars.RETAIN_VERSIONS || '1' }}
        run: |
          set -euo pipefail

          echo "开始清理阿里云ESA版本..."
          echo "目标Pages: $PAGES_NAME"
          echo "保留版本数: $RETAIN_VERSIONS"

          # 获取所有版本信息
          VERSIONS_JSON=$(aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name $PAGES_NAME)

          # 解析版本数量
          TOTAL_COUNT=$(echo $VERSIONS_JSON | jq -r '.TotalCount')
          echo "当前共有 $TOTAL_COUNT 个版本"

          # 如果版本数不超过保留数量，不需要清理
          if [ "$TOTAL_COUNT" -le "$RETAIN_VERSIONS" ]; then
            echo "版本数 ($TOTAL_COUNT) 未超过保留数量 ($RETAIN_VERSIONS)，无需清理"
            echo "ESA会自动检测main分支更新并部署"
            exit 0
          fi

          # 计算需要删除的版本数（保留指定数量的最新版本）
          DELETE_COUNT=$((TOTAL_COUNT - RETAIN_VERSIONS))
          echo "需要删除 $DELETE_COUNT 个旧版本，保留最新的 $RETAIN_VERSIONS 个版本"

          # 解析版本列表，按创建时间排序（最早的在前）
          VERSIONS_TO_DELETE=$(echo $VERSIONS_JSON | jq -r '.CodeVersions | sort_by(.CreateTime) | .[0:'$DELETE_COUNT'] | .[].CodeVersion')

          echo "将要删除的版本: $VERSIONS_TO_DELETE"

          # 删除旧版本
          DELETED_COUNT=0
          for VERSION in $VERSIONS_TO_DELETE; do
            echo "正在删除版本: $VERSION"
            DELETE_RESULT=$(aliyun esa DeleteRoutineCodeVersion --region cn-hangzhou --Name $PAGES_NAME --CodeVersion $VERSION)
            STATUS=$(echo $DELETE_RESULT | jq -r '.Status')

            if [ "$STATUS" = "OK" ]; then
              echo "版本 $VERSION 删除成功"
              DELETED_COUNT=$((DELETED_COUNT + 1))
            else
              echo "版本 $VERSION 删除失败: $DELETE_RESULT"
              exit 1
            fi
          done

          echo "版本清理完成！成功删除 $DELETED_COUNT 个旧版本"

      # 验证清理结果
      - name: Verify Clean Result
        env:
          PAGES_NAME: ${{ steps.get-pages-name.outputs.pages_name }}
          RETAIN_VERSIONS: ${{ vars.RETAIN_VERSIONS || '1' }}
        run: |
          set -euo pipefail

          echo "验证清理结果..."
          RESULT_JSON=$(aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name $PAGES_NAME)
          REMAINING_COUNT=$(echo $RESULT_JSON | jq -r '.TotalCount')

          echo "清理后剩余版本数: $REMAINING_COUNT"

          if [ "$REMAINING_COUNT" -le "$RETAIN_VERSIONS" ]; then
            echo "版本清理成功，当前版本数: $REMAINING_COUNT (保留设置: $RETAIN_VERSIONS)"
            echo "ESA会自动检测main分支更新并开始部署"
          else
            echo "版本清理失败，仍有 $REMAINING_COUNT 个版本，期望保留: $RETAIN_VERSIONS"
            exit 1
          fi
```

### 2. 配置说明

#### 2.1 GitHub Secrets 配置

需要在GitHub仓库的Settings > Secrets and variables > Actions中添加以下密钥：

- `ALIYUN_ACCESS_KEY_ID`: 阿里云访问密钥ID
- `ALIYUN_ACCESS_KEY_SECRET`: 阿里云访问密钥Secret

#### 2.2 RAM用户权限

需要创建一个RAM用户并授予以下权限：
- `AliyunESAFullAccess`: ESA完全访问权限

#### 2.3 自定义配置

**1. 修改Pages名称**

如需修改Pages名称，请在ci-dev.yml的"Get Pages Name"步骤中修改`pages_name`的值：

```yaml
echo "pages_name=your_pages_name" >> $GITHUB_OUTPUT
```

**2. 配置保留版本数**

默认情况下，清理逻辑会保留最新的1个版本。如需修改保留的版本数量，请在GitHub仓库的Settings > Variables中添加变量：

- **变量名**: `RETAIN_VERSIONS`
- **值**: 需要的保留版本数（如：`2`、`3`等），可作为回滚的保留。

添加后，系统会保留指定数量的最新版本，清理更早的版本。

例如：
- 设置为 `1`（默认）：只保留最新的1个版本
- 设置为 `2`：保留最新的2个版本
- 设置为 `3`：保留最新的3个版本

### 3. 工作流程说明

1. **开发阶段**: 直接在main分支上进行开发和提交
2. **自动清理**: 每次push到main分支时，clean-esa-main.yml会自动触发，清理阿里云ESA的旧版本
3. **ESA部署**: 清理完成后，ESA会自动检测main分支的变化并触发部署构建

**简化流程优势：**
- 去掉了复杂的dev分支和PR流程
- 用户只需直接push到main分支
- 自动清理版本后立即部署
- 完全无需手动干预

### 4. 注意事项

- 确保RAM用户有足够的权限访问ESA服务
- 清理策略保留最新的n个版本（可配置），删除所有较旧的版本
- 如果清理过程中出现错误，整个CI流程会失败，ESA不会进行部署
- 可以根据需要调整保留的版本数量（通过GitHub Variables配置）
- 每次推送main分支都会触发清理，无需手动管理

### 5. 故障排除

#### 5.1 CLI配置问题
如果出现阿里云CLI配置错误，请检查：
- Access Key ID和Secret是否正确
- RAM用户是否有AliyunESAFullAccess权限
- 区域设置是否正确（默认为cn-hangzhou）

#### 5.2 版本清理失败
如果版本清理失败，请检查：
- Pages名称是否正确
- 当前用户是否有删除版本的权限
- 网络连接是否正常

#### 5.3 ESA部署不触发
如果推送main分支后ESA没有自动部署，请检查：
- 清理workflow是否执行成功
- ESA是否正确连接到GitHub仓库的main分支
- GitHub和ESA之间的网络连接是否正常

