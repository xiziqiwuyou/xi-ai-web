import { LayoutGrid, Puzzle } from "lucide-react";
import type { ChatCommandKind } from "./chatCommands";

export type ChatCommandOption = {
  id: string;
  name: string;
  description: string;
  disabled?: boolean;
  selected?: boolean;
};

type ChatCommandPaletteProps = {
  id: string;
  kind: ChatCommandKind;
  query: string;
  options: ChatCommandOption[];
  activeIndex: number;
  onSelect: (option: ChatCommandOption) => void;
  onHover: (index: number) => void;
};

export default function ChatCommandPalette({
  id,
  kind,
  query,
  options,
  activeIndex,
  onSelect,
  onHover
}: ChatCommandPaletteProps) {
  const Icon = kind === "skill" ? Puzzle : LayoutGrid;
  const label = kind === "skill" ? "Skill" : "应用";
  return (
    <div className="figma-chat-command-palette" role="presentation" data-command-kind={kind}>
      <header>
        <span><Icon size={14} />{kind === "skill" ? "$" : "/"} {label}</span>
        <small>{query ? `“${query}”` : "全部"}</small>
      </header>
      <div id={id} role="listbox" aria-label={`${label}命令`}>
        {options.length ? options.map((option, index) => (
          <button
            key={option.id}
            id={`${id}-${option.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            aria-disabled={option.disabled || undefined}
            className={index === activeIndex ? "active" : ""}
            disabled={option.disabled}
            onPointerMove={() => onHover(index)}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(option)}
          >
            <span><strong>{option.name}</strong><small>{option.description}</small></span>
            {option.selected ? <em>已选择</em> : null}
          </button>
        )) : <p>没有匹配的{label}</p>}
      </div>
    </div>
  );
}
