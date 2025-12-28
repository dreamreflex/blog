# Git GPG签名

以下步骤适用于 Linux / macOS / Windows（Git Bash）。

## 1. 检查是否已安装 GPG

```
gpg --version
```

如果能看到版本号，说明已安装。

![image-20251228102329036](./Git对提交进行签名.assets/image-20251228102329036.png)

## 2. 生成新的 GPG 密钥

```
gpg --full-generate-key
```

推荐选择：

- 密钥类型：`(1) RSA and RSA`
- 密钥长度：`4096`
- 过期时间：一年（ `1y`）
- 用户信息：
  - Name：你的名字
  - Email：**必须和 Git 提交邮箱一致**
- 设置一个**强口令**

生成完成后，GPG 会给你一个 **Key ID**。

![image-20251228102604261](./Git对提交进行签名.assets/image-20251228102604261.png)

![image-20251228102624545](./Git对提交进行签名.assets/image-20251228102624545.png)

## 3. 导出 GPG 公钥

```
gpg --armor --export A91AE5747B7CAED244358AEC8D4410EE281EE15F
```

输出类似

![image-20251228102859547](./Git对提交进行签名.assets/image-20251228102859547.png)

## 4. 信任平台密钥

打开GPG密钥

![image-20251228102946152](./Git对提交进行签名.assets/image-20251228102946152.png)



Github:

![image-20251228103045553](./Git对提交进行签名.assets/image-20251228103045553.png)

## 5. 设置提交密钥

告诉 Git 用哪个 GPG Key

```
git config --global user.signingkey A91AE5747B7CAED244358AEC8D4410EE281EE15F
```

开启自动签名

```
git config --global commit.gpgsign true
```

确保 Git 邮箱一致

```
git config --global user.email "phil616@163.com"
```

## 6. 备份私钥

```
gpg --export-secret-keys --armor A91AE5747B7CAED244358AEC8D4410EE281EE15F > GitCommitKey.asc
```

换电脑/设备要导入私钥

```
gpg --import GitCommitKey.asc
```