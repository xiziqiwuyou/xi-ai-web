# Execution Prompt

```text
你正在 C:\Users\56252\Documents\New project 2 开发 xi-ai-web。请使用 Trellis 工作流，先读取 AGENTS.md、.trellis/workflow.md、本任务 prd.md/design.md/implement.md、risk-assessment.md，以及 frontend/backend 对应规范。当前任务是规划后才进入实施，不要跳过安全评审、回归测试或移动端验证。

总体目标：
1. 审计并补齐移动端网页版适配，保证常见手机/平板视口、软键盘、安全区、横竖屏、字体放大、暗黑模式和 reduced-motion 下可用。
2. 新增“临时同步”功能。它不是实时同步，而是用户手动把某一时刻已经稳定保存的工作区快照同步到另一台设备。
3. 把跨设备同步作为全局壳层工具：桌面端放在左下角访问卡片中，与工作区数据、日夜主题按钮同一排；移动端放在顶部工具区。入口只显示图标，使用 aria-label/title 在悬停或辅助技术中说明。点击后在独立弹窗内选择方向。

产品边界：
- 不创建普通用户账号，不做后台常驻同步，不做实时/持续/双向自动更新。后续改动不会自动传播，再次同步必须重新生成授权码。
- 临时同步的默认数据是现有 WorkspaceExportEnvelope 中全部稳定 IndexedDB 集合，以及捕获时间、source workspaceRevision、当前模块/路径和 lastModelId。
- 未发送草稿、React 临时 UI、流式输出、未完成生成任务、Cookie、Admin 会话、知识库登录态和 HttpOnly 状态不进入 MVP。
- 普通工作区导出继续完全排除凭据。
- API Key 可以放入端到端加密的临时同步载荷，但默认不勾选；勾选后必须二次确认；接收端只显示掩码；只有工作区恢复成功后才能写入 sessionStorage。
- 默认 merge；replace 必须使用共享 ConfirmationDialog。任何失败不得部分修改 IndexedDB 或 API Key。
- 二维码由浏览器本地生成，只允许包含当前站点同源 `/chat#sync=<六位数字>`。扫码页面必须立即用 history.replaceState 清除 fragment，再打开已预填授权码的接收确认；禁止自动加入。
- 二维码不得包含工作区、API Key、creator/join token、双方公钥或私钥、密文、nonce 或派生密钥。

授权码与加密设计：
- 六位纯数字临时码，例如 381726，只作为会合标识，不是解密密码，也不能单独领取数据。服务端生成需避免取模偏差，并继续执行严格的 IP/会话尝试次数限制。
- 发送端和接收端在浏览器中各自生成不可导出的 Web Crypto ECDH P-256 临时密钥对，并交换公钥和随机 nonce。
- 使用 ECDH 共享秘密 + HKDF-SHA-256 派生 AES-256-GCM Key；使用随机 96-bit IV；握手 transcript 作为 HKDF info/AAD。
- transcript 必须包含协议版本、session ID、双方公钥和双方 nonce。两端计算并显示相同的六位安全指纹。
- 发送端只有在用户核对指纹并点击“确认并发送”后，才允许捕获、加密和上传快照。指纹不一致必须取消重建。
- 服务端只能看到授权码映射、双方公钥、token hash、有界状态/时间/大小和密文，永远不能获得私钥、派生 Key、工作区明文或 API Key。
- 页面刷新或关闭会丢失临时私钥并使当前尝试失效；UI 必须明确提示保持页面打开。

稳定快照：
- 在 workspaceDb 暴露有界 readWorkspaceRevision()。
- 捕获前等待写队列，读取 revision，读取并校验完整 snapshot，再读取 revision；前后不一致则重试或提示工作区在变化。
- 接收端预览时记录本地 revision；用户确认恢复前再次读取，若变化则重新生成预览，避免覆盖刚产生的新数据。
- 复用现有 WorkspaceExportEnvelope、计数、SHA-256、sanitize、merge/replace 和写入暂停机制，禁止创建旁路序列化/恢复逻辑。

服务端临时会话：
- 状态机：waiting_join -> awaiting_approval -> approved -> payload_ready -> claimed -> completed；任意未完成状态可进入 rejected/cancelled/expired。
- 接口：create、join、status、approve、reject、payload upload、claim、cancel。所有 token 放请求 body/header，不进入 query string。
- 握手接口使用独立小 JSON parser；密文上传使用独立 raw parser；均在全局 2MB parser 前挂载。
- 提取并复用项目限流器。限制 IP/会话猜码次数、一个 pending receiver、一次上传、一次 claim、默认 10 分钟 TTL、默认 32MB 密文上限。
- 单实例默认使用内存保存短期状态、DATA_DIR/progress-sync 保存密文，并做启动/定时清理。服务器重启可使当前码失效，但不能影响浏览器工作区。
- 可选生产模式使用 Redis 保存 TTL 状态、尝试次数、presence/status 和短锁；大密文放持久卷或 S3/COS。Redis 不得保存明文，也不得成为大密文唯一副本。
- 所有响应 no-store，错误/日志脱敏，token 常量时间比较，路径不可遍历，领取必须原子。

