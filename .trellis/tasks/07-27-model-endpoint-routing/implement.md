# Implementation Plan

## Phase 1 - Contract and normalization

1. 在 `src/types.ts` 增加 `ModelEndpointProtocol` 和必填的 `endpointProtocol`。
2. 在服务端 provider 类型边界增加协议白名单、厂商默认映射和规范化函数。
3. 在模型目录规范化、默认目录、旧 provider 迁移和 runtime provider 中传递协议。

## Phase 2 - Admin model editor

1. 扩展 `ModelDraft`、空白草稿、编辑回填和模型预设。
2. 增加四项端点选择，厂商切换时应用推荐默认值。
3. 在映射预览中显示实际请求模型名与协议路径。
4. 确认 CRUD、bootstrap 和元数据导入导出通过服务端规范化完成 round-trip。

## Phase 3 - Runtime routing

1. 将 provider registry 拆为厂商适配器和对话协议适配器两层组合。
2. 为 Qwen 暴露明确的 Chat 与 Responses 构造器，保留参数归一化。
3. 调整 URL 版本推导，确保四个协议生成精确端点且媒体路径不回归。

## Phase 4 - Regression coverage

1. 扩展 provider contracts：四个协议、OpenAI 双端点、Kimi Chat、旧字段默认、媒体方法不受影响。
2. 扩展 Admin E2E：选择、保存、重新载入协议。
3. 更新测试 bootstrap fixture 和静态 feature/UI contracts。

## Validation

```text
npm run check
npm run provider-contracts
npm run automation-contracts
npx playwright test tests/e2e/admin-shell.spec.ts
npm run feature-audit
npm run build
npm run ui-runtime
npm run smoke
git diff --check
```
