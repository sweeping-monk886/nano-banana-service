# 部署与更新

当前版本见 `VERSION`。本版本是纯 Node.js 线上版本，不使用 FaceFusion、InsightFace、CUDA、Python 或 OpenCV。

## 更新已有电脑

解压更新包后运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deployment\install-update.ps1 -ProjectPath 'D:\小红书项目\nano-banana-service-20260730-0150-clean'
```

脚本会停止旧服务、备份被覆盖文件和 `.env`、删除旧版 FaceFusion/Python 残留、写入新代码、验证并重新启动。任何一步失败都会自动恢复旧版。

手动回退最近一次更新：

```powershell
.\deployment\rollback-update.ps1 -ProjectPath 'D:\小红书项目\nano-banana-service-20260730-0150-clean'
```

出现问题时不要现场改源代码。进入项目目录运行：

```powershell
.\collect-diagnostics.ps1
```

把生成的 `diagnostics-*.zip` 发回即可。诊断包会隐藏密钥，也不包含人物或服装图片。

## 首次安装

只要求 Node.js 20 或更高版本：

```powershell
npm ci --omit=dev
Copy-Item .env.example .env
```

填写 `.env` 中的飞书、Nano 和 OpenAI 兼容接口配置，然后运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start-service.ps1
.\verify-install.ps1 -RequireService
```

## 图像流程

1. 第一张人物图始终是主正脸身份参考，后续人物图作为同一个人的其他视角参考，最多 8 张。
2. 衣服图保持原图，提示词要求 Nano 只读取服装和鞋子，不复制衣服模特的脸、发型、表情、体型或配饰。
3. 图 1 使用全部人物参考图和衣服图生成。
4. 图 2、图 3继续使用全部人物图和图 1；图 1是后续图片唯一的服装细节来源，避免服装图案在多个参考之间漂移。
5. 结果保持 Nano 的原始 4K 尺寸，并统一以 PNG 上传；若 PNG 超过飞书文件限制，记录会失败并在日志中明确提示，不会偷偷转成 JPG。

## 背景与服装字段

主表可增加以下字段：

```text
背景模式        文本：留空或自动背景 / 数字编号（77=白色，78=米色）
```

`背景模式`为空、填写“自动背景”或“自动场景”时按自动模式处理，随机时排除词库编号 77、78及标记为白色/米色的记录。填写纯数字（例如 `34`）时直接读取该编号；填写 `77` 或 `78` 时分别读取白色或米色记录；编号不存在或没有背景提示词时不会调用生图接口。建议把字段默认值设为“自动背景”。

词库如已有 `背景类型` 字段可继续保留；白色/米色分类仅作为编号缺失时的兼容标识，自动场景仍会排除这两类记录。

“衣服参考图”建议上传完整搭配图。生成时会保留其中可见的衣服、鞋、帽、包和其他配饰，但不会复制服装图中的人物和背景。

默认配置：

```dotenv
NANO_IMAGE_SIZE=4K
FEISHU_IMAGE_MAX_MB=18
```

## 使用

健康检查：

```powershell
curl.exe --noproxy "*" http://127.0.0.1:3010/health
```

触发后台任务：

```powershell
curl.exe --noproxy "*" -X POST http://127.0.0.1:3010/nano
```

`/nano` 返回 `{"status":"started"}` 只表示任务已经开始。默认会批量处理所有状态为“待处理”的记录，并按 `RECORD_CONCURRENCY` 控制并发。当前默认并发为 2，即同时处理两条记录；同一条记录内的图片仍按顺序生成。此时不要再调用 `/nano/sync`，否则会返回 `already_running`。

## 飞书按钮

飞书多维表格的“点击生成”按钮需要绑定自动化：点击按钮后发送 HTTP 请求。线上请求地址使用：

```text
https://你的线上域名/nano
```

推荐在飞书自动化中使用 `POST`，点击后直接启动。按钮只需继续绑定原来的 `/nano` 地址；线上使用公网 HTTPS 域名即可。返回 `{"status":"started"}` 表示任务启动；返回 `{"status":"already_running"}` 表示已有任务运行，不会重复启动。

## 安全

`.env` 包含飞书、Nano 和文案接口密钥，不得提交 Git 或放进交付压缩包。人物和服装图片也不会进入更新包或诊断包。