UI：
- 不占用右侧工作台高度，不新增永久公共导航菜单。桌面左下角工具行依次容纳工作区数据、跨设备同步和日夜主题图标；移动端顶部工具区提供相同同步图标。管理员关闭功能后入口完全隐藏。
- 点击同步图标默认打开发送页；弹窗内桌面方向为“同步到手机 / 从手机同步”，移动端方向为“同步到电脑 / 接收电脑进度”。
- 使用独立同步弹窗；“工作区数据”弹窗只保留文件导出、导入和恢复。
- 桌面发送端显示二维码、六位备用码、复制、倒计时、等待状态、请求设备提示、六位安全指纹、确认并发送、拒绝、取消；移动发送端重点显示六位码，不要求扫描自身二维码。
- 接收端支持粘贴/自动大写分组，显示相同指纹并等待批准；领取解密后展示时间、revision、数据计数、目标模块、大小和 Key 掩码，再选择 merge/replace。
- 所有状态有可读错误和恢复动作；触控目标至少 44x44px；焦点、读屏 live region、safe-area、暗黑和 reduced-motion 正常。

移动端验收：
- 自动化至少覆盖 360x800、375x812、390x844、412x915、768x1024，以及横竖屏切换。
- 测试 virtualViewport/软键盘、safe-area、200% 字体、长中文、所有公共模块和共享弹窗。
- 上线前记录真实 iOS Safari 与 Android Chrome 对 Chat、图片、PPT、导图、助手、翻译、发送进度和接收进度的冒烟结果。

风险与失败用例：
- 错误/过期码、猜码超限、发送端离线、重复 join、拒绝、指纹不符、任一端刷新、捕获 revision 变化、预览后 revision 变化、超限、上传中断、重复 claim、密文篡改、错误 Key、未来版本、无 Web Crypto、恢复失败。
- 每个失败都必须保证接收端 IndexedDB 和 sessionStorage 原状不变。
- 测试必须证明服务端密文文件、日志、错误中不存在明文哨兵和测试 API Key。

实施顺序：
既有 Phase 01-08 保持完成状态；本轮 Phase 09 统一六位数字码，Phase 10 壳层图标入口与独立弹窗，Phase 11 本地二维码和 fragment 接力，Phase 12 双向流程、移动端与安全回归。

最终验证：npm run check、npm run build、npm run workspace-storage-contracts、npm run test:security、npm run test:server、临时同步 contracts、移动端/公共导航/跨设备 Playwright、npm run ui-contract、npm run feature-audit、npm run privacy、git diff --check。

保持现有脏工作区，不回滚不相关改动；不提交或推送未经用户确认的代码；每阶段完成后更新 Trellis 任务状态和验证证据。
```

## Reverse QR Extension Prompt - 2026-08-04

```text
在现有 xi-ai-web 跨设备临时同步上实现“从手机同步也可扫码”，不得新建账号、数据库、实时同步或第二套持久化系统。

产品流程：电脑点击“从手机同步”后，默认以接收方身份创建一次性会话并显示二维码与六位备用码；手机扫描二维码后打开同源 /chat 页面，进入“发送到电脑”状态，但必须由用户明确点击确认后才允许捕获手机工作区。两端显示同一安全指纹，手机作为语义发送方明确批准并上传端到端加密快照，电脑作为语义接收方解密预览后选择合并或替换。现有手机生成六位码、电脑手动输入的流程继续作为备用方式。

协议边界：扩展现有 session，新增 backward-compatible creatorRole=sender|receiver，省略时必须等价于 sender。creator/join 只是连接顺序，所有敏感操作必须按语义角色授权：sender 才能 approve/reject/upload，receiver 才能 claim/restore，双方均可 cancel。join 只能使用 creatorRole 的互补角色，禁止同角色或冲突字段。ECDH transcript 始终按 sender 后 receiver 排列，不能按 creator 后 join 排列。

URL 边界：保留 #sync=<六位数字> 表示扫码设备作为接收方；新增严格的 #sync-send=<六位数字> 表示扫码设备作为发送方。两种 fragment 都要在读取后立即 history.replaceState 清除。fragment 只允许包含方向标记和六位码，不得包含 API Key、creator/join token、sessionId、公钥、nonce、密文、工作区或派生密钥。扫码不得自动 join、捕获、上传、claim 或 restore。

安全边界：继续使用现有无偏差六位码、10 分钟 TTL、IP/会话尝试限制、一个 pending peer、HMAC token hash、constant-time 比较、P-256 ECDH、HKDF-SHA-256、AES-256-GCM、transcript 指纹、no-store、稳定 revision 捕获、原子 restore 与 API Key 默认关闭和二次确认。服务端必须拒绝所有错误角色调用且在拒绝后状态和密文存储不变。

兼容边界：旧 API 请求没有 role 时行为不变；旧 #sync 链接不变；现有桌面传手机 QR、手机六位码传电脑、文件导入导出、Admin 开关和移动端入口均不得回归。普通本地导出仍不得包含凭据。

