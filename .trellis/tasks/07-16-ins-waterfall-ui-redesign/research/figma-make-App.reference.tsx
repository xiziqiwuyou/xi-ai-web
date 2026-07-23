import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity, ArrowLeft, BookOpen, Bot, Check, ChevronRight, CircleHelp,
  Copy, Database, Download, FileText, Image as ImageIcon, KeyRound,
  Boxes, GitFork, Globe2, Languages, LockKeyhole, LogOut, Menu, MessageSquare, Moon, MoreHorizontal,
  Plus, Presentation, Search, Send, Settings2, ShieldCheck, Sparkles, Sun,
  Trash2, Upload, Users, Wand2, X, Zap,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type View = "chat" | "image" | "ppt" | "mindmap" | "assistants" | "translate";
type AdminTab = "overview" | "users" | "keys" | "models" | "knowledge";
type Mode = "user" | "admin-login" | "admin" | "invalid";
type Theme = "dark" | "light";

type KnowledgeBase = { id: number; name: string; description: string; docs: number; chunks: string; updated: string; color: string; status: "灏辩华" | "澶勭悊涓? };

const iconMap = { chat: MessageSquare, image: ImageIcon, ppt: Presentation, mindmap: GitFork, assistants: Boxes, translate: Languages };
const nav = [
  { id: "chat" as View, name: "AI 瀵硅瘽", note: "娣卞害鎺ㄧ悊涓庡垱浣? },
  { id: "image" as View, name: "鍥惧儚鐢熸垚", note: "鐏垫劅鍙鍖? },
  { id: "ppt" as View, name: "AI 涓€閿?PPT", note: "浠庝富棰樺埌鎴愮" },
  { id: "mindmap" as View, name: "鎬濈淮瀵煎浘", note: "娲炶缁撴瀯鍖? },
  { id: "assistants" as View, name: "鍔╂墜搴?, note: "涓撳睘宸ヤ綔浼欎即" },
  { id: "translate" as View, name: "缈昏瘧", note: "鑷劧琛ㄨ揪杞崲" },
];
const MODEL_CATALOG = {
  OpenAI: [["Nova-4", "娣卞害鎺ㄧ悊 路 榛樿"], ["Nova-4 Fast", "蹇€熷搷搴?路 杞婚噺"], ["Nova-Code", "浠ｇ爜涓庡伐鍏疯皟鐢?], ["Nova-Long", "闀夸笂涓嬫枃鍒嗘瀽"]],
  Anthropic: [["Claude Vision", "闀挎枃鍒嗘瀽 路 绋冲仴"], ["Claude Fast", "蹇€熸€荤粨 路 杞婚噺"], ["Claude Reason", "澶嶆潅鎺ㄦ紨 路 娣卞害"], ["Claude Creative", "鍒涙剰琛ㄨ揪 路 鍙戞暎"]],
  "瑙嗚": [["Vision Pro", "鍥惧儚鐞嗚В 路 澶氭ā鎬?], ["Flux Vision", "鍥炬枃璇嗗埆 路 蹇€?], ["Gemini Vision", "璺ㄦā鎬佺悊瑙?路 閫氱敤"], ["Image Scout", "鍥剧墖妫€绱?路 杞婚噺"]],
} as const;

const chartData = [
  { day: "鍛ㄤ竴", calls: 520 }, { day: "鍛ㄤ簩", calls: 760 }, { day: "鍛ㄤ笁", calls: 620 }, { day: "鍛ㄥ洓", calls: 980 }, { day: "鍛ㄤ簲", calls: 860 }, { day: "鍛ㄥ叚", calls: 1120 }, { day: "浠婂ぉ", calls: 1380 },
];
const messagesSeed = [
  { from: "ai", text: "浣犲ソ锛屾垜鏄?**AiStudio** 鍔╂墜銆傝繛鎺ョ煡璇嗐€佹兂娉曚笌鎴愭灉鈥斺€旂幇鍦ㄦ兂鍒涗綔浠€涔堬紵" },
  { from: "user", text: "甯垜姊崇悊涓€浠藉叧浜庣敓鎴愬紡 AI 鍦ㄤ紒涓氳惤鍦扮殑绠€鐭粙缁嶃€? },
  { from: "ai", text: "褰撶劧鍙互銆俓n\n**鐢熸垚寮?AI 姝ｅ湪鎴愪负浼佷笟鐨勫垱閫犲姏鍩虹璁炬柦銆?* 瀹冨皢閲嶅鎬х煡璇嗗伐浣滆浆鍖栦负鍙紪鎺掔殑鏅鸿兘娴佺▼锛氫粠甯傚満娲炲療銆佸唴瀹圭敓浜у埌瀹㈡埛鏀寔銆傚叧閿笉鍦ㄤ簬鏇夸唬浜猴紝鑰屾槸璁╂瘡涓€浣嶅憳宸ラ兘鑳戒互鏇寸煭璺緞瀹屾垚楂樹环鍊煎喅绛栥€俓n\n瑕佷笉瑕佹垜缁х画涓鸿繖娈靛唴瀹圭敓鎴愪竴涓?6 椤电殑婕旂ず鏂囩锛? },
];
const initialBases: KnowledgeBase[] = [
  { id: 1, name: "浜у搧鐭ヨ瘑涓績", description: "浜у搧璇存槑銆佺増鏈洿鏂颁笌甯歌闂", docs: 128, chunks: "3,842", updated: "10 鍒嗛挓鍓?, color: "from-blue-500 to-cyan-400", status: "灏辩华" },
  { id: 2, name: "鍝佺墝涓庡競鍦鸿祫鏂?, description: "鍝佺墝瑙勮寖銆佹渚嬪拰甯傚満鐮旂┒鎶ュ憡", docs: 76, chunks: "2,109", updated: "鏄ㄥぉ", color: "from-violet-500 to-fuchsia-500", status: "灏辩华" },
  { id: 3, name: "瀹㈡埛鏀寔鎵嬪唽", description: "鏈嶅姟娴佺▼銆佸伐鍗曟寚寮曚笌鍘嗗彶澶嶇洏", docs: 44, chunks: "1,276", updated: "澶勭悊涓?, color: "from-teal-500 to-emerald-400", status: "澶勭悊涓? },
];

function getMode(): { mode: Mode; key: string; addr: string } {
  const p = new URLSearchParams(window.location.search);
  if (p.has("admin")) return { mode: "admin-login", key: "", addr: p.get("addr") || "aistudio.example.com" };
  const key = p.get("key") || "";
  if (key || !window.location.search) return { mode: "user", key: key || "preview_7k9a", addr: p.get("addr") || "aistudio.example.com" };
  return { mode: "invalid", key: "", addr: p.get("addr") || "aistudio.example.com" };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-primary via-cyan-400 to-violet-500 shadow-[0_0_28px_rgba(48,123,255,.34)]"><Sparkles className="h-4 w-4 text-white" /></div>{!compact && <div><div className="text-sm font-extrabold tracking-[.02em] text-foreground">AiStudio</div><div className="text-[9px] font-mono tracking-[.18em] text-muted-foreground">CREATE WITH AI</div></div>}</div>;
}

function ThemeButton({ theme, setTheme }: { theme: Theme; setTheme: (v: Theme) => void }) {
  return <button aria-label="鍒囨崲鏃ュ涓婚" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="group flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary">{theme === "dark" ? <Sun className="h-4 w-4 transition-transform group-hover:rotate-45" /> : <Moon className="h-4 w-4 transition-transform group-hover:-rotate-12" />}</button>;
}

function UserShell({ apiKey, addr, theme, setTheme }: { apiKey: string; addr: string; theme: Theme; setTheme: (v: Theme) => void }) {
  const [view, setView] = useState<View>("chat");
  const [mobileNav, setMobileNav] = useState(false);
  const token = `${apiKey.slice(0, 4)}鈥⑩€⑩€⑩€⑩€⑩€?{apiKey.slice(-3)}`;
  const panels = { chat: <ChatView />, image: <ImageView />, ppt: <PptView />, mindmap: <MindmapView />, assistants: <AssistantsView />, translate: <TranslateView /> };
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  return <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
    <div className="fixed inset-0 -z-10 overflow-hidden"><div className="absolute -top-40 left-[14%] h-[30rem] w-[30rem] rounded-full bg-primary/10 blur-[120px]" /><div className="absolute bottom-0 right-[4%] h-[26rem] w-[26rem] rounded-full bg-violet-600/10 blur-[110px]" /></div>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/88 px-5 backdrop-blur-xl lg:hidden">
      <Brand />
      <div className="flex items-center gap-2"><ThemeButton theme={theme} setTheme={setTheme} /><button onClick={() => setMobileNav(!mobileNav)} className="grid h-9 w-9 place-items-center rounded-2xl border border-border bg-card"><Menu className="h-4 w-4" /></button></div>
    </header>

    <div className="mx-auto flex max-w-[1540px] gap-8 px-5 py-6 lg:px-8">
      <aside className={`${mobileNav ? "flex" : "hidden"} fixed inset-x-5 top-[72px] z-20 rounded-2xl border border-border bg-card p-3 shadow-2xl lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-48px)] lg:w-56 lg:shrink-0 lg:flex-col lg:rounded-none lg:border-x-0 lg:border-y-0 lg:border-r lg:bg-transparent lg:p-0 lg:pr-6 lg:shadow-none`}>
        <div className="hidden lg:block mb-8 pl-1"><Brand /></div>
        <div className="space-y-1">{nav.map((item) => { const Icon = iconMap[item.id]; const selected = view === item.id; return <button key={item.id} onClick={() => { setView(item.id); setMobileNav(false); }} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${selected ? "bg-primary text-primary-foreground shadow-[0_8px_25px_rgba(48,123,255,.25)]" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="h-4 w-4" /><span><span className="block text-xs font-bold">{item.name}</span><span className={`mt-0.5 block text-[10px] ${selected ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{item.note}</span></span></button>; })}</div>
        <div className="mt-auto hidden rounded-2xl border border-border bg-card/70 p-4 lg:block">
          <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-4">
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>鏈嶅姟姝ｅ父
            </span>
            <ThemeButton theme={theme} setTheme={setTheme} />
          </div>
          <p className="text-[10px] font-mono tracking-widest text-muted-foreground">SECURE ACCESS</p><p className="mt-2 truncate font-mono text-xs text-foreground">{addr}</p><div className="mt-3 flex items-center gap-2 text-[10px] text-emerald-500"><ShieldCheck className="h-3.5 w-3.5" /> 宸插姞瀵嗚闂?/div></div>
      </aside>
      <main className="min-w-0 flex-1"><AnimatePresence mode="wait"><motion.div key={view} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}>{panels[view]}</motion.div></AnimatePresence>
      </main>
    </div>
    <footer className="mx-auto flex max-w-[1540px] items-center justify-between border-t border-border px-5 py-5 lg:px-8"><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> 姝よ闂摼鎺ョ敱绠＄悊鍛樻巿鏉?/div><div className="rounded-md bg-secondary px-2.5 py-1 font-mono text-[10px] text-muted-foreground">KEY 路 {token}</div></footer>
  </div>;
}



type ChatSession = {
  id: string;
  messages: any[];
  input: string;
  collapsed: boolean;
  model: string;
  modelVendor: "OpenAI" | "Anthropic" | "瑙嗚";
  imageAttached: boolean;
  isTyping: boolean;
};

let globalSessions: ChatSession[] = [
  {
    id: "default",
    messages: messagesSeed,
    input: "",
    collapsed: false,
    model: "Nova-4",
    modelVendor: "OpenAI",
    imageAttached: false,
    isTyping: false
  }
];

let globalSettings = {
  avatar: "akira",
  userAvatar: null as string | null,
  messageStyle: "bubble" as "bubble" | "list",
  config: { temperature: "0.7", topP: "0.9", context: "16", tokens: "4096", stream: true, tool: "鑷姩" }
};

function ChatView() {
  const [sessions, setSessions] = useState(globalSessions);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [avatar, setAvatar] = useState(globalSettings.avatar);
  const [userAvatar, setUserAvatar] = useState(globalSettings.userAvatar);
  const [messageStyle, setMessageStyle] = useState(globalSettings.messageStyle);
  const [config, setConfig] = useState(globalSettings.config);
  const userAvatarUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => { globalSessions = sessions; }, [sessions]);
  useEffect(() => { globalSettings.avatar = avatar; }, [avatar]);
  useEffect(() => { globalSettings.userAvatar = userAvatar; }, [userAvatar]);
  useEffect(() => { globalSettings.messageStyle = messageStyle; }, [messageStyle]);
  useEffect(() => { globalSettings.config = config; }, [config]);

  const avatarPresets = [
    { id: "akira", name: "闇撹櫣涓昏", image: "https://images.unsplash.com/photo-1756982562219-62fc63d55c39?w=240&h=240&fit=crop&auto=format" },
    { id: "mika", name: "钃濆彂鏃呬汉", image: "https://images.unsplash.com/photo-1653256247320-044904b06ee9?w=240&h=240&fit=crop&auto=format" },
    { id: "ren", name: "澹版尝灏戝勾", image: "https://images.unsplash.com/photo-1670612389553-d3538cc17fa8?w=240&h=240&fit=crop&auto=format" },
    { id: "yuki", name: "闈涜摑瑙傚療鑰?, image: "https://images.unsplash.com/photo-1623567533471-2c789007ce34?w=240&h=240&fit=crop&auto=format" },
  ];
  const currentAvatar = avatarPresets.find((item) => item.id === avatar) || avatarPresets[0];
  const uploadUserAvatar = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setUserAvatar(URL.createObjectURL(file)); };

  const newChat = () => {
    setSessions(prev => [
      {
        id: Date.now().toString(),
        messages: [{ from: "ai", text: "鏂扮殑浼氳瘽宸茬粡寮€濮嬨€傚憡璇夋垜杩欐甯屾湜鍏卞悓瀹屾垚浠€涔堬紵" }],
        input: "",
        collapsed: false,
        model: prev[0]?.model || "Nova-4",
        modelVendor: prev[0]?.modelVendor || "OpenAI",
        imageAttached: false,
        isTyping: false
      },
      ...prev.map(s => ({ ...s, collapsed: true }))
    ]);
  };

  const updateSession = (id: string, updates: Partial<ChatSession>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const control = (label: string, children: ReactNode) => <label className="block"><span className="mb-2 block text-[10px] font-mono tracking-widest text-muted-foreground">{label}</span>{children}</label>;

  return <section className="mx-auto max-w-6xl">
    <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-2.5 backdrop-blur-sm">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[10px] tracking-[.18em] text-primary">01 / INTELLIGENCE</span><span className="hidden h-1 w-1 rounded-full bg-muted-foreground sm:block" /><span className="hidden text-[10px] text-muted-foreground sm:block">Nova-4 瀵硅瘽绌洪棿</span></div><h1 className="mt-1 text-xl font-extrabold tracking-[-.02em] md:text-2xl">AI 瀵硅瘽宸ヤ綔鍙?/h1></div>
      <div className="hidden gap-2 sm:flex"><button onClick={newChat} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"><Plus className="h-3.5 w-3.5" /> 鏂板璇?/button><button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"><Settings2 className="h-3.5 w-3.5" /> 浼氳瘽璁剧疆</button></div>
    </div>

    <div className="space-y-4">
      {sessions.map(session => (
        <ChatSessionBlock key={session.id} session={session} updateSession={updateSession} currentAvatar={currentAvatar} userAvatar={userAvatar} messageStyle={messageStyle} newChat={newChat} setSettingsOpen={setSettingsOpen} />
      ))}
    </div>

    <AnimatePresence>{settingsOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-5 backdrop-blur-sm"><motion.div initial={{ opacity: 0, scale: .96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] tracking-[.18em] text-primary">SESSION CONFIGURATION</p><h2 className="mt-1 text-xl font-extrabold">浼氳瘽璁剧疆</h2><p className="mt-1 text-xs text-muted-foreground">璋冩暣妯″瀷鐨勭敓鎴愬€惧悜鍜屽搷搴旇涓恒€?/p></div><button onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button></div><div className="mt-6 grid gap-4 rounded-2xl border border-border bg-secondary/50 p-4 sm:grid-cols-3"><div><p className="text-xs font-bold">AI 瀵硅瘽澶村儚</p><p className="mt-1 text-[10px] text-muted-foreground">閫夋嫨鍦ㄦ秷鎭腑鏄剧ず鐨勫姪鎵嬪舰璞?/p><div className="mt-3 grid grid-cols-4 gap-2">{avatarPresets.map((item) => <button key={item.id} onClick={() => setAvatar(item.id)} title={item.name} className={`relative aspect-square overflow-hidden rounded-[16px] border-2 transition ${avatar === item.id ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-primary/45"}`}><img src={item.image} alt={`${item.name} 鍔ㄦ极椋庢牸 AI 澶村儚棰勮`} className="h-full w-full object-cover" />{avatar === item.id && <span className="absolute inset-x-0 bottom-0 grid h-4 place-items-center bg-primary text-white"><Check className="h-2.5 w-2.5" /></span>}</button>)}</div></div><div><p className="text-xs font-bold">涓汉澶村儚</p><p className="mt-1 text-[10px] text-muted-foreground">浠呮樉绀哄湪浣犲彂閫佺殑瀵硅瘽娑堟伅涓?/p><div className="mt-3 flex items-center gap-3"><button onClick={() => userAvatarUploadRef.current?.click()} className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[16px] border-2 border-dashed border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary">{userAvatar ? <img src={userAvatar} alt="涓汉澶村儚棰勮" className="h-full w-full object-cover" /> : <Plus className="h-4 w-4" />}</button><div><button onClick={() => userAvatarUploadRef.current?.click()} className="text-xs font-bold text-primary">涓婁紶涓汉澶村儚</button><p className="mt-1 text-[10px] text-muted-foreground">PNG銆丣PG锛屽缓璁?1:1 姣斾緥</p>{userAvatar && <button onClick={() => setUserAvatar(null)} className="mt-1 text-[10px] text-muted-foreground hover:text-red-400">绉婚櫎澶村儚</button>}</div><input ref={userAvatarUploadRef} onChange={uploadUserAvatar} accept="image/*" type="file" className="hidden" /></div></div><div><p className="text-xs font-bold">瀵硅瘽鍒楄〃鏂瑰紡</p><p className="mt-1 text-[10px] text-muted-foreground">閫夋嫨鑱婂ぉ鍐呭鐨勮瑙夌粍缁囨柟寮?/p><div className="mt-3 flex gap-2"><button onClick={() => setMessageStyle("bubble")} className={`flex-1 rounded-lg border px-2 py-2 text-[10px] ${messageStyle === "bubble" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>姘旀场寮?/button><button onClick={() => setMessageStyle("list")} className={`flex-1 rounded-lg border px-2 py-2 text-[10px] ${messageStyle === "list" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>鍒楄〃寮?/button></div></div></div><div className="mt-6 grid gap-x-5 gap-y-5 sm:grid-cols-2">{control("妯″瀷娓╁害 路 Temperature", <div><input type="range" min="0" max="1" step="0.1" value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: e.target.value })} className="w-full accent-primary" /><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>涓ヨ皑</span><span className="font-mono text-primary">{config.temperature}</span><span>鍙戞暎</span></div></div>)}{control("TOP-P", <div><input type="range" min="0.1" max="1" step="0.1" value={config.topP} onChange={(e) => setConfig({ ...config, topP: e.target.value })} className="w-full accent-primary" /><div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>鑱氱劍</span><span className="font-mono text-primary">{config.topP}</span><span>澶氭牱</span></div></div>)}{control("涓婁笅鏂囨暟", <select value={config.context} onChange={(e) => setConfig({ ...config, context: e.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-3 py-2.5 text-xs outline-none focus:border-primary"><option value="4">4K tokens</option><option value="16">16K tokens</option><option value="32">32K tokens</option><option value="128">128K tokens</option></select>)}{control("鏈€澶?Token 鏁?, <select value={config.tokens} onChange={(e) => setConfig({ ...config, tokens: e.target.value })} className="w-full rounded-2xl border border-border bg-secondary px-3 py-2.5 text-xs outline-none focus:border-primary"><option value="1024">1,024</option><option value="2048">2,048</option><option value="4096">4,096</option><option value="8192">8,192</option></select>)}<div className="flex items-center justify-between rounded-2xl border border-border bg-secondary p-3"><div><p className="text-xs font-bold">娴佸紡杈撳嚭</p><p className="mt-1 text-[10px] text-muted-foreground">瀹炴椂鏄剧ず鐢熸垚鍐呭</p></div><button onClick={() => setConfig({ ...config, stream: !config.stream })} className={`h-6 w-11 rounded-full p-1 transition ${config.stream ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${config.stream ? "translate-x-5" : ""}`} /></button></div>{control("宸ュ叿璋冪敤鏂瑰紡", <div className="flex rounded-2xl border border-border bg-secondary p-1">{["鑷姩", "璇㈤棶鍚庤皟鐢?, "绂佺敤"].map((x) => <button key={x} onClick={() => setConfig({ ...config, tool: x })} className={`flex-1 rounded-lg px-1 py-2 text-[10px] transition ${config.tool === x ? "bg-card font-bold text-primary shadow-sm" : "text-muted-foreground"}`}>{x}</button>)}</div>)}</div><div className="mt-7 flex justify-end gap-2 border-t border-border pt-5"><button onClick={() => setSettingsOpen(false)} className="rounded-2xl px-4 py-2.5 text-xs text-muted-foreground">鍙栨秷</button><button onClick={() => setSettingsOpen(false)} className="rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">淇濆瓨璁剧疆</button></div></motion.div></motion.div>}</AnimatePresence>
  </section>;
}

function ChatSessionBlock({ session, updateSession, currentAvatar, userAvatar, messageStyle, newChat, setSettingsOpen }: any) {
  const { id, messages, input, collapsed, model, modelVendor, imageAttached, isTyping } = session;
  const [modelOpen, setModelOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const history = historyRef.current; if (history && !collapsed) history.scrollTo({ top: history.scrollHeight, behavior: "smooth" }); }, [messages, collapsed]);

  useEffect(() => {
    if (!modelOpen) return;
    const closeOnOutside = (event: MouseEvent) => { if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) setModelOpen(false); };
    window.addEventListener("mousedown", closeOnOutside);
    return () => window.removeEventListener("mousedown", closeOnOutside);
  }, [modelOpen]);

  const send = () => {
    if (!input.trim() && !imageAttached) return;
    const value = input.trim() || "璇峰垎鏋愭垜涓婁紶鐨勫浘鐗囥€?;
    updateSession(id, {
      messages: [...messages, { from: "user", text: `${imageAttached ? "[宸查檮鍔犲浘鐗嘳 \n" : ""}${value}` }],
      input: "",
      imageAttached: false,
      isTyping: true
    });
    setTimeout(() => {
      updateSession(id, {
        isTyping: false,
        messages: [...messages, { from: "user", text: `${imageAttached ? "[宸查檮鍔犲浘鐗嘳 \n" : ""}${value}` }, { from: "ai", text: `${search ? "鎴戝凡缁撳悎缃戠粶妫€绱㈠埌鐨勫叕寮€淇℃伅杩涜鍥炵瓟銆俓n\n" : ""}鎴戝凡鏀跺埌銆傚熀浜庝綘鐨勭洰鏍囷紝鎴戝缓璁厛鏄庣‘鍙椾紬銆佽緭鍑哄満鏅拰甯屾湜淇濈暀鐨勮姘旓紱鎴戝彲浠ョ户缁皢杩欎唤鍐呭鏁寸悊涓哄彲鐩存帴浣跨敤鐨勬柟妗堛€俙 }]
      });
    }, 1200);
  };
  const clearContext = () => updateSession(id, {鈥?1716 tokens truncated鈥ondary"><div className={`h-full rounded-full ${c}`} style={{ width: b }} /></div></div>)}</div><button className="mt-7 text-xs font-bold text-primary">鏌ョ湅绯荤粺鏃ュ織 鈫?/button></section></div></>; }
function UsersPanel() { const [query, setQuery] = useState(""); const rows = [["鏋楁檽", "lin.xiao@vertex.ai", "浼佷笟鐗?, "姝ｅ父", "鍒氬垰"], ["闄堥粯", "chen.mo@vertex.ai", "涓撲笟鐗?, "姝ｅ父", "8 鍒嗛挓鍓?], ["Vera Wang", "vera@lumen.co", "浼佷笟鐗?, "姝ｅ父", "1 灏忔椂鍓?], ["寮犱簣瀹?, "zhang.ya@studio.cn", "璇曠敤鐗?, "宸叉殏鍋?, "鏄ㄥぉ"]].filter((x) => x.join(" ").toLowerCase().includes(query.toLowerCase())); return <><AdminHeading eyebrow="ACCESS / USERS" title="鐢ㄦ埛绠＄悊" copy="绠＄悊鏈嶅姟璁块棶鐢ㄦ埛銆佸椁愬拰浣跨敤鐘舵€併€? action={<button className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> 娣诲姞鐢ㄦ埛</button>} /><div className="rounded-2xl border border-border bg-card"><div className="flex items-center border-b border-border p-4"><Search className="mr-2 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="鎼滅储濮撳悕鎴栭偖绠扁€? className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b border-border bg-secondary/50 font-mono text-[10px] tracking-wider text-muted-foreground"><tr>{["鐢ㄦ埛", "濂楅", "鐘舵€?, "鏈€鍚庢椿璺?, ""].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r[1]} className="border-b border-border last:border-0 hover:bg-secondary/40"><td className="px-5 py-4"><p className="font-bold">{r[0]}</p><p className="mt-1 text-[10px] text-muted-foreground">{r[1]}</p></td><td className="px-5 py-4"><span className="rounded-md bg-primary/10 px-2 py-1 text-[10px] text-primary">{r[2]}</span></td><td className="px-5 py-4"><span className={r[3] === "姝ｅ父" ? "text-emerald-500" : "text-amber-500"}>鈼?{r[3]}</span></td><td className="px-5 py-4 text-muted-foreground">{r[4]}</td><td className="px-5 py-4"><button><MoreHorizontal className="h-4 w-4 text-muted-foreground" /></button></td></tr>)}</tbody></table></div></div></>; }
function KeysPanel() { const [revealed, setRevealed] = useState<number | null>(null); const keys = [[1,"鐢熶骇鐜涓诲瘑閽?,"sk_live_鈥⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€9H2","2026-06-18"],[2,"鏁版嵁鍒嗘瀽鏈嶅姟","sk_live_鈥⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€7B8","2026-07-02"]]; return <><AdminHeading eyebrow="SECURITY / API KEYS" title="API 瀵嗛挜" copy="鍦ㄨ繖閲屽垱寤恒€佽疆鎹㈡垨鎾ら攢绯荤粺鏈嶅姟瀵嗛挜銆? action={<button className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> 鍒涘缓瀵嗛挜</button>} /><div className="space-y-3">{keys.map(([id,name,value,date]) => <div key={id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-bold">{name}</p><div className="mt-2 flex items-center gap-2"><code className="rounded bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground">{revealed === id ? "sk_live_Na3hK9qL7mZ1c9H2" : value}</code><button onClick={() => setRevealed(revealed === id ? null : id)} className="text-[10px] text-primary">{revealed === id ? "闅愯棌" : "鏄剧ず"}</button></div></div><div className="flex items-center gap-4 text-[10px] text-muted-foreground"><span>鍒涘缓浜?{date}</span><button className="rounded-lg border border-border p-2 hover:text-primary"><Copy className="h-3.5 w-3.5" /></button><button className="rounded-lg border border-border p-2 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></div></div>)}</div></>; }
function ModelsPanel() {
  type ManagedModel = { id: number; name: string; capability: string; context: string; enabled: boolean; default?: boolean };
  const [vendors, setVendors] = useState([
    { id: "openai", name: "OpenAI", status: "宸茶繛鎺?, models: [{ id: 1, name: "Nova-4", capability: "娣卞害鎺ㄧ悊", context: "128K", enabled: true, default: true }, { id: 2, name: "Nova-4 Fast", capability: "蹇€熷搷搴?, context: "32K", enabled: true }, { id: 3, name: "Nova-Code", capability: "浠ｇ爜涓庡伐鍏疯皟鐢?, context: "64K", enabled: true }, { id: 4, name: "Nova-Long", capability: "闀挎枃鍒嗘瀽", context: "256K", enabled: false }] as ManagedModel[] },
    { id: "anthropic", name: "Anthropic", status: "宸茶繛鎺?, models: [{ id: 5, name: "Claude Vision", capability: "闀挎枃涓庤瑙夊垎鏋?, context: "200K", enabled: true }, { id: 6, name: "Claude Fast", capability: "蹇€熸€荤粨", context: "32K", enabled: true }, { id: 7, name: "Claude Reason", capability: "澶嶆潅鎺ㄦ紨", context: "200K", enabled: false }] as ManagedModel[] },
    { id: "vision", name: "瑙嗚鏈嶅姟", status: "宸茶繛鎺?, models: [{ id: 8, name: "Vision Pro", capability: "澶氭ā鎬佺悊瑙?, context: "32K", enabled: true }, { id: 9, name: "Flux Vision", capability: "蹇€熻瘑鍥?, context: "16K", enabled: true }, { id: 10, name: "Gemini Vision", capability: "璺ㄦā鎬侀€氱敤", context: "1M", enabled: false }] as ManagedModel[] },
  ]);
  const [active, setActive] = useState("openai"); const [modal, setModal] = useState<"vendor" | "model" | null>(null); const [field, setField] = useState(""); const [notice, setNotice] = useState("");
  const current = vendors.find((v) => v.id === active) || vendors[0];
  const commit = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(""), 1900); };
  const updateModels = (action: (model: ManagedModel) => ManagedModel) => setVendors((v) => v.map((vendor) => vendor.id === active ? { ...vendor, models: vendor.models.map(action) } : vendor));
  const toggle = (id: number) => { updateModels((m) => m.id === id ? { ...m, enabled: !m.enabled } : m); commit("妯″瀷鐘舵€佸凡鏇存柊"); };
  const defaultModel = (id: number) => { updateModels((m) => ({ ...m, default: m.id === id })); commit("榛樿瀵硅瘽妯″瀷宸插垏鎹?); };
  const create = () => { if (!field.trim()) return; if (modal === "vendor") { const id = `vendor-${Date.now()}`; setVendors((v) => [...v, { id, name: field.trim(), status: "寰呴厤缃?, models: [] }]); setActive(id); commit("鍘傚晢宸插垱寤猴紝璇风户缁坊鍔犳ā鍨?); } else { const id = Date.now(); setVendors((v) => v.map((vendor) => vendor.id === active ? { ...vendor, models: [...vendor.models, { id, name: field.trim(), capability: "閫氱敤瀵硅瘽", context: "32K", enabled: true }] } : vendor)); commit("妯″瀷宸叉坊鍔犲埌褰撳墠鍘傚晢"); } setField(""); setModal(null); };
  return <><AdminHeading eyebrow="CAPABILITY / MODEL ROUTING" title="妯″瀷閰嶇疆" copy="缁存姢妯″瀷鍘傚晢銆佸彲鐢ㄦā鍨嬩笌鍓嶅彴瀵硅瘽榛樿璺敱銆? action={<div className="flex gap-2"><button onClick={() => setModal("vendor")} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground hover:text-primary"><Plus className="h-3.5 w-3.5" /> 娣诲姞鍘傚晢</button><button onClick={() => setModal("model")} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> 娣诲姞妯″瀷</button></div>} />{notice && <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-500"><Check className="h-4 w-4" /> {notice}</div>}<div className="grid gap-5 xl:grid-cols-[250px_1fr]"><aside className="rounded-2xl border border-border bg-card p-3"><div className="mb-2 flex items-center justify-between px-2"><p className="font-mono text-[10px] tracking-widest text-muted-foreground">MODEL VENDORS</p><span className="text-[10px] text-muted-foreground">{vendors.length}</span></div><div className="scroll-soft max-h-[440px] space-y-1 overflow-y-auto pr-1">{vendors.map((vendor) => <button key={vendor.id} onClick={() => setActive(vendor.id)} className={`w-full rounded-2xl p-3 text-left transition ${active === vendor.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold">{vendor.name}</span><span className={`h-1.5 w-1.5 rounded-full ${vendor.status === "宸茶繛鎺? ? "bg-emerald-400" : "bg-amber-400"}`} /></div><p className={`mt-1 text-[10px] ${active === vendor.id ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{vendor.models.length} 涓ā鍨?路 {vendor.status}</p></button>)}</div><p className="mt-4 rounded-2xl bg-secondary p-3 text-[10px] leading-5 text-muted-foreground">鍓嶅彴閫夋嫨鍣ㄥ皢鎸夋澶勭殑鍘傚晢鍜屽惎鐢ㄧ姸鎬佸悓姝ュ憟鐜帮紱瓒呰繃 3 涓ā鍨嬫椂鏀寔婊氬姩銆?/p></aside><section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-base font-extrabold">{current.name}</h2><span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">{current.status}</span></div><p className="mt-1 text-xs text-muted-foreground">绠＄悊鍓嶅彴鍙妯″瀷鍙婇粯璁や細璇濊矾鐢便€?/p></div><button className="rounded-2xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-primary">缂栬緫鍘傚晢杩炴帴</button></div><div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-xs"><thead className="border-b border-border bg-secondary/50 font-mono text-[10px] tracking-wider text-muted-foreground"><tr>{["妯″瀷", "鑳藉姏", "涓婁笅鏂?, "鍓嶅彴鍚敤", "榛樿璺敱", "鎿嶄綔"].map((x) => <th key={x} className="px-5 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{current.models.map((m) => <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/30"><td className="px-5 py-4"><p className="font-bold">{m.name}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">ID 路 {m.id}</p></td><td className="px-5 py-4 text-muted-foreground">{m.capability}</td><td className="px-5 py-4 font-mono text-muted-foreground">{m.context}</td><td className="px-5 py-4"><button onClick={() => toggle(m.id)} className={`h-5 w-9 rounded-full p-0.5 transition ${m.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${m.enabled ? "translate-x-4" : ""}`} /></button></td><td className="px-5 py-4"><button disabled={!m.enabled} onClick={() => defaultModel(m.id)} className={`rounded-lg px-2 py-1 text-[10px] ${m.default ? "bg-primary/12 font-bold text-primary" : "border border-border text-muted-foreground disabled:opacity-40"}`}>{m.default ? "褰撳墠榛樿" : "璁句负榛樿"}</button></td><td className="px-5 py-4"><button className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary"><Settings2 className="h-3.5 w-3.5" /></button></td></tr>)}{current.models.length === 0 && <tr><td colSpan={6} className="px-5 py-14 text-center text-muted-foreground">鏆傛棤妯″瀷锛岃娣诲姞涓€涓ā鍨嬪紑濮嬮厤缃€?/td></tr>}</tbody></table></div></section></div><section className="mt-5 rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></div><div><h3 className="text-sm font-bold">鍓嶅彴妯″瀷閫夋嫨瑙勫垯</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">浠呭睍绀哄凡鍚敤妯″瀷锛涙瘡涓巶鍟嗛粯璁ゆ樉绀?3 鏉★紝鍙湪鍒楄〃鍐呮粴鍔ㄦ煡鐪嬫洿澶氥€傚巶鍟嗕笌妯″瀷椤哄簭銆侀粯璁ゆā鍨嬪強鍚敤鐘舵€佸潎鐢辨湰鍚庡彴閰嶇疆鎺у埗銆?/p></div></div></section><AnimatePresence>{modal && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-5 backdrop-blur-sm"><motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] tracking-[.18em] text-primary">MODEL MANAGEMENT</p><h2 className="mt-1 text-lg font-extrabold">{modal === "vendor" ? "娣诲姞妯″瀷鍘傚晢" : `娣诲姞妯″瀷鍒?${current.name}`}</h2></div><button onClick={() => setModal(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button></div><label className="mt-6 block text-xs font-bold">{modal === "vendor" ? "鍘傚晢鍚嶇О" : "妯″瀷鍚嶇О"}</label><input autoFocus value={field} onChange={(e) => setField(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder={modal === "vendor" ? "渚嬪锛欸oogle AI" : "渚嬪锛欸emini 2.5 Pro"} className="mt-2 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none focus:border-primary" /><p className="mt-3 text-[11px] leading-5 text-muted-foreground">鍒涘缓鍚庡彲鍦ㄥ垪琛ㄤ腑璋冩暣鍚敤鐘舵€併€佽缃粯璁よ矾鐢憋紝骞跺悓姝ュ埌鍓嶅彴妯″瀷閫夋嫨鍣ㄣ€?/p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setModal(null)} className="rounded-2xl px-4 py-2.5 text-xs text-muted-foreground">鍙栨秷</button><button onClick={create} className="rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">纭娣诲姞</button></div></motion.div></motion.div>}</AnimatePresence></>;
}
function KnowledgePanel() {
  const [bases, setBases] = useState(initialBases); const [active, setActive] = useState(1); const [showCreate, setShowCreate] = useState(false); const [name, setName] = useState(""); const [uploading, setUploading] = useState(false); const [files, setFiles] = useState(["浜у搧鐧界毊涔?2026.pdf", "Onboarding FAQ.md", "鍝佺墝璇濇湳搴?docx"]);
  const selected = bases.find((x) => x.id === active) || bases[0];
  const create = () => { if (!name.trim()) return; const b: KnowledgeBase = { id: Date.now(), name, description: "鏂板缓鐨勪紒涓氱煡璇嗛泦鍚?, docs: 0, chunks: "0", updated: "鍒氬垰", color: "from-orange-400 to-pink-500", status: "灏辩华" }; setBases((x) => [b, ...x]); setActive(b.id); setName(""); setShowCreate(false); };
  const upload = () => { setUploading(true); setTimeout(() => { setFiles((x) => [...x, "Q3 浜у搧绛栫暐.pdf"]); setBases((x) => x.map((b) => b.id === active ? { ...b, docs: b.docs + 1, chunks: (Number(b.chunks.replace(",", "")) + 32).toLocaleString(), updated: "鍒氬垰" } : b)); setUploading(false); }, 650); };
  return <><AdminHeading eyebrow="KNOWLEDGE / RAG" title="鐭ヨ瘑搴? copy="杩炴帴浼佷笟璧勬枡锛屼负 AI 鎻愪緵鍙俊銆佸彲杩芥函鐨勪笓灞炰笂涓嬫枃銆? action={<button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"><Plus className="h-3.5 w-3.5" /> 鏂板缓鐭ヨ瘑搴?/button>} />
    <div className="grid gap-5 2xl:grid-cols-[310px_1fr]"><section className="space-y-3">{bases.map((base) => <button key={base.id} onClick={() => setActive(base.id)} className={`group w-full rounded-2xl border p-4 text-left transition ${active === base.id ? "border-primary bg-primary/8 shadow-[0_8px_25px_rgba(48,123,255,.1)]" : "border-border bg-card hover:border-primary/40"}`}><div className="flex items-start gap-3"><div className={`grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br ${base.color} text-white`}><Database className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{base.name}</p><span className={`h-2 w-2 rounded-full ${base.status === "灏辩华" ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`} /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{base.description}</p></div></div><div className="mt-4 flex gap-3 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground"><span>{base.docs} DOCS</span><span>{base.chunks} CHUNKS</span></div></button>)}</section>
      <section className="min-w-0 rounded-2xl border border-border bg-card"><div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="text-base font-bold">{selected.name}</h2><span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">{selected.status}</span></div><p className="mt-1 text-xs text-muted-foreground">鏈€鍚庢洿鏂?{selected.updated} 路 鍚戦噺妯″瀷 text-embedding-3</p></div><button onClick={upload} disabled={uploading} className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-70"><Upload className="h-3.5 w-3.5" /> {uploading ? "姝ｅ湪瑙ｆ瀽鈥? : "涓婁紶鏂囨。"}</button></div><div className="grid gap-0 border-b border-border md:grid-cols-3">{[["鏂囨。鎬绘暟", selected.docs], ["鏂囨湰鍒嗗潡", selected.chunks], ["鍙洖鍑嗙‘鐜?, "94.8%"]].map(([a,b]) => <div key={a as string} className="border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><p className="font-mono text-[10px] tracking-wider text-muted-foreground">{a}</p><p className="mt-2 text-xl font-extrabold">{b}</p></div>)}</div><div className="p-5"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h3 className="text-sm font-bold">宸叉敹褰曟枃妗?/h3><div className="flex items-center rounded-lg bg-secondary px-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input placeholder="鎼滅储鏂囨。" className="w-36 bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs"><thead className="border-y border-border bg-secondary/50 font-mono text-[10px] tracking-wider text-muted-foreground"><tr>{["鏂囨。鍚嶇О", "绫诲瀷", "鍒嗗潡", "鐘舵€?, "鎿嶄綔"].map((x) => <th className="px-4 py-3 font-medium" key={x}>{x}</th>)}</tr></thead><tbody>{files.map((file, i) => <tr key={file} className="border-b border-border last:border-0 hover:bg-secondary/30"><td className="px-4 py-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><div><p className="font-semibold">{file}</p><p className="mt-1 text-[10px] text-muted-foreground">{i === 0 ? "18.4 MB" : "鏇存柊浜庝粖澶?}</p></div></div></td><td className="px-4 py-4 text-muted-foreground">{file.split(".").pop()?.toUpperCase()}</td><td className="px-4 py-4 text-muted-foreground">{[842, 126, 208, 32][i] || 64}</td><td className="px-4 py-4 text-emerald-500">鈼?鍙绱?/td><td className="px-4 py-4"><button className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div></div></section></div>
    <section className="mt-5 rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-500"><CircleHelp className="h-4 w-4" /></div><div><h3 className="text-sm font-bold">妫€绱㈠寮哄凡鍚敤</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">鐢ㄦ埛鍦ㄥ墠鍙板璇濅腑鏃犻渶绠＄悊鐭ヨ瘑搴撱€傜郴缁熷皢鍦ㄥ悎閫傜殑闂涓婇潤榛樻绱㈡巿鏉冭祫鏂欏苟寮曠敤鐩稿叧鐗囨锛岀‘淇濆墠鍚庡彴鑳藉姏涓庢潈闄愪繚鎸侀殧绂汇€?/p></div></div></section>
    <AnimatePresence>{showCreate && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-5 backdrop-blur-sm"><motion.div initial={{ scale: .95, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] tracking-[.16em] text-primary">NEW COLLECTION</p><h2 className="mt-1 text-lg font-extrabold">鏂板缓鐭ヨ瘑搴?/h2></div><button onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button></div><label className="mt-6 block text-xs font-bold">鐭ヨ瘑搴撳悕绉?/label><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} autoFocus placeholder="渚嬪锛氶攢鍞敮鎸佽祫鏂? className="mt-2 w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-sm outline-none focus:border-primary" /><p className="mt-3 text-[11px] leading-5 text-muted-foreground">鍒涘缓鍚庡嵆鍙笂浼?PDF銆丏OCX銆丮arkdown 鎴?TXT 鏂囦欢锛岀郴缁熶細鑷姩瑙ｆ瀽骞跺缓绔嬬储寮曘€?/p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowCreate(false)} className="rounded-2xl px-4 py-2.5 text-xs text-muted-foreground">鍙栨秷</button><button onClick={create} className="rounded-2xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">鍒涘缓鐭ヨ瘑搴?/button></div></motion.div></motion.div>}</AnimatePresence></>;
}
function InvalidLink({ theme, setTheme }: { theme: Theme; setTheme: (v: Theme) => void }) { return <div className="grid min-h-screen place-items-center bg-background p-5 text-center"><div className="absolute right-6 top-6"><ThemeButton theme={theme} setTheme={setTheme} /></div><div className="max-w-md"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-400"><LockKeyhole className="h-6 w-6" /></div><h1 className="mt-6 text-2xl font-extrabold">璁块棶閾炬帴鏃犳晥</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">姝ゆ湇鍔￠渶瑕佹湁鏁堢殑鎺堟潈 key銆傝妫€鏌ラ摼鎺ワ紝鎴栬仈绯荤鐞嗗憳閲嶆柊鑾峰彇璁块棶鍑瘉銆?/p><button onClick={() => window.location.href = window.location.pathname} className="mt-7 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 inline h-3.5 w-3.5" /> 杩斿洖鍏ュ彛</button></div></div>; }

export default function App() {
  const initial = useMemo(() => getMode(), []); const [mode, setMode] = useState<Mode>(initial.mode); const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("aistudio-theme") === "light" ? "light" : "dark");
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); localStorage.setItem("aistudio-theme", theme); }, [theme]);
  if (mode === "admin-login") return <AdminLogin theme={theme} setTheme={setTheme} onLogin={() => setMode("admin")} />;
  if (mode === "admin") return <AdminShell theme={theme} setTheme={setTheme} onExit={() => { setMode("admin-login"); window.history.replaceState({}, "", `${window.location.pathname}?admin`); }} />;
  if (mode === "invalid") return <InvalidLink theme={theme} setTheme={setTheme} />;
  return <UserShell apiKey={initial.key} addr={initial.addr} theme={theme} setTheme={setTheme} />;
}
