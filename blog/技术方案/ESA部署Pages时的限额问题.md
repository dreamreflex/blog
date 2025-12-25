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

整个流程分3步

1. 在dev分支内工作，更新和升级。
2. 有Github Action机器人在dev分支合并到主分支前清空构建版本。
3. 合并到主分支，触发Pages的自动构建。

体验下来的总体效果便是，每次更新dev分支，ESA的版本均会被清空，清空结束后，自动合并到main分支，触发构建，不会遇到限额。

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

完成后便可以合并到main分支，启动ESA的自动探测构建流程。

## 构建步骤

### 1. Github Action

基本思路是：CI文件负责上述API控制流程，并做好错误处理，根据`CreateTime`时间排序，删除最早的最多n个CodeVersion（最多4个，最少0个），n可自行修改。

CI完成之后，dev合并到main分支。

#### 1.1 CI配置文件 (ci-dev.yml)

```yaml
name: CI (dev)

on:
  push:
    branches: [ dev ]

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
        run: |
          set -euo pipefail

          echo "正在获取 $PAGES_NAME 的所有代码版本..."

          # 获取所有版本信息
          VERSIONS_JSON=$(aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name $PAGES_NAME)

          # 解析版本数量
          TOTAL_COUNT=$(echo $VERSIONS_JSON | jq -r '.TotalCount')
          echo "当前共有 $TOTAL_COUNT 个版本"

          # 如果版本数不超过5个，不需要清理
          if [ "$TOTAL_COUNT" -le 5 ]; then
            echo "版本数未超过限制，无需清理"
            exit 0
          fi

          # 计算需要删除的版本数（保留最新的1个，删除多余的）
          DELETE_COUNT=$((TOTAL_COUNT - 1))
          echo "需要删除 $DELETE_COUNT 个旧版本"

          # 解析版本列表，按创建时间排序（最早的在前）
          VERSIONS_TO_DELETE=$(echo $VERSIONS_JSON | jq -r '.CodeVersions | sort_by(.CreateTime) | .[0:'$DELETE_COUNT'] | .[].CodeVersion')

          echo "将要删除的版本: $VERSIONS_TO_DELETE"

          # 删除旧版本
          for VERSION in $VERSIONS_TO_DELETE; do
            echo "正在删除版本: $VERSION"
            DELETE_RESULT=$(aliyun esa DeleteRoutineCodeVersion --region cn-hangzhou --Name $PAGES_NAME --CodeVersion $VERSION)
            STATUS=$(echo $DELETE_RESULT | jq -r '.Status')

            if [ "$STATUS" = "OK" ]; then
              echo "✓ 版本 $VERSION 删除成功"
            else
              echo "✗ 版本 $VERSION 删除失败: $DELETE_RESULT"
              exit 1
            fi
          done

          echo "版本清理完成"

      # 验证清理结果
      - name: Verify Clean Result
        env:
          PAGES_NAME: ${{ steps.get-pages-name.outputs.pages_name }}
        run: |
          set -euo pipefail

          echo "验证清理结果..."
          RESULT_JSON=$(aliyun esa ListRoutineCodeVersions --region cn-hangzhou --Name $PAGES_NAME)
          REMAINING_COUNT=$(echo $RESULT_JSON | jq -r '.TotalCount')

          echo "清理后剩余版本数: $REMAINING_COUNT"

          if [ "$REMAINING_COUNT" -le 5 ]; then
            echo "✓ 版本清理成功，当前版本数: $REMAINING_COUNT"
          else
            echo "✗ 版本清理失败，仍有 $REMAINING_COUNT 个版本"
            exit 1
          fi
```

#### 1.2 自动合并配置文件 (dev-to-main.yml)

```yaml
name: Dev -> Main PR and Auto-merge

on:
  push:
    branches: [ dev ]

permissions:
  contents: read
  pull-requests: write

jobs:
  pr:
    runs-on: ubuntu-latest
    steps:
      - name: Create or update PR dev -> main
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          base: main
          branch: dev
          title: "chore(CI): merge dev into main (after ESA version cleanup)"
          body: |
            Automated PR to merge dev into main.

            This PR is created after successfully cleaning up old ESA versions to prevent deployment quota limits.
          labels: auto-merge

  enable_automerge:
    needs: pr
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: write
    steps:
      - name: Enable auto-merge for PRs labeled auto-merge
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # 找到 dev->main 的 open PR，然后开启 auto-merge（merge commit，可改成 --squash）
          PR_NUMBER=$(gh pr list --base main --head dev --state open --json number --jq '.[0].number')
          if [ -n "$PR_NUMBER" ]; then
            gh pr merge "$PR_NUMBER" --auto --merge
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
- **值**: 需要的保留版本数（如：`2`、`3`等）

添加后，系统会保留指定数量的最新版本，清理更早的版本。

例如：
- 设置为 `1`（默认）：只保留最新的1个版本
- 设置为 `2`：保留最新的2个版本
- 设置为 `3`：保留最新的3个版本

### 3. 工作流程说明

1. **开发阶段**: 在dev分支上进行开发和提交
2. **自动清理**: 每次push到dev分支时，ci-dev.yml会自动触发，清理阿里云ESA的旧版本
3. **创建PR**: dev-to-main.yml创建从dev到main的PR
4. **自动合并**: 清理完成后，PR会自动合并到main分支
5. **ESA构建**: 合并到main分支后，ESA会自动检测到main分支的变化并触发构建

### 4. 注意事项

- 确保RAM用户有足够的权限访问ESA服务
- 清理策略保留最新的1个版本，删除所有较旧的版本
- 如果清理过程中出现错误，整个CI流程会失败，不会进行合并
- 可以根据需要调整保留的版本数量（修改脚本中的逻辑）

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

#### 5.3 自动合并不工作
如果PR没有自动合并，请检查：
- 是否正确设置了auto-merge标签
- GitHub Token权限是否正确
- PR创建是否成功

