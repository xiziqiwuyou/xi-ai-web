import type { Assistant } from "../../types";
import { assistantAvatarOption, assistantAvatarOptions } from "./assistantAvatars";

type AssistantAvatarProps = {
  assistant?: Pick<Assistant, "avatar" | "color" | "name">;
  avatar?: string;
  color?: string;
  fallbackImageUrl?: string;
  className?: string;
  label?: string;
};

export function AssistantAvatar({
  assistant,
  avatar,
  color,
  fallbackImageUrl,
  className = "",
  label
}: AssistantAvatarProps) {
  const requestedAvatar = avatar || assistant?.avatar;
  const option = assistantAvatarOption(requestedAvatar);
  const accessibleLabel = label || (assistant?.name ? `${assistant.name}头像` : "");

  if (!option && fallbackImageUrl) {
    return (
      <img
        className={`assistant-avatar-image ${className}`.trim()}
        src={fallbackImageUrl}
        alt={accessibleLabel}
      />
    );
  }

  const resolved = option || assistantAvatarOptions[0];
  const Icon = resolved.icon;
  return (
    <span
      className={`assistant-avatar-glyph ${className}`.trim()}
      style={{ background: color || assistant?.color || "#ff2442" }}
      role={accessibleLabel ? "img" : undefined}
      aria-label={accessibleLabel || undefined}
      aria-hidden={accessibleLabel ? undefined : true}
      data-assistant-avatar={resolved.value}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}
