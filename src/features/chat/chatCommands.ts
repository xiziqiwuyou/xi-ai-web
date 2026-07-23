export type ChatCommandKind = "skill" | "app";

export type ActiveChatCommand = {
  kind: ChatCommandKind;
  query: string;
  start: number;
  end: number;
  token: string;
};

export function activeChatCommand(value: string, caret = value.length): ActiveChatCommand | null {
  const boundedCaret = Math.max(0, Math.min(value.length, caret));
  const beforeCaret = value.slice(0, boundedCaret);
  const match = beforeCaret.match(/(^|\s)([$/])([^\s$/]*)$/u);
  if (!match) return null;
  const start = beforeCaret.length - match[0].length + match[1].length;
  return {
    kind: match[2] === "$" ? "skill" : "app",
    query: match[3] || "",
    start,
    end: boundedCaret,
    token: beforeCaret.slice(start)
  };
}

export function removeChatCommand(value: string, command: ActiveChatCommand) {
  const next = `${value.slice(0, command.start)}${value.slice(command.end)}`;
  return command.end === value.length ? next.trimEnd() : next;
}

export function chatCommandMatches(query: string, ...values: Array<string | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
}
