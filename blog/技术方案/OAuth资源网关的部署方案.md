# EdgeOne Edge Function 安全网关设计方案

## 1. 概述与可行性分析

### 1.1 可行性结论

利用 EdgeOne Edge Functions 作为反向代理网关，拦截所有请求进行身份验证，是 Serverless 架构下的经典模式。Edge Functions 具备处理 HTTP 请求头、Cookie、重定向以及发起子请求（Fetch）的能力，满足 OAuth 2.0 流程和 JWT 校验的需求。

### 1.2 核心价值
- **零信任架构**：源站隐身，所有流量必须经过边缘网关清洗和验证。
- **低延迟鉴权**：在离用户最近的边缘节点完成 JWT 校验，非法请求直接拦截，不消耗源站资源。
- **无状态扩展**：利用 JWT 和 Cookie，网关无需维护 Session，天然支持高并发。

## 2. 系统架构设计

### 2.1 流量路径
```
User -> [EdgeOne Edge Function (Gateway)] -> (Auth Check) -> [Origin Server]
                                    |
                                    v
                             [OAuth Server / Auth Service]
```

### 2.2 核心组件
1.  **Edge Gateway (Worker)**: 部署在 EdgeOne 上的函数，拦截 `/*`。
2.  **Auth Service**: 负责验证 AccessToken 并签发业务 JWT（用户提到的“验证服务器”）。
3.  **Origin Server**: 实际的业务源站。
4.  **OAuth Provider**: 第三方身份提供商（如 Google, GitHub, 企业内部 OAuth 等）。

## 3. 详细流程设计

### 3.1 核心拦截逻辑 (Global Interceptor)
所有进入 Edge Function 的请求（除了 `/cgi-authorize/*` 开头的路径）都会执行以下逻辑：

1.  **提取凭证**：从请求 Cookie 中读取名为 `auth_token` 的 JWT。
2.  **校验凭证**：
    -   检查 JWT 签名是否合法（使用环境变量中的 `JWT_SECRET`，目前测试阶段直接硬编码一个变量方便测试）。
    -   检查 `exp` (过期时间) 是否有效。
    -   检查 `aud` (Audience) 或 `iss` (Issuer)。aud应为目标域名，iss是网关自己的固定名称（如 `edge-gateway`）。
3.  **放行/拦截**：
    -   **合法**：将请求透传给源站 (`fetch(origin_url, request)`). 在透传时添加内部密钥头 `X-Edge-Key` 源站强制校验字段是否一致，不一致或缺失字段均302引导到 `/cgi-authorize/auth`。
    -   **非法/无Token**：
        -   如果是 AJAX/API 请求（检查 `Accept` 或 `X-Requested-With`），返回 `401 Unauthorized`，并添加`去验证`按钮引导到 `/cgi-authorize/auth?redirect_url=...`。
        -   如果是页面访问，重定向到 `/cgi-authorize/auth?redirect_url=...`。

### 3.2 认证流程端点设计

#### A. `/cgi-authorize/auth` (静态引导页)
-   **功能**：展示“开始登录”按钮，避免 CSRF 攻击，同时提供良好的用户体验。
-   **逻辑**：
    -   接收 `redirect_url` 参数（用户原本想访问的页面）。
    -   返回 HTML 页面，包含一个指向 `/cgi-authorize/start` 的链接或按钮。

#### B. `/cgi-authorize/start` (启动 OAuth)
-   **功能**：生成 CSRF State，重定向到 OAuth 提供商。
-   **逻辑**：
    1.  生成随机字符串 `state` (防止 CSRF) 和 `nonce` (防止重放)。
    2.  将 `state` 存入 Cookie：
        -   Name: `oauth_state`
        -   Value: `HMAC(state, secret)` (签名以防篡改) 或直接存储随机值。
        -   Attributes: `HttpOnly; Secure; SameSite=Lax; Max-Age=300` (5分钟过期)。
    3.  构建 OAuth URL：
        -   `https://oauth-provider.com/authorize?client_id=...&redirect_uri=.../cgi-authorize/callback&response_type=code&state={state}`
    4.  返回 `302 Found`，`Location` 指向上述 URL。

