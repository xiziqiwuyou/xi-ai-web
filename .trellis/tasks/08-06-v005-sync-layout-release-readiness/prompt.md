# 项目执行提示词

你正在维护 `xi-ai-web`。当前最新不可变发布版本是 `v0.0.5`，当前工作区只允许完成该版本之后的跨设备同步弹窗布局收口，并建立下一版本的可审计基线。

执行前必须读取：

1. `.trellis/tasks/08-06-v005-sync-layout-release-readiness/prd.md`
2. `.trellis/tasks/08-06-v005-sync-layout-release-readiness/design.md`
3. `.trellis/tasks/08-06-v005-sync-layout-release-readiness/implement.md`
4. `.trellis/spec/frontend/index.md`
5. `.trellis/spec/frontend/component-guidelines.md`
6. `.trellis/spec/frontend/quality-guidelines.md`

必须遵守以下任务边界：

- 只修改同步弹窗样式、同步回归测试、本任务资料和监督智能体配置。
- 不修改同步协议、端到端加密、授权码、确认/拒绝/取消/超时、API Key 二次确认或接收端恢复逻辑。
- 不新增业务功能、依赖、数据库、模型协议、服务器部署或 GitHub 发布动作。
- 不把历史 `in_progress` Trellis 任务自动并入当前任务。
- 不覆盖 `v0.0.5` 标签，不宣称未验证的线上发布或真实 API 联调结果。

实现目标：

- 同步标签栏和正文整体上移，消除 Grid 拉伸产生的大段空白。
- 桌面弹窗外框、标题、标签栏和正文视口在方向/状态切换时保持稳定。
- 审批界面替换二维码区域并首屏可见，确认按钮无需滚动即可操作。
- 同步正文保持唯一滚动所有者，普通状态无可见滚动条，真实滚动后短暂显示。
- 移动端保持视口、安全区、触摸目标和单滚动所有者契约。
- 切换动画仅做轻量淡入，不改变内容几何位置。

完成前必须运行并记录真实结果：

- `npm run check`
- `npm run build`
- `npm run privacy`
- `npm run release-check`
- `npm run test:e2e -- tests/e2e/progress-sync-cross-device.spec.ts`
- `git diff --check`

在每个阶段结束时调度 `xi-ai-web-supervisor` 做只读审查。P0/P1 发现必须阻止任务完成；P2/P3 进入后续列表。监督智能体不得编辑、提交、推送或部署。
