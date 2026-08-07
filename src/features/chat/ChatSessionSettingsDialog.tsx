import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Check, Code2, Keyboard, MessageSquareText, Paintbrush, Settings2, Sigma, SlidersHorizontal, X } from "lucide-react";
import { ConfirmationDialog, Dialog, FigmaMenu, type FigmaMenuOption } from "../../components/ui";
import { compactModelLabel } from "../../components/workbench";
import type { ModelCatalogEntry } from "../../types";
import {
  assistantAvatarPresets,
  chatCodeThemeValues,
  chatContextSizeValues,
  chatImageAttachmentLimitValues,
  chatMaxTokenMaximum,
  chatMessageFontSizeValues,
  chatResponseVerbosityValues,
  chatSendShortcutValues,
  chatTitleSummaryMessageCountValues,
  chatToolInvocationModes,
  cleanSettingChoice,
  defaultChatSessionSettings,
  personalAvatarPresets,
  type ChatSessionSettings
} from "./chatSessionSettings";

type ChatSessionSettingsDialogProps = {
  open: boolean;
  settings: ChatSessionSettings;
  models: ModelCatalogEntry[];
  onSettingsChange: (patch: Partial<ChatSessionSettings>) => void;
  onCancel: () => void;
  onSave: () => void;
};

type SettingsSectionProps = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  children: ReactNode;
};

function SettingsSection({ id, title, description, active, children }: SettingsSectionProps) {
  return (
    <section
      id={`${id}-panel`}
      className="figma-settings-section"
      aria-labelledby={`${id}-tab`}
      role="tabpanel"
      tabIndex={0}
      hidden={!active}
    >
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className="figma-settings-section-body">{children}</div>
    </section>
  );
}

type SettingToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