#### C. `/cgi-authorize/callback` (OAuth 回调 - 核心鉴权逻辑)
-   **功能**：Code 换 Token -> 获取 Email -> 查询权限 -> 签发 JWT -> 写入 Cookie。
-   **逻辑流程**：
    1.  **CSRF 校验**：
        -   读取 URL 参数 `state` 和 Cookie `oauth_state`。
        -   **安全检查**：如果两者不匹配、Cookie 缺失或 `state` 格式错误，直接返回 `403 Forbidden`，并在日志中记录潜在攻击。
    2.  **获取 AccessToken (OAuth 标准流程)**：
        -   向 OAuth Provider (如 GitHub, Google) 的 `/token` 端点发起 POST 请求。
        -   Payload: `client_id`, `client_secret`, `code`, `grant_type='authorization_code'`.
        -   获取响应中的 `access_token` 和 `id_token` (如果支持 OIDC)。
    3.  **获取用户身份 (Email)**：
        -   **方式 A (OIDC)**: 如果响应包含 `id_token`，直接解析 JWT Payload 获取 `email` 字段。
        -   **方式 B (UserInfo)**: 使用 `access_token` GET OAuth Provider 的 `/userinfo` 端点，获取 `email`。
    4.  **权限查询 (业务核心)**：
        -   构建请求 URL: `https://res.example.com/api/resource/${email}`
        -   发起 Fetch 请求：
            -   Method: `GET`
            -   Headers: `Authorization: Bearer ${access_token}`
        -   解析响应: 获取元组数据 `{ "user@example.com": ["domain1.com", "domain2.com"] }` (Key 为用户的实际 Email)。
        -   **注意**：此步骤建议设置较短的超时时间 (timeout)，避免阻塞网关。
    5.  **域名权限判定**：
        -   获取用户当前访问的 Host (从 Cookie 中的 `redirect_url` 解析，或从当前请求头获取)。
        -   **判定逻辑**：检查 `Host` 是否存在于返回的域名列表中。
            -   *严格模式*：`domains.includes(currentHost)`
            -   *泛域名模式*：检查 `currentHost` 是否以列表中的域名结尾 (如 `app.domain1.com` 匹配 `domain1.com`)。
        -   **结果**：
            -   如果不匹配：返回 `403 Forbidden` (无权访问该域名)。
            -   如果匹配：继续下一步。
    6.  **签发网关凭证 (JWT)**：
        -   生成 Payload:
            ```json
            {
              "sub": email,
              "domains": ["domain1.com", "domain2.com"], // 缓存权限列表，避免每次请求都查权限服务器
              "exp": Math.floor(Date.now() / 1000) + 86400, // 24小时过期
              "iat": Math.floor(Date.now() / 1000)
            }
            ```
        -   使用环境变量 `JWT_SECRET` 进行 HS256 签名生成 `gateway_token`。
    7.  **写入 Session 并跳转**：
        -   Set-Cookie: `auth_token={gateway_token}; HttpOnly; Secure; SameSite=Lax; Path=/`
        -   清除中间状态: Set-Cookie: `oauth_state=; Max-Age=0`
        -   302 Redirect 到用户最初尝试访问的 URL (`redirect_url`)。

#### D. `/cgi-authorize/logout` (登出)
-   **功能**：清除会话。
-   **逻辑**：
    -   Set-Cookie: `auth_token=; Max-Age=0; Path=/; HttpOnly; Secure`。
    -   重定向回 `/cgi-authorize/auth` 或首页。

#### E. 401 Unauthorized静态提示页面
-   **功能**：当用户访问需要认证的资源但未提供有效凭证时，返回的静态 HTML 页面。
-   **内容**：
    -   简单的提示信息：“401 Unauthorized - 您需要先登录才能访问此资源。”
    -   一个指向 `/cgi-authorize/auth` 的链接或按钮，引导用户重新登录。
-   **设计考虑**：
    -   静态页面，不包含动态内容，避免引入额外的安全风险。
    -   保持简洁，避免复杂的前端逻辑。

### 3.3 多域名路由与源站映射 (Multi-Tenant Routing via KV)
由于网关保护的域名数量可能较多，且映射关系需要动态更新，将配置存储在 **EdgeOne KV (Key-Value Storage)** 中比环境变量更灵活、更易扩展。

1.  **KV 存储结构**：
    *   **Namespace**: 建议绑定名为 `HOST_MAP` 的 KV Namespace。
    *   **Key**: 域名 (e.g., `crm.example.com`)
    *   **Value**: 配置对象的 JSON 字符串。
        ```json
        {
          "origin": "http://10.0.1.10:8080",
          "hostHeader": "internal-crm.local",
          "edgeKey": "s3cr3t-k3y-for-crm" // 用于源站校验的 X-Edge-Key
        }
        ```
2.  **动态转发逻辑**：
    *   在 `fetch` 源站前，从 request 中提取 `hostname`。
    *   **KV 查询**: `await env.HOST_MAP.get(hostname)`。
    *   如果查询结果为空，返回 `502 Bad Gateway` (未配置的域名)。
    *   解析 JSON 获取 `origin`, `hostHeader`, `edgeKey`。
    *   **Fetch 构建**：
        *   `fetch` URL 使用 `config.origin` + `path` + `search`。
        *   `Host` 请求头设置为 `config.hostHeader` (如果存在) 或保持原样。
        *   **Header 注入**：将 `config.edgeKey` 写入 `X-Edge-Key` 请求头。

