# nano-banana-service

n8n workflow `2fUBVc1ev4rsd9dG` 的服务器版本。完全脱离 n8n，Docker 部署。

## 流程

```
POST /nano  (立即返回 202，后台跑)
   └─ 飞书查"状态=待处理"
        └─ 每条记录:
             ├─ 拉词库 → 随机 1 背景 + 3 动作 → 拼 prompt1/2/3
             ├─ 拉模特+衣服参考图临时 URL
             ├─ nano-banana 生图1 (prompt1 + 全部参考)
             ├─ 并行:
             │    A. 下载图1 → 1440×2560 → gpt 写文案 → 文案
             │    B. 上传图1 → 生成图片
             │    C. nano 生图2 (prompt2 + 模特脸×3 + 图1) → 生成图片2
             │    D. nano 生图3 (prompt3 + 模特脸×3 + 图1) → 生成图片3
             └─ 状态="已完成"
   └─ 全部跑完 → 企微通知"图片已生成完毕 @林笙"
```

## 文件

```
nano-banana-service/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── src/
    ├── config.js        # 读 .env
    ├── logger.js        # pino
    ├── feishu.js        # token/查表/取下载链接/上传/更新
    ├── prompts.js       # 拼 prompt1/2/3（移植自 n8n "提取字段"）
    ├── nano.js          # grsai nano-banana 调用 + SSE 解析
    ├── caption.js       # OpenAI 兼容 vision 写文案
    ├── notify.js        # 企微机器人
    ├── pipeline.js      # 主流程
    ├── runOnce.js       # CLI 一次性运行
    └── index.js         # Express 入口
```

## 部署

1. 把目录拷到服务器（Ubuntu / Debian 都行，要装 Docker + docker compose）

2. `cp .env.example .env`，填好下面 2 套关键密钥：
   ```
   FEISHU_APP_ID=...
   FEISHU_APP_SECRET=...
   OPENAI_BASE_URL=...
   OPENAI_API_KEY=...
   OPENAI_MODEL=gpt-5.4
   ```
   其余（nano-banana key、企微 webhook、飞书 app_token / table_id）已经预填，按需调整。

3. 起服务：
   ```
   docker compose up -d --build
   docker compose logs -f
   ```

4. 触发一次：
   ```
   curl -X POST http://你的服务器IP:3000/nano
   ```
   返回 `{"status":"started"}`。日志在 `docker compose logs -f` 里看。

5. 同步等结果（适合本地调试，会卡到全部跑完）：
   ```
   curl -X POST http://你的服务器IP:3000/nano/sync
   ```

6. 健康检查：`GET /health` → `{"ok":true}`

## 背景模式

主表只使用现有的文本字段 `背景模式` 一列：

- 留空、`自动背景`或`自动场景`：从词库随机选择普通背景；编号 77（白色）和 78（米色）不会参与随机选择。
- 直接填写数字，例如 `34`：按编号 34 读取词库中的 `背景提示词2`。
- 直接填写 `77`：读取白色背景词库记录。
- 直接填写 `78`：读取米色背景词库记录。

建议把字段默认值设为 `自动背景`。动作仍从词库的 `动作提示词` 字段随机读取；编号 77/78 及白色/米色记录不会参与动作随机。

## 跟原 n8n 工作流的对应

| n8n 节点 | 这里的位置 |
|---|---|
| 手动触发 / Webhook (`/nano`) | `POST /nano` |
| Date & Time | `pipeline.js#todayStamp` |
| 查询待处理记录 / 读取词库 | `feishu.js#searchRecords` |
| 获取 AccessToken | `feishu.js#getTenantToken`（带缓存） |
| 提取字段（Code） | `prompts.js#buildPrompts` + `collectFileTokens` |
| 获取临时下载链接 | `feishu.js#batchGetTmpDownloadUrls` |
| 组装请求（Code） | 内联在 `pipeline.js#processRecord` |
| HTTP 生图 1/2/3 + Code 解析 | `nano.js#nanoBanana` |
| 下载生成图1 → Edit Image2 (resize) | `pipeline.js` A 分支 + `sharp` |
| AI Agent (gpt-5.4 + system prompt) | `caption.js#writeCaption` |
| 上传素材到飞书 3/4/原 | `feishu.js#uploadImageByUrl` (download → upload_all) |
| Bitable update bitable / 1 / 2 / 3 | `feishu.js#updateRecord` |
| 更新为已完成 | `pipeline.js` 结尾 |
| HTTP Request (企微) executeOnce | `notify.js#notifyWeChat`，run 结束时调用一次 |
| errorWorkflow XYjmuph7NsPKRAKy | **未实现**，错误直接吞下 + 写 log。如果你要的话告诉我那个 workflow 干嘛的 |

## 已知差异 / 注意

1. **企微通知时机**：n8n 里挂在 splitInBatches output 0 + executeOnce，理论上是 *全部跑完后* 通知一次。这里也是全部跑完后通知一次，行为一致。
2. **错误处理**：原来连了 `errorWorkflow`，这版只 log 不上报。如果你想把失败记录的 `record_id` + 错误推到飞书 / 企微，告诉我。
3. **并发**：默认 `RECORD_CONCURRENCY=1`（跟原 splitInBatches 一致）。如果飞书表里堆了很多，可以调到 2~3，但 nano-banana 那头容易撞限流。
4. **token 缓存**：飞书 tenant_access_token 在内存里缓存，提前 60s 过期刷新。原 n8n 每条记录都重新拿一次，浪费。
5. **图片上传**：原 n8n 的 `space:uploadByUrl` 内部就是"下载 + 上传 upload_all"。这里直接这么实现。如果飞书改了接口要换成 `upload_external`，把 `uploadImageByUrl` 改两行即可。
6. **Sharp on Alpine**：用了 Debian slim 镜像而不是 Alpine，因为 sharp 在 musl 上要装 build-deps，太蛋疼。
```