UI 边界：二维码在浏览器本地生成；电脑“从手机同步”默认展示扫码方式，并保留“输入手机授权码”备用入口。手机通过反向 QR 打开后显示明确的发送确认、可选 API Key 二次确认、指纹和取消；电脑显示等待手机、指纹、恢复预览和 merge/replace。不要增加公共导航菜单或占用工作台高度。

测试要求：服务端覆盖两种 creatorRole、互补 join、错误角色 approve/upload/claim/reject、旧客户端兼容、限流、过期、重复操作和无副作用；Playwright 使用隔离桌面/手机上下文跑通两个 QR 方向和手动回退，断言 fragment 立即清除、扫码不自动上传、指纹一致、IndexedDB 精确恢复、可选 Key 策略和路由/模型恢复。最后运行 check、build、test:server、test:security、workspace-storage-contracts、privacy、ui-contract、feature-audit 和 git diff --check。
```

## Stable Dialog Geometry Prompt - 2026-08-04

```text
在现有 xi-ai-web 跨设备同步弹窗上完成一次纯前端布局重构，解决“同步到手机”和“从手机同步”切换时弹窗高度变化、整体窗口放大缩小和内容跳动的问题。不得修改同步协议、二维码内容、授权码规则、加密流程、服务端状态机、API Key 二次确认或工作区恢复语义。

现状与目标：当前“同步到手机”空闲页包含扫码说明、API Key 选项和主按钮，“从手机同步”空闲页只包含扫码说明、主按钮和松散的方式切换文字，因此内容高度直接撑开 `.ui-dialog`，两页切换时外壳明显缩放。重构后，桌面端弹窗宽度、高度、顶部位置、标题区和方向页签位置在切换前后必须保持一致；只有页签下方的内容发生变化，用户不应感知到窗口尺寸变化。

布局边界：
1. 保留现有标题、说明、关闭按钮、方向页签、配色、圆角和视觉语言，不新增无关说明或装饰。
2. 桌面端先用 Playwright 测量 `1280x800` 与 `1440x900` 下两个空闲页和最长可接受状态的实际尺寸，再以测量结果确定一个稳定外壳高度；不得凭感觉写死高度。外壳使用明确的 grid 行：固定标题区 + `minmax(0, 1fr)` 内容区。
3. 弹窗标题区和方向页签不得参与切换动画，也不得发生位移。内容区必须 `min-height: 0`，长内容只在 `.progress-sync-dialog-body` 内滚动，不能继续撑高外壳或让页面成为第二滚动所有者。
4. 两个空闲页统一为三个等价结构槽位：扫码/授权说明区、次级选项区、主操作区。发送页的次级选项是“同时传输 API Key”；接收页的次级选项是紧凑且明确的“扫码 / 授权码”接收方式控制，替代底部游离的文字链接。两页槽位间距、最小高度和按钮基线一致。
5. 接收方式切换为授权码后，六位输入与确认操作仍在既定内容槽位中完成，不得再次改变弹窗外壳高度。错误文案、加载、等待、指纹、二维码、恢复预览和成功状态均在稳定内容视口内布局；内容超出时内部滚动。
6. 不对 width、height、top、padding 等几何属性做过渡动画。允许内容在 `120-160ms` 内使用轻微透明度变化和不超过 `4px` 的位移完成切换；`prefers-reduced-motion: reduce` 下立即切换。
7. 移动端不得照搬桌面固定高度。弹窗受 `100dvh`、safe-area 和 `visualViewport` 约束，使用可用高度上限与等高的空闲内容最小区；软键盘出现时内容区内部滚动，关闭按钮和当前输入始终可达。触控目标至少 `44px`。
8. 保持 Dialog 的焦点陷阱、Escape、scrim、焦点恢复、`data-scroll-owner="dialog"`、暗黑模式和读屏语义不变。方向页签继续使用 `tablist/tab/tabpanel`，切换后焦点停留在所选页签。

验收标准：
- 在 `1280x800`、`1440x900` 下，连续切换“同步到手机 / 从手机同步”至少 10 次，`.progress-sync-dialog` 的 x、y、width、height 前后差值均不超过 `1px`。
- 标题、关闭按钮和方向页签的 bounding box 前后差值均不超过 `1px`，页面背景和公共工作台不发生滚动或位移。
- 发送空闲、接收扫码、接收授权码、加载、等待二维码、指纹确认、恢复预览、错误和成功状态都不会改变桌面弹窗外壳尺寸；超长状态只滚动内容区。
- 在 `390x844`、`375x812` 和软键盘模拟下，无横向溢出，弹窗不超出可视区域，仅有一个可见垂直滚动所有者，所有操作可触达。
- reduced-motion 下没有实际切换动画；常规模式下只动画内容，不动画弹窗几何。
- 运行针对性 Playwright 几何回归、移动端布局回归、`npm run check`、`npm run build`、`npm run ui-contract` 和 `git diff --check`。
```
