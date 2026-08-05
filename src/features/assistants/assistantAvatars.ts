import {
  BadgeCheck,
  BookHeart,
  Brain,
  ChartNoAxesCombined,
  Clapperboard,
  ClipboardList,
  Code2,
  Compass,
  Database,
  FileSearch,
  FlaskConical,
  GraduationCap,
  Headset,
  Kanban,
  Languages,
  LayoutTemplate,
  ListChecks,
  MapPinned,
  Megaphone,
  NotebookTabs,
  Palette,
  PanelsTopLeft,
  PenLine,
  Presentation,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Type,
  type LucideIcon
} from "lucide-react";

export type AssistantAvatarOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

export const assistantAvatarOptions: readonly AssistantAvatarOption[] = [
  { value: "sparkles", label: "通用", icon: Sparkles },
  { value: "code-2", label: "工程", icon: Code2 },
  { value: "search", label: "研究", icon: Search },
  { value: "pen-line", label: "写作", icon: PenLine },
  { value: "book-heart", label: "内容策划", icon: BookHeart },
  { value: "panels-top-left", label: "产品", icon: PanelsTopLeft },
  { value: "chart-no-axes-combined", label: "数据分析", icon: ChartNoAxesCombined },
  { value: "clipboard-list", label: "会议纪要", icon: ClipboardList },
  { value: "graduation-cap", label: "学习", icon: GraduationCap },
  { value: "languages", label: "翻译", icon: Languages },
  { value: "compass", label: "职业规划", icon: Compass },
  { value: "palette", label: "创意", icon: Palette },
  { value: "list-checks", label: "任务规划", icon: ListChecks },
  { value: "scale", label: "决策分析", icon: Scale },
  { value: "type", label: "商业文案", icon: Type },
  { value: "clapperboard", label: "短视频", icon: Clapperboard },
  { value: "layout-template", label: "前端", icon: LayoutTemplate },
  { value: "database", label: "数据库", icon: Database },
  { value: "shield-check", label: "代码审查", icon: ShieldCheck },
  { value: "file-search", label: "论文阅读", icon: FileSearch },
  { value: "brain", label: "知识讲解", icon: Brain },
  { value: "kanban", label: "项目管理", icon: Kanban },
  { value: "presentation", label: "演示文稿", icon: Presentation },
  { value: "headset", label: "客服", icon: Headset },
  { value: "megaphone", label: "营销", icon: Megaphone },
  { value: "badge-check", label: "品牌", icon: BadgeCheck },
  { value: "store", label: "电商", icon: Store },
  { value: "flask-conical", label: "增长实验", icon: FlaskConical },
  { value: "map-pinned", label: "旅行", icon: MapPinned },
  { value: "notebook-tabs", label: "复盘", icon: NotebookTabs }
];

const avatarOptionsByValue = new Map(assistantAvatarOptions.map((option) => [option.value, option]));

export function assistantAvatarOption(value?: string) {
  return value ? avatarOptionsByValue.get(value) : undefined;
}