function SettingToggle({ label, description, checked, disabled, onChange }: SettingToggleProps) {
  return (
    <div className={disabled ? "figma-setting-row disabled" : "figma-setting-row"}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <button
        type="button"
        className={checked ? "figma-setting-switch active" : "figma-setting-switch"}
        aria-label={label}
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}

type MenuSettingProps = {
  label: string;
  ariaLabel?: string;
  description: string;
  value: string;
  options: readonly FigmaMenuOption[];
  className?: string;
  onChange: (value: string) => void;
};

function MenuSetting({ label, ariaLabel = label, description, value, options, className = "", onChange }: MenuSettingProps) {
  return (
    <div className={`figma-setting-row figma-setting-menu ${className}`.trim()}>
      <span><strong>{label}</strong><small>{description}</small></span>
      <FigmaMenu
        label={label}
        ariaLabel={ariaLabel}
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  );
}

type DiscreteRangeOption<T extends string | number | null> = {
  value: T;
  label: string;
};

type DiscreteRangeSettingProps<T extends string | number | null> = {
  id: string;
  label: string;
  description: string;
  value: T;
  options: readonly DiscreteRangeOption<T>[];
  onChange: (value: T) => void;
};

function DiscreteRangeSetting<T extends string | number | null>({ id, label, description, value, options, onChange }: DiscreteRangeSettingProps<T>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex];
  const lastOption = options[options.length - 1];
  const progress = options.length > 1 ? (selectedIndex / (options.length - 1)) * 100 : 0;

  return (
    <label className="figma-range-control figma-discrete-range">
      <span><strong id={`${id}-label`}>{label}</strong><small id={`${id}-description`}>{description}</small></span>
      <div className="figma-range-track" style={{ "--range-progress": `${progress}%` } as CSSProperties}>
        <i aria-hidden="true" />
        <input
          id={id}
          type="range"
          min="0"
          max={String(options.length - 1)}
          step="1"
          value={selectedIndex}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description`}
          aria-valuetext={selectedOption.label}
          onChange={(event) => {
            const nextOption = options[Number(event.target.value)];
            if (nextOption) onChange(nextOption.value);
          }}
        />
      </div>
      <small><span>{options[0]?.label}</span><output htmlFor={id}>{selectedOption.label}</output><span>{lastOption.label}</span></small>
    </label>
  );
}

type MaxTokenSettingProps = {
  enabled: boolean;
  value: number;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: number) => void;
};

function MaxTokenSetting({ enabled, value, onEnabledChange, onValueChange }: MaxTokenSettingProps) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = () => {
    if (!inputValue.trim()) {
      setInputValue(String(value));
      return;
    }
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed)) {
      setInputValue(String(value));
      return;
    }
    const nextValue = Math.min(chatMaxTokenMaximum, Math.max(1, Math.trunc(parsed)));
    onValueChange(nextValue);
    setInputValue(String(nextValue));
  };

  return (
    <div className="figma-output-token-setting">
      <div className="figma-setting-row">
        <span>
          <strong>最大 Token 数</strong>
          <small>{enabled ? "手动限制单次模型输出长度" : "不限，由模型与厂商的输出上限决定"}</small>
        </span>
        <div className="figma-output-token-actions">
          {enabled ? (
            <label className="figma-output-token-input">
              <input
                aria-label="最大 Token 数值"
                type="number"
                min="1"
                max={chatMaxTokenMaximum}
                step="1"
                inputMode="numeric"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <span>Token</span>
            </label>
          ) : <span className="figma-output-token-unlimited">不限</span>}
          <button
            type="button"
            className={enabled ? "figma-setting-switch active" : "figma-setting-switch"}
            aria-label="最大 Token 数"
            aria-pressed={enabled}
            onClick={() => onEnabledChange(!enabled)}
          >
            <i />
          </button>
        </div>
      </div>
    </div>
  );
}

const contextOptions = chatContextSizeValues.map((value) => ({ value, label: value === "1024" ? "1M tokens" : `${value}K tokens` }));
const imageAttachmentLimitOptions = chatImageAttachmentLimitValues.map((value) => ({ value: String(value), label: `${value} 张` }));
const toolInvocationOptions = [
  { value: "prompt", label: "使用提示词" },
  { value: "function", label: "使用函数调用" }
] as const satisfies readonly FigmaMenuOption[];
const responseVerbosityOptions = [
  { value: "default", label: "默认" },
  { value: "low", label: "简洁" },
  { value: "medium", label: "适中" },
  { value: "high", label: "详细" }
] as const satisfies readonly FigmaMenuOption[];
const codeThemeOptions = [
  { value: "auto", label: "跟随界面" },
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" }
] as const satisfies readonly FigmaMenuOption[];
const sendShortcutOptions = [
  { value: "enter", label: "Enter" },
  { value: "ctrl-enter", label: "Ctrl + Enter" }
] as const satisfies readonly FigmaMenuOption[];
const settingsNavigation = [
  { id: "appearance", label: "外观设置", description: "头像与消息布局", Icon: Paintbrush },
  { id: "model", label: "模型设置", description: "采样、长度与工具", Icon: SlidersHorizontal },
  { id: "openai", label: "OpenAI 设置", description: "详细程度与用量", Icon: Settings2 },
  { id: "messages", label: "消息设置", description: "阅读与思考内容", Icon: MessageSquareText },
  { id: "math", label: "数学公式", description: "LaTeX 渲染", Icon: Sigma },
  { id: "code", label: "代码块", description: "阅读、折叠与预览", Icon: Code2 },
  { id: "input", label: "输入设置", description: "粘贴、菜单与按键", Icon: Keyboard }
] as const;

type SettingsSectionId = typeof settingsNavigation[number]["id"];

export default function ChatSessionSettingsDialog({
  open,
  settings,
  models,
  onSettingsChange,
  onCancel,
  onSave
}: ChatSessionSettingsDialogProps) {
  const userAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const settingsHeadingRef = useRef<HTMLElement | null>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const settingsWasOpenRef = useRef(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appearance");
  const [maxTokenConfirmationOpen, setMaxTokenConfirmationOpen] = useState(false);
  const titleSummaryModel = models.find((item) =>
    item.id === settings.titleSummaryModelId || item.model === settings.titleSummaryModelId
  );
  const titleSummaryModelOptions: FigmaMenuOption[] = [
    ...(!titleSummaryModel ? [{
      value: settings.titleSummaryModelId,
      label: settings.titleSummaryModelId,
      detail: "后台模型目录尚未配置",
      disabled: true
    }] : []),
    ...models.map((item) => ({
      value: item.id,
      label: compactModelLabel(item)
    }))
  ];
  const titleSummaryMessageOptions = chatTitleSummaryMessageCountValues.map((value) => ({
    value,
    label: `最近 ${value} 条`
  }));
  const selectedUserAvatar = settings.userAvatar ||
    personalAvatarPresets.find((preset) => preset.id === settings.userAvatarPresetId)?.image ||
    personalAvatarPresets[0].image;

  useEffect(() => {
    if (open) {
      setActiveSection("appearance");
    } else {
      setMaxTokenConfirmationOpen(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (open && !settingsWasOpenRef.current && document.activeElement instanceof HTMLElement) {
      settingsReturnFocusRef.current = document.activeElement;
    }
    settingsWasOpenRef.current = open;
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = settingsHeadingRef.current?.closest<HTMLElement>(".figma-session-settings");
    if (dialog) dialog.scrollTop = 0;
  }, [activeSection, open]);

  const navigateSettings = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (!vertical && !horizontal && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const currentIndex = settingsNavigation.findIndex((item) => item.id === activeSection);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? settingsNavigation.length - 1
        : (currentIndex + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + settingsNavigation.length) % settingsNavigation.length;
    const nextSection = settingsNavigation[nextIndex].id;
    setActiveSection(nextSection);
    requestAnimationFrame(() => document.getElementById(`figma-${nextSection}-settings-tab`)?.focus({ preventScroll: true }));
  };

  const uploadUserAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") onSettingsChange({ userAvatar: reader.result });
    });
    reader.readAsDataURL(file);
  };

  return (
    <>
    <Dialog
      open={open && !maxTokenConfirmationOpen}
      labelledBy="figma-session-settings-title"
      describedBy="figma-session-settings-description"
      className="figma-session-settings"
      returnFocusRef={settingsReturnFocusRef}
      onClose={onCancel}
    >
      <header ref={settingsHeadingRef} className="figma-settings-heading">
        <div>
          <small>SESSION CONFIGURATION</small>
          <h2 id="figma-session-settings-title">会话设置</h2>
          <p id="figma-session-settings-description">按分类调整当前对话的模型、显示与输入方式。</p>
        </div>
        <button type="button" className="figma-settings-close" onClick={onCancel} aria-label="关闭会话设置">
          <X size={17} />
        </button>
      </header>

      <div className="figma-settings-layout">
        <nav className="figma-settings-navigation" aria-label="会话设置分类">
          <div className="figma-settings-tablist" role="tablist" aria-label="会话设置分类" aria-orientation="vertical" onKeyDown={navigateSettings}>
            {settingsNavigation.map(({ id, label, description, Icon }) => {
              const selected = activeSection === id;
              return (
                <button
                  key={id}
                  id={`figma-${id}-settings-tab`}
                  type="button"
                  role="tab"
                  aria-label={label}
                  aria-selected={selected}
                  aria-controls={`figma-${id}-settings-panel`}
                  tabIndex={selected ? 0 : -1}
                  className={selected ? "figma-settings-tab active" : "figma-settings-tab"}
                  onClick={() => setActiveSection(id)}
                >
                  <span className="figma-settings-tab-icon"><Icon size={16} /></span>
                  <span><strong>{label}</strong><small>{description}</small></span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="figma-settings-content">
          <div className="figma-settings-sections">
        <SettingsSection id="figma-appearance-settings" title="外观设置" description="调整头像、消息布局和阅读方式。" active={activeSection === "appearance"}>
          <div className="figma-settings-profile">
            <div>
              <strong>AI 对话头像</strong>
              <p>显示在助手消息旁</p>
              <div className="figma-avatar-presets" aria-label="AI 对话头像">
                {assistantAvatarPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={settings.assistantAvatarId === preset.id ? "active" : ""}
                    onClick={() => onSettingsChange({ assistantAvatarId: preset.id })}
                    aria-pressed={settings.assistantAvatarId === preset.id}
                    title={preset.name}
                  >
                    <img src={preset.image} alt={`${preset.name} 动漫风格 AI 头像预设`} />
                    {settings.assistantAvatarId === preset.id ? <span><Check size={10} /></span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>个人头像</strong>
              <p>仅显示在你的消息旁</p>
              <div className="figma-avatar-presets figma-personal-avatar-presets" aria-label="个人头像预设">
                {personalAvatarPresets.map((preset) => {
                  const selected = !settings.userAvatar && settings.userAvatarPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={selected ? "active" : ""}
                      onClick={() => onSettingsChange({ userAvatarPresetId: preset.id, userAvatar: null })}
                      aria-pressed={selected}
                      title={preset.name}
                    >
                      <img src={preset.image} alt={`${preset.name} 个人头像预设`} />
                      {selected ? <span><Check size={10} /></span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="figma-personal-avatar">
                <button type="button" onClick={() => userAvatarInputRef.current?.click()} aria-label="上传个人头像">
                  <img src={selectedUserAvatar} alt="个人头像预览" />
                </button>
                <div>
                  <button type="button" onClick={() => userAvatarInputRef.current?.click()}>上传个人头像</button>
                  <small>PNG、JPG，建议 1:1；自定义头像优先显示</small>
                  {settings.userAvatar ? <button type="button" className="remove" onClick={() => onSettingsChange({ userAvatar: null })}>恢复预设</button> : null}
                </div>
                <input ref={userAvatarInputRef} type="file" hidden accept="image/png,image/jpeg" onChange={uploadUserAvatar} />
              </div>
            </div>
            <div>
              <strong>消息样式</strong>
              <p>选择聊天内容的组织方式</p>
              <div className="figma-segmented">
                <button type="button" className={settings.messageStyle === "bubble" ? "active" : ""} onClick={() => onSettingsChange({ messageStyle: "bubble" })} aria-pressed={settings.messageStyle === "bubble"}>气泡式</button>
                <button type="button" className={settings.messageStyle === "list" ? "active" : ""} onClick={() => onSettingsChange({ messageStyle: "list" })} aria-pressed={settings.messageStyle === "list"}>列表式</button>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection id="figma-model-settings" title="模型设置" description="控制生成随机性、上下文、输出长度和工具调用。" active={activeSection === "model"}>
          <div className="figma-settings-grid">
            <label className="figma-range-control">
              <span id="figma-temperature-label">模型温度 · Temperature</span>
              <div className="figma-range-track" style={{ "--range-progress": `${settings.temperature * 100}%` } as CSSProperties}>
                <i aria-hidden="true" />
                <input id="figma-temperature-range" type="range" min="0" max="1" step="0.1" value={settings.temperature} aria-labelledby="figma-temperature-label" aria-describedby="figma-temperature-low figma-temperature-high" onChange={(event) => onSettingsChange({ temperature: Number(event.target.value) })} />
              </div>
              <small><span id="figma-temperature-low">严谨</span><output htmlFor="figma-temperature-range">{settings.temperature.toFixed(1)}</output><span id="figma-temperature-high">发散</span></small>
            </label>
            <label className="figma-range-control">
              <span id="figma-top-p-label">TOP-P</span>
              <div className="figma-range-track" style={{ "--range-progress": `${((settings.topP - 0.1) / 0.9) * 100}%` } as CSSProperties}>
                <i aria-hidden="true" />
                <input id="figma-top-p-range" type="range" min="0.1" max="1" step="0.1" value={settings.topP} aria-labelledby="figma-top-p-label" aria-describedby="figma-top-p-low figma-top-p-high" onChange={(event) => onSettingsChange({ topP: Number(event.target.value) })} />
              </div>
              <small><span id="figma-top-p-low">聚焦</span><output htmlFor="figma-top-p-range">{settings.topP.toFixed(1)}</output><span id="figma-top-p-high">多样</span></small>
            </label>
            <DiscreteRangeSetting
              id="figma-context-window-range"
              label="模型上下文窗口"
              description="按 Token 预算保留历史内容，最高支持 1M"
              value={settings.contextSize}
              options={contextOptions}
              onChange={(value) => onSettingsChange({ contextSize: cleanSettingChoice(value, chatContextSizeValues, "16") })}
            />
            <MaxTokenSetting
              enabled={settings.maxTokensEnabled}
              value={settings.maxTokens}
              onEnabledChange={(maxTokensEnabled) => {
                if (maxTokensEnabled) {
                  setMaxTokenConfirmationOpen(true);
                } else {
                  onSettingsChange({ maxTokensEnabled: false });
                }
              }}
              onValueChange={(maxTokens) => onSettingsChange({ maxTokens })}
            />
            <MenuSetting
              label="单次图片上限"
              description="每次请求最多携带的图片"
              value={String(settings.maxImageAttachments)}
              options={imageAttachmentLimitOptions}
              onChange={(value) => onSettingsChange({ maxImageAttachments: cleanSettingChoice(Number(value), chatImageAttachmentLimitValues, 4) })}
            />
            <SettingToggle label="流式输出" description="开启时使用上游原生流式响应；关闭后等待完整回复再显示" checked={settings.streamOutput} onChange={(streamOutput) => onSettingsChange({ streamOutput })} />
            <MenuSetting
              className="figma-tool-mode-menu"
              label="工具调用方式"
              description={settings.toolInvocationMode === "prompt" ? "通过受控提示协议调用本地工具" : "使用模型厂商原生函数调用协议"}
              value={settings.toolInvocationMode}
              options={toolInvocationOptions}
              onChange={(value) => onSettingsChange({ toolInvocationMode: cleanSettingChoice(value, chatToolInvocationModes, "function") })}
            />
          </div>
          <div className="figma-title-summary-settings">
            <SettingToggle
              label="自动总结折叠标题"
              description="折叠有新消息的对话时，使用指定模型生成简洁标题"
              checked={settings.titleSummaryEnabled}
              onChange={(titleSummaryEnabled) => onSettingsChange({ titleSummaryEnabled })}
            />
            {settings.titleSummaryEnabled ? (
              <div className="figma-settings-grid figma-title-summary-controls">
                <MenuSetting
                  className="figma-title-summary-model"
                  label="标题总结模型"
                  description="默认使用 gpt-5.4-mini，可改为后台已启用的聊天模型"
                  value={titleSummaryModel?.id || settings.titleSummaryModelId}
                  options={titleSummaryModelOptions}
                  onChange={(titleSummaryModelId) => onSettingsChange({ titleSummaryModelId })}
                />
                <DiscreteRangeSetting
                  id="figma-title-summary-message-count-range"
                  label="总结引用消息"
                  description="选择生成标题时引用的最近聊天记录"
                  value={settings.titleSummaryMessageCount}
                  options={titleSummaryMessageOptions}
                  onChange={(titleSummaryMessageCount) => onSettingsChange({ titleSummaryMessageCount })}
                />
              </div>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection id="figma-openai-settings" title="OpenAI 设置" description="仅应用于原生 OpenAI Responses 接口。" active={activeSection === "openai"}>
          <div className="figma-setting-list">
            <MenuSetting
              label="详细程度"
              ariaLabel="OpenAI 详细程度"
              description="控制支持该参数的 OpenAI 模型回答详略"
              value={settings.responseVerbosity}
              options={responseVerbosityOptions}
              onChange={(responseVerbosity) => onSettingsChange({ responseVerbosity: cleanSettingChoice(responseVerbosity, chatResponseVerbosityValues, "default") })}
            />
            <SettingToggle label="显示 Token 统计" description="在输入框上方显示最新响应的实际用量，接口未返回时显示上下文估算" checked={settings.showUsage} onChange={(showUsage) => onSettingsChange({ showUsage })} />
          </div>
        </SettingsSection>

        <SettingsSection id="figma-messages-settings" title="消息设置" description="控制消息内容的显示、排版和导航。" active={activeSection === "messages"}>
          <div className="figma-setting-list">
            <SettingToggle label="显示用户提示词" description="关闭后隐藏用户消息，仅保留助手回答" checked={settings.showUserPrompts} onChange={(showUserPrompts) => onSettingsChange({ showUserPrompts })} />
            <SettingToggle label="使用衬线字体" description="为消息正文使用更适合长文阅读的衬线字体" checked={settings.useSerifFont} onChange={(useSerifFont) => onSettingsChange({ useSerifFont })} />
            <SettingToggle label="Markdown 渲染用户消息" description="关闭后用户消息按纯文本显示" checked={settings.renderUserMarkdown} onChange={(renderUserMarkdown) => onSettingsChange({ renderUserMarkdown })} />
            <SettingToggle label="自动折叠思考内容" description="将回答中的 <think> 内容收纳为可展开区域" checked={settings.collapseThinking} onChange={(collapseThinking) => onSettingsChange({ collapseThinking })} />
            <SettingToggle label="显示消息大纲" description="在消息区顶部显示可跳转的会话锚点" checked={settings.showMessageOutline} onChange={(showMessageOutline) => onSettingsChange({ showMessageOutline })} />
            <label className="figma-setting-font-size">
              <span><strong>消息字体大小</strong><small>{settings.messageFontSize}px</small></span>
              <input aria-label="消息字体大小" type="range" min="13" max="18" step="1" value={settings.messageFontSize} onChange={(event) => onSettingsChange({ messageFontSize: cleanSettingChoice(Number(event.target.value), chatMessageFontSizeValues, defaultChatSessionSettings.messageFontSize) })} />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection id="figma-math-settings" title="数学公式" description="使用 KaTeX 安全渲染 Markdown 数学公式。" active={activeSection === "math"}>
          <div className="figma-setting-list">
            <SettingToggle label="渲染数学公式" description="支持行内和块级 LaTeX 公式" checked={settings.renderMath} onChange={(renderMath) => onSettingsChange({ renderMath })} />
            <SettingToggle label="启用单美元符号公式" description="允许使用 $...$ 书写行内公式" checked={settings.enableSingleDollarMath} disabled={!settings.renderMath} onChange={(enableSingleDollarMath) => onSettingsChange({ enableSingleDollarMath })} />
          </div>
        </SettingsSection>

        <SettingsSection id="figma-code-settings" title="代码块" description="控制代码阅读、折叠、换行和安全预览。" active={activeSection === "code"}>
          <div className="figma-setting-list">
            <MenuSetting
              label="代码主题"
              description="跟随系统或固定亮色、暗色主题"
              value={settings.codeTheme}
              options={codeThemeOptions}
              onChange={(codeTheme) => onSettingsChange({ codeTheme: cleanSettingChoice(codeTheme, chatCodeThemeValues, "auto") })}
            />
            <SettingToggle label="花式代码块" description="显示语言栏、边框和操作按钮" checked={settings.styledCodeBlocks} onChange={(styledCodeBlocks) => onSettingsChange({ styledCodeBlocks })} />
            <SettingToggle label="代码显示行号" description="在多行代码左侧显示行号" checked={settings.showCodeLineNumbers} onChange={(showCodeLineNumbers) => onSettingsChange({ showCodeLineNumbers })} />
            <SettingToggle label="代码块默认折叠" description="长代码默认收起，可手动展开" checked={settings.collapseCodeBlocks} onChange={(collapseCodeBlocks) => onSettingsChange({ collapseCodeBlocks })} />
            <SettingToggle label="代码块自动换行" description="在可用宽度内换行显示长代码" checked={settings.wrapCode} onChange={(wrapCode) => onSettingsChange({ wrapCode })} />
            <SettingToggle label="启用安全预览" description="HTML 仅在禁脚本、禁网络的沙箱中预览" checked={settings.enableCodePreview} onChange={(enableCodePreview) => onSettingsChange({ enableCodePreview })} />
          </div>
        </SettingsSection>

        <SettingsSection id="figma-input-settings" title="输入设置" description="控制粘贴、快捷菜单和发送按键。" active={activeSection === "input"}>
          <div className="figma-setting-list">
            <SettingToggle label="显示预估 Token 数" description="根据本地字符长度估算，不代表厂商计费" checked={settings.showTokenEstimate} onChange={(showTokenEstimate) => onSettingsChange({ showTokenEstimate })} />
            <SettingToggle label="长文本粘贴为文件" description="超过 2,000 字符的粘贴内容转为文本附件" checked={settings.longPasteAsFile} onChange={(longPasteAsFile) => onSettingsChange({ longPasteAsFile })} />
            <SettingToggle label="启用 / 和 $ 快捷菜单" description="在输入框内触发应用和 Skill 选择" checked={settings.enableCommandMenu} onChange={(enableCommandMenu) => onSettingsChange({ enableCommandMenu })} />
            <MenuSetting
              label="发送快捷键"
              description="另一个 Enter 组合用于换行"
              value={settings.sendShortcut}
              options={sendShortcutOptions}
              onChange={(sendShortcut) => onSettingsChange({ sendShortcut: cleanSettingChoice(sendShortcut, chatSendShortcutValues, "enter") })}
            />
          </div>
        </SettingsSection>
          </div>
        </main>
      </div>

      <footer>
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" className="primary" onClick={onSave}>保存设置</button>
      </footer>
    </Dialog>
    <ConfirmationDialog
      open={open && maxTokenConfirmationOpen}
      title="最大 Token 数"
      description="设置单次交互使用的最大 Token 数会影响返回长度。请根据所选模型的上下文和输出限制设置，数值过大可能导致请求失败。"
      confirmLabel="继续开启"
      onCancel={() => setMaxTokenConfirmationOpen(false)}
      onConfirm={() => {
        onSettingsChange({ maxTokensEnabled: true });
        setMaxTokenConfirmationOpen(false);
      }}
    />
    </>
  );
}