## 4. 技术细节与安全规范

### 4.1 Cookie 安全配置
必须严格设置 Cookie 属性以防止 XSS 和 CSRF：
-   `HttpOnly`: 禁止 JavaScript 读取（防 XSS）。
-   `Secure`: 仅允许 HTTPS 传输。
-   `SameSite=Lax`: 允许正常跳转时的 Cookie 发送，但阻止跨站 POST（防 CSRF）。

### 4.2 JWT 设计
-   **算法**: HS256 (HMAC SHA-256) 足够高效且安全。
-   **实现方式**: 必须使用 **Web Crypto API** (`crypto.subtle`) 进行签名和校验。
    -   **原因**: Edge Function 运行在轻量级运行时中，不完全兼容 Node.js 环境，且不支持安装带有原生绑定的第三方包。
    -   **优势**: Web Crypto API 是标准 Web API，性能极佳且无额外依赖。
-   **密钥管理**: `JWT_SECRET` 必须通过 EdgeOne 环境变量配置，**严禁硬编码**。
-   **Payload**:
    ```json
    {
      "sub": "user_123",
      "name": "Alice",
      "exp": 1700000000, // 建议有效期 2-24 小时
      "iat": 1600000000
    }
    ```

### 4.3 源站保护 (Origin Protection)
为了防止攻击者绕过 Edge 网关直接访问源站 IP：
1.  **Shared Secret**: Edge Function 在 fetch 源站时，添加 `X-Edge-Auth-Secret: <config.edgeKey>`。
2.  **源站校验**: 源站中间件检查此 Header，如果不匹配则拒绝请求。
3.  **IP 白名单**: 如果可能，源站防火墙只允许 EdgeOne 节点的 IP 访问。

## 5. 异常处理与调试
-   **调试模式 (Debug Mode)**:
    -   当环境变量 `DEBUG` 设置为 `true` 时：
        -   控制台日志会输出详细的请求信息、环境变量 Key (不含 Value)、JWT 校验结果。
        -   发生 500 错误时，响应体将包含详细的错误信息和堆栈 (Stack Trace)，便于排查问题。
    -   **注意**: 生产环境请务必关闭调试模式，防止敏感信息泄露。
-   **OAuth 服务不可用**: 捕获 fetch 异常，返回友好的 502 页面。
-   **Token 过期**: 
    -   方案 A: 强制重新登录（用户体验一般）。
    -   方案 B: 实现 Refresh Token 机制（复杂，需要维护状态或双 Cookie）。对于网关场景，通常设置较长的 JWT 有效期（如 24 小时）并依赖重新登录即可。

### 6.1 环境变量清单 (Environment Variables)
必须在 EdgeOne 控制台配置以下环境变量：

| 变量名 | 必填 | 说明 | 示例值 |
| :--- | :--- | :--- | :--- |
| `OAUTH_DISCOVERY_URL` | **是** | OAuth 服务的 OIDC 自动发现端点 (OpenID Connect Discovery Endpoint)。网关将自动请求此 URL 获取 `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`。 | `https://accounts.google.com/.well-known/openid-configuration` |
| `CLIENT_ID` | **是** | OAuth 客户端 ID | `edge-gateway-app` |
| `CLIENT_SECRET` | **是** | OAuth 客户端密钥 (注意保密) | `s3cr3t-xxxxxx` |
| `JWT_SECRET` | **是** | 网关签发 Session JWT 的私钥 (HMAC SHA-256)，建议 32 字符以上随机字符串。 | `your-256-bit-secret-key-base64` |
| `AUTH_SERVICE_URL` | **是** | 权限资源服务器的基础 URL，用于根据 Email 查询域名权限。 | `https://res.example.com/api/resource/` |
| `JWT_EXPIRATION` | 否 | 网关签发 JWT 的有效期（秒）。如果不设置，默认为 86400 (24小时)。 | `3600` |
| `DEBUG` | 否 | 设置为 `true` 开启调试模式。开启后会打印请求详情和详细错误堆栈到日志，生产环境建议关闭。 | `true` |
| `HOST_MAP` | **KV** | (绑定) 域名映射 KV Namespace，不属于环境变量，需单独绑定。 | - |

## 7. 实施步骤规划
1.  **环境准备**: 在 EdgeOne 控制台配置上述环境变量并创建/绑定 KV Namespace `HOST_MAP`。
2.  **开发**: 
    -   **OIDC 自动发现**: 实现 `fetch(OAUTH_DISCOVERY_URL)` 并缓存配置（内存缓存），避免每次请求都去发现。
    -   **Cookie & JWT**: 使用 Web Crypto API 实现。
3.  **本地测试**: 使用 `edgeone pages dev` 模拟环境。
4.  **部署验证**: 部署后测试完整 OAuth 流程，并尝试篡改 Cookie 验证安全性。
