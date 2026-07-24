import {
  BookOpenText,
  Bot,
  Braces,
  BrainCircuit,
  CircleCheckBig,
  CirclePlay,
  Combine,
  FileText,
  GitBranch,
  Globe2,
  Repeat2,
  Scissors,
  Send,
  ShieldAlert,
  WandSparkles,
  type LucideProps
} from "lucide-react";
import type { AgentWorkflowNodeKind } from "../../types";

export function workflowComponentIcon(kind: AgentWorkflowNodeKind) {
  if (kind === "start") return CirclePlay;
  if (kind === "reply") return Send;
  if (kind === "template") return FileText;
  if (kind === "knowledge") return BookOpenText;
  if (kind === "model") return BrainCircuit;
  if (kind === "conditional") return GitBranch;
  if (kind === "structured") return Braces;
  if (kind === "webSearch") return Globe2;
  if (kind === "textSplit") return Scissors;
  if (kind === "merge") return Combine;
  if (kind === "transform") return WandSparkles;
  if (kind === "approval") return CircleCheckBig;
  if (kind === "loop") return Repeat2;
  if (kind === "unsupported") return ShieldAlert;
  return Bot;
}

export default function WorkflowComponentIcon({ kind, ...props }: LucideProps & { kind: AgentWorkflowNodeKind }) {
  const Icon = workflowComponentIcon(kind);
  return <Icon {...props} />;
}
