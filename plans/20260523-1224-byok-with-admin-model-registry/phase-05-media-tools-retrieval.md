# Phase 05 - Media, Tools, Retrieval

## Overview

Status: Completed  
Priority: P1

不同能力按模型目录里的 capability tags 路由，不支持的能力不在前台展示。

## Scope

- 对话
- 多模态
- 画图
- 语音
- 工具调用
- 向量检索

## Rules

- OpenAI / Gemini 用原生能力。
- Claude 只接它原生支持的能力。
- 向量检索由后台 embedding 模型目录决定。
- 用户的 URL / Key 仍然走请求时带入。

## Success Criteria

- 能力展示和实际请求一致。
- 不支持的能力不进入用户可见选项。
- RAG 不依赖用户登录。
