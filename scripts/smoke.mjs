const baseUrl = process.env.SMOKE_URL || "http://localhost:8787";

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return { response, text };
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return { response, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = await get("/");
assert(root.text.includes('id="root"'), "Root HTML does not contain app root");

const admin = await get("/admin");
assert(admin.text.includes('id="root"'), "Admin HTML does not contain app root");

const health = JSON.parse((await get("/api/health")).text);
assert(health.ok, "Health endpoint is not ok");

const bootstrap = JSON.parse((await get("/api/public/bootstrap")).text);
const bootstrapJson = JSON.stringify(bootstrap);
assert(!bootstrapJson.includes("apiKey"), "Public bootstrap leaked apiKey");
assert(!bootstrapJson.includes("baseUrl"), "Public bootstrap leaked baseUrl");
assert(!bootstrapJson.includes("adminEntryEnabled"), "Public bootstrap leaked admin entry flag");
assert(!bootstrapJson.includes("checklist"), "Public bootstrap leaked admin operations checklist");
assert(!bootstrapJson.includes("backups"), "Public bootstrap leaked admin backups");
assert(!bootstrap.menuItems?.some((item) => item.id === "settings"), "Public bootstrap contains settings menu");
assert(!bootstrap.conversations?.length, "Public bootstrap contains conversation summaries");

const conversations = await request("/api/conversations");
assert(conversations.response.status === 410, "Legacy public conversation list route must return 410");
const conversationDetail = await request("/api/conversations/smoke");
assert(conversationDetail.response.status === 410, "Legacy public conversation detail route must return 410");

console.log(`Smoke passed for ${baseUrl}`);
