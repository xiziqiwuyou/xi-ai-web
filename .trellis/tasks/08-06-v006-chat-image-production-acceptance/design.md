# 技术设计

## 1. 请求边界

前端只提交 session-scoped API Key、模型 ID、用户输入和允许的功能参数。服务端根据 Admin 模型目录和环境配置解析厂商/端点，统一向 `api.xi-ai.cn` 发出上游请求；外部 URL 不参与目标选择。所有请求路径必须经过模块开关、模型能力、大小、超时、速率和错误脱敏检查。

## 2. Chat 验收链

沿现有 provider adapter 和 stream reader 验证：请求投影、流式帧解析、服务端缓冲、背压、abort、终止帧、错误状态、IndexedDB 节流持久化和 UI 底部跟随。测试不得依赖真实供应商凭据；真实联调单独记录请求端点、模型和时间，不保存 Key。

## 3. Image 验收链

沿现有 image generation route 与 provider adapter 验证：模型能力映射、文生图/图生图分支、尺寸/质量/格式规范化、单图结果、超时/ETA、响应中的图片字节或 data URL、安全的复制/下载和编辑入口。删除或隐藏 UI 参数时必须确认服务端不会继续发送过时字段，也不能让模型能力不匹配的参数静默生效。

## 4. 发布证据

每个结论标记为 `contract`、`browser`、`live-api` 或 `online-smoke`。任何缺少真实 Key、HTTPS、反向代理或线上环境的证据都必须明确记为未验证，而不是 PASS。
