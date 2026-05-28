const state = {
  user: null,
  meta: null,
  requests: [],
  activeRequest: null,
  requirementsOpen: false,
  authorizationOpen: false,
  isThinking: false,
  pendingMessage: "",
  thinkingText: "",
  thinkingSteps: []
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const STANDALONE_MODE = window.location.protocol === "file:";
let standaloneMemory = { user: defaultUser(), requests: [] };

async function api(path, options = {}) {
  if (STANDALONE_MODE) return standaloneApi(path, options);
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload;
}

const LOCAL_KEY = "callrunner_standalone_v1";

const LOCAL_FIELDS = {
  united: {
    type: "health_claim",
    label: "UnitedHealthcare claim denial call",
    uploadLabel: "Upload denial letter, bill, EOB, or claim screenshot",
    fields: [
      { key: "memberFullName", label: "Member full name", type: "text", required: true, question: "What is the member’s full name?" },
      { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, sensitive: true, question: "What is the member’s date of birth?" },
      { key: "uhcMemberId", label: "UHC member ID", type: "text", required: true, sensitive: true, question: "What is the UHC member ID?" },
      { key: "claimId", label: "Claim ID", type: "text", required: true, sensitive: true, question: "What is the claim ID?" },
      { key: "dateOfService", label: "Date of service", type: "date", required: true, question: "What was the date of service?" },
      { key: "providerName", label: "Provider or hospital name", type: "text", required: true, question: "What provider or hospital was this with?" },
      { key: "callStatus", label: "Call status", type: "generated", generated: true },
      { key: "scheduledCallTime", label: "Scheduled call time", type: "generated", generated: true }
    ]
  },
  epic: {
    type: "refund",
    label: "EPIC Pass medical refund",
    uploadLabel: "Upload doctor's note, receipt, pass confirmation, or trip proof",
    fields: [
      { key: "passHolderName", label: "Pass holder name", type: "text", required: true, question: "What name is on the EPIC Pass account?" },
      { key: "epicAccountEmail", label: "EPIC account email", type: "text", required: true, sensitive: true, question: "What email is on the EPIC account?" },
      { key: "resort", label: "Resort visited", type: "text", required: true, placeholder: "Vail, Breckenridge, Park City", question: "Which resort was this for?" },
      { key: "tripDates", label: "Trip dates", type: "text", required: true, placeholder: "Jan 12-13, 2026", question: "What were the skiing dates?" },
      { key: "doctorNoteAvailable", label: "Doctor note available", type: "select", options: ["Yes", "No", "Can get one"], required: true, question: "Do you have medical documentation?" },
      { key: "refundAmount", label: "Refund amount", type: "money", required: false, question: "How much are you asking for?" },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, question: "What exact outcome should I ask EPIC for?" },
      { key: "refundPolicy", label: "Policy research", type: "generated", generated: true },
      { key: "refundRequestDraft", label: "Refund request draft", type: "generated", generated: true },
      { key: "callScript", label: "Phone script", type: "generated", generated: true }
    ]
  },
  geico: {
    type: "subscription",
    label: "GEICO auto policy cancellation",
    uploadLabel: "Upload new insurance card, declarations page, or renewal notice",
    fields: [
      { key: "policyNumber", label: "Policy number", type: "text", required: true, sensitive: true, question: "What is the GEICO policy number?" },
      { key: "vehicle", label: "Vehicle", type: "text", required: true, placeholder: "2021 Toyota RAV4", question: "Which car is on the policy?" },
      { key: "state", label: "State", type: "text", required: true, question: "Which state is the policy in?" },
      { key: "cancellationEffectiveDate", label: "Cancellation effective date", type: "date", required: true, question: "What date should cancellation start?" },
      { key: "replacementCoverageDate", label: "Replacement coverage start", type: "date", required: true, question: "When does the new insurance start?" },
      { key: "cancellationPolicy", label: "Cancellation policy/context", type: "generated", generated: true },
      { key: "cancellationEmailScript", label: "Cancellation email/script", type: "generated", generated: true },
      { key: "confirmationStatus", label: "Confirmation status", type: "generated", generated: true }
    ]
  },
  medical: {
    type: "bill",
    label: "Medical bill negotiation",
    uploadLabel: "Upload bill, EOB, or screenshots",
    fields: [
      { key: "providerName", label: "Provider name", type: "text", required: true, question: "Who sent the bill?" },
      { key: "currentMonthlyBill", label: "Current balance", type: "money", required: true, question: "What is the bill amount?" },
      { key: "planType", label: "Service type", type: "text", required: true, placeholder: "Outpatient imaging", question: "What was the medical service?" },
      { key: "serviceDate", label: "Service date", type: "date", required: true, question: "What was the service date?" },
      { key: "insuranceProcessed", label: "Insurance processed it?", type: "select", options: ["Yes", "No", "Not sure"], required: true, question: "Did insurance process it?" },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, question: "What should I ask billing for?" },
      { key: "itemizedBillRequest", label: "Itemized bill request", type: "generated", generated: true },
      { key: "negotiationScript", label: "Phone negotiation script", type: "generated", generated: true },
      { key: "estimatedSavings", label: "Estimated savings", type: "generated", generated: true }
    ]
  },
  general: {
    type: "general",
    label: "Company task",
    uploadLabel: "Upload relevant files",
    fields: [
      { key: "companyName", label: "Company/organization", type: "text", required: true, question: "Which company is this for?" },
      { key: "taskGoal", label: "Task goal", type: "textarea", required: true, question: "What do you want done?" },
      { key: "accountInfo", label: "Account/reference details", type: "textarea", required: false, sensitive: true },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, question: "What outcome should I push for?" },
      { key: "researchNotes", label: "Research notes", type: "generated", generated: true },
      { key: "callScript", label: "Call script", type: "generated", generated: true },
      { key: "emailDraft", label: "Email draft", type: "generated", generated: true }
    ]
  }
};

function standaloneLoad() {
  try {
    const storage = window.localStorage;
    const saved = JSON.parse(storage.getItem(LOCAL_KEY) || "null");
    standaloneMemory = saved || standaloneMemory;
  } catch {
    // Some file previews block browser storage. In that case, keep the demo alive in memory.
  }
  if (!standaloneMemory.user) standaloneMemory.user = defaultUser();
  return standaloneMemory;
}

function standaloneSave(data) {
  standaloneMemory = data;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // Storage is optional in standalone mode.
  }
}

function defaultUser() {
  return { id: "local_user", name: "You", email: "you@callrunner.local", role: "user" };
}

function localId(prefix) {
  return `${prefix}_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
}

function localMissing(dashboard) {
  return dashboard.fields.filter((field) => field.required && !field.generated && !String(dashboard.values[field.key] || "").trim());
}

function localSummary(request) {
  return {
    id: request.id,
    title: request.title,
    status: request.status,
    missingCount: localMissing(request.dashboard).length,
    updatedAt: request.updatedAt
  };
}

async function standaloneApi(path, options = {}) {
  await sleep(120);
  const method = options.method || "GET";
  const body = typeof options.body === "string" ? JSON.parse(options.body || "{}") : (options.body || {});
  const data = standaloneLoad();

  if (path === "/api/meta") return { taskTypes: {}, statuses: ["Drafting", "Waiting for user", "Ready to send", "In progress", "Completed", "Failed"] };
  if (path === "/api/session") return { user: data.user };
  if (path === "/api/logout" && method === "POST") {
    data.user = defaultUser();
    standaloneSave(data);
    return { ok: true };
  }
  if (path === "/api/login" && method === "POST") {
    const email = String(body.email || "you@example.com").trim().toLowerCase();
    data.user = { id: "local_user", name: email.split("@")[0] || "You", email, role: "user" };
    standaloneSave(data);
    return { user: data.user };
  }
  if (path === "/api/requests" && method === "GET") {
    return { requests: data.requests.map(localSummary).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) };
  }
  if (path === "/api/chat" && method === "POST") {
    const request = body.requestId
      ? localProcessMessage(data, body.requestId, String(body.message || ""))
      : localCreateRequest(data, String(body.message || ""));
    standaloneSave(data);
    return { request, requests: data.requests.map(localSummary).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) };
  }

  const match = path.match(/^\/api\/requests\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) throw new Error("This action is not available in standalone mode.");
  const request = data.requests.find((item) => item.id === match[1]);
  if (!request) throw new Error("Request not found.");
  const action = match[2] || "";

  if (method === "GET" && !action) return { request };
  if (method === "PATCH" && action === "dashboard") {
    request.dashboard.values = { ...request.dashboard.values, ...(body.values || {}) };
    localTouch(request);
    request.status = localMissing(request.dashboard).length ? "Waiting for user" : "Drafting";
    if (request.dashboard.type !== "health_claim") {
      request.messages.push(localMessage("assistant", localMissing(request.dashboard).length ? "Saved. I still need a few details before I can do the outreach cleanly." : "Got it. I have enough to research and draft the work. Type \"run agents\" when you want me to simulate it."));
    }
    standaloneSave(data);
    return { request, missing: localMissing(request.dashboard) };
  }
  if (method === "POST" && action === "files") {
    request.files = [...(request.files || []), { id: localId("file"), originalName: body.name || "upload", size: body.size || 0 }];
    localTouch(request);
    standaloneSave(data);
    return { request };
  }
  if (method === "POST" && action === "research") {
    localResearch(request);
    standaloneSave(data);
    return { request };
  }
  if (method === "POST" && action === "agent-run") {
    if (body.authorized) request.authorizationAccepted = true;
    localRunAgents(request);
    standaloneSave(data);
    return { request };
  }
  throw new Error("This action is not available in standalone mode.");
}

function localCreateRequest(data, message) {
  const expanded = /^\s*(demo|live demo|start demo|show demo|choose demo)\s*$/i.test(message)
    ? "Cancel my GEICO car insurance. I switched carriers and need cancellation effective 2026-06-01. My vehicle is a 2021 Toyota RAV4 in California. I want written confirmation and any unused premium refund."
    : message;
  const kind = localKind(expanded);
  const template = LOCAL_FIELDS[kind];
  const dashboard = {
    type: template.type,
    label: template.label,
    uploadLabel: template.uploadLabel,
    fields: template.fields,
    values: Object.fromEntries(template.fields.map((field) => [field.key, ""])),
    description: expanded
  };
  Object.assign(dashboard.values, localInfer(kind, expanded));
  const request = {
    id: localId("req"),
    type: template.type,
    title: localTitle(kind, expanded),
    description: expanded,
    status: localMissing(dashboard).length ? "Waiting for user" : "Drafting",
    dashboard,
    messages: [
      localMessage("user", message),
      ...(dashboard.type === "health_claim" ? [] : [localMessage("assistant", localReply(dashboard, message !== expanded))])
    ],
    files: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.requests.unshift(request);
  return request;
}

function localProcessMessage(data, requestId, message) {
  const request = data.requests.find((item) => item.id === requestId);
  request.messages.push(localMessage("user", message));
  if (/\b(run agents|do the work|call them|email them|send it|handle it)\b/i.test(message)) {
    localRunAgents(request);
  } else if (/\b(research|draft|action plan|make plan)\b/i.test(message)) {
    localResearch(request);
  } else {
    Object.assign(request.dashboard.values, localInfer(localKind(request.description), message));
    request.status = localMissing(request.dashboard).length ? "Waiting for user" : "Drafting";
    if (request.dashboard.type !== "health_claim") request.messages.push(localMessage("assistant", localReply(request.dashboard, false)));
  }
  localTouch(request);
  return request;
}

function localKind(text) {
  const lower = text.toLowerCase();
  if (/(unitedhealth|united health|unitedhealthcare|uhc|claim denied|denied claim|bill not covered|not covered)/.test(lower)) return "united";
  if (/(epic|ski|vail|refund|medical issue|doctor)/.test(lower)) return "epic";
  if (/(geico|car insurance|auto policy|cancel)/.test(lower)) return "geico";
  if (/(medical bill|hospital bill|eob|itemized|billing|negotiate)/.test(lower)) return "medical";
  return "general";
}

function localInfer(kind, text) {
  const updates = {};
  if (kind === "epic") {
    updates.desiredOutcome = /refund/i.test(text) ? "Refund the unused ski day because a medical issue prevented use." : "";
    if (/vail/i.test(text)) updates.resort = "Vail";
    if (/doctor|medical/i.test(text)) updates.doctorNoteAvailable = /have|yes/i.test(text) ? "Yes" : "";
  }
  if (kind === "geico") {
    updates.vehicle = (text.match(/\b20\d{2}\s+[A-Z][A-Za-z]+\s+[A-Z][A-Za-z0-9]+/) || [])[0] || "";
    if (/california|\bca\b/i.test(text)) updates.state = "California";
    const date = (text.match(/\b20\d{2}-\d{2}-\d{2}\b/) || [])[0];
    if (date) {
      updates.cancellationEffectiveDate = date;
      updates.replacementCoverageDate = date;
    }
  }
  if (kind === "medical") {
    updates.currentMonthlyBill = (text.match(/\$?\d{3,6}(?:\.\d{2})?/) || [])[0]?.replace("$", "") || "";
    updates.providerName = (text.match(/from ([A-Z][A-Za-z ]+?)(?: for| on|\.|,)/) || [])[1] || "";
    updates.insuranceProcessed = /insurance processed|eob/i.test(text) ? "Yes" : "";
    updates.desiredOutcome = "Ask for an itemized breakdown, billing review, discount, and payment options.";
  }
  if (kind === "united") {
    updates.providerName = (text.match(/(?:provider|hospital|with|from)\s+([A-Z][A-Za-z &.-]+?)(?:\.|,| on| for|$)/) || [])[1] || "";
    const date = (text.match(/\b20\d{2}-\d{2}-\d{2}\b/) || [])[0];
    if (date) updates.dateOfService = date;
    const claim = (text.match(/\bclaim(?: id| number)?[:\s#-]+([A-Z0-9-]{4,})/i) || [])[1];
    if (claim) updates.claimId = claim;
    const member = (text.match(/\bmember(?: id)?[:\s#-]+([A-Z0-9-]{4,})/i) || [])[1];
    if (member) updates.uhcMemberId = member;
  }
  if (kind === "general") {
    updates.taskGoal = text;
    updates.desiredOutcome = "Get a clear resolution and written confirmation.";
  }
  return Object.fromEntries(Object.entries(updates).filter(([, value]) => String(value || "").trim()));
}

function localTitle(kind, text) {
  if (kind === "united") return "UnitedHealthcare denied claim call";
  if (kind === "epic") return "EPIC Pass refund request";
  if (kind === "geico") return "Cancel GEICO insurance";
  if (kind === "medical") return "Lower medical bill";
  return text.slice(0, 64) || "New task";
}

function localReply(dashboard, choseDemo) {
  const missing = localMissing(dashboard);
  const demoLine = choseDemo ? "I’ll use a GEICO cancellation for the live demo.\n\n" : "";
  if (!missing.length) return `${demoLine}I checked the likely support path and have enough to draft the work. Type "run agents" when you want me to simulate the calls/emails.`;
  return `${demoLine}I checked what support will probably ask for. I made the form for this exact task, and I only need these blanks:\n\n${missing.slice(0, 4).map((field) => `- ${field.question || field.label}`).join("\n")}`;
}

function localResearch(request) {
  request.status = localMissing(request.dashboard).length ? "Waiting for user" : "Ready to send";
  if (request.status === "Waiting for user") {
    request.messages.push(localMessage("assistant", `I can’t draft cleanly yet. The form still needs:\n${localMissing(request.dashboard).map((field) => `- ${field.label}`).join("\n")}`));
    return;
  }
  request.research = { notes: "Simulated research: checked common support requirements, proof needs, and escalation path." };
  request.plan = { recommendedOutcome: "Ask for the requested outcome, get written confirmation, and keep proof in the task." };
  request.artifacts = { emailBody: localEmail(request), callScript: localCallScript(request) };
  request.messages.push(localMessage("assistant", "Research is done. I filled the output rows and prepared the email and phone script. Type \"run agents\" to simulate the work."));
}

function localRunAgents(request) {
  if (localMissing(request.dashboard).length) return localResearch(request);
  if (request.dashboard.type === "health_claim") {
    request.status = "In progress";
    request.dashboard.values.callStatus = "Call scheduled";
    request.dashboard.values.scheduledCallTime = "2026-05-04T15:00:00Z";
    request.messages.push(localMessage("assistant", "I scheduled the call for 2026-05-04T15:00:00Z (8:00 a.m.)."));
    localTouch(request);
    return;
  }
  if (!request.artifacts) localResearch(request);
  request.status = "In progress";
  request.messages.push(localMessage("assistant", "Agent work started.\n\nResearch agent: checked the likely policy path.\nEmail agent: prepared the message.\nPhone agent: prepared the call script and hold-music plan.\nTracker agent: status is In progress. I won’t mark it completed unless you confirm it."));
}

function localEmail(request) {
  const values = request.dashboard.values;
  return `Hello,\n\nI’m asking for help with this request:\n${request.description}\n\nDesired outcome:\n${values.desiredOutcome || values.taskGoal || "Please resolve this and confirm in writing."}\n\nThank you.`;
}

function localCallScript(request) {
  return `I’m calling about this request: ${request.description}. I need help getting a clear resolution and written confirmation. What information do you need from me to move this forward today?`;
}

function localMessage(sender, body) {
  return { id: localId("msg"), sender, body, createdAt: new Date().toISOString() };
}

function localTouch(request) {
  request.updatedAt = new Date().toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function route() {
  return location.hash.replace(/^#/, "") || "/workspace";
}

function navigate(path) {
  location.hash = path;
}

async function boot() {
  const [meta, session] = await Promise.all([api("/api/meta"), api("/api/session")]);
  state.meta = meta;
  state.user = session.user;
  if (!state.user) await login("you@callrunner.local");
  window.addEventListener("hashchange", render);
  if (route() === "/landing" || route() === "/auth") navigate("/workspace");
  render();
}

async function render() {
  const current = route();
  document.body.classList.remove("landing-active");
  if (current.startsWith("/auth") || current.startsWith("/landing")) {
    navigate("/workspace");
    return renderChatApp();
  }
  if (current.startsWith("/admin")) return renderAdmin();
  if (!state.user) await login("you@callrunner.local");
  return renderChatApp();
}

function shell(content) {
  const loggedIn = Boolean(state.user);
  return `
    <div class="simple-shell">
      ${loggedIn ? "" : ""}
      ${content}
    </div>
  `;
}

function bindLogout() {
  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/logout", { method: "POST" });
      state.user = defaultUser();
      state.requests = [];
      state.activeRequest = null;
      navigate("/workspace");
      showToast("Cleared this local session.");
    });
  });
}

function renderLanding() {
  navigate("/workspace");
  return renderChatApp();
}

function renderAuth() {
  navigate("/workspace");
  return renderChatApp();
}

async function login(email, password) {
  const result = await api("/api/login", { method: "POST", body: { email, password } });
  state.user = result.user;
  navigate("/workspace");
}

async function loadChatData() {
  const list = await api("/api/requests");
  state.requests = list.requests;
  const routedId = route().startsWith("/request/") ? route().split("/")[2] : null;
  const activeId = routedId || state.activeRequest?.id || null;
  if (!activeId) {
    state.activeRequest = null;
    return;
  }
  const found = state.requests.find((request) => request.id === activeId);
  if (!found) {
    state.activeRequest = null;
    return;
  }
  const detail = await api(`/api/requests/${activeId}`);
  state.activeRequest = detail.request;
  if (!state.isThinking && needsAuthorization(state.activeRequest)) state.authorizationOpen = true;
}

async function renderChatApp() {
  await loadChatData();
  app.innerHTML = shell(`
    <main class="gpt-app">
      <aside class="gpt-sidebar">
        <div class="sidebar-head">
          <a class="brand compact-brand" href="#/workspace"><span class="brand-mark" aria-hidden="true"></span><span>CallRunner</span></a>
        </div>
        <button class="new-chat" data-action="new-chat">+ New chat</button>
        <nav class="chat-history" aria-label="Previous tasks">
          ${renderHistory()}
        </nav>
      </aside>
      <section class="gpt-main">
        <div class="chat-window">
          ${state.activeRequest ? renderActiveChat() : renderEmptyChat()}
        </div>
        <form class="gpt-composer" id="chatComposer">
          <textarea name="message" rows="1" placeholder="${state.activeRequest ? "Message CallRunner, or type run agents" : "Message CallRunner"}"></textarea>
          <button type="submit" aria-label="Send">↑</button>
        </form>
      </section>
      ${renderRequirementsModal()}
      ${renderAuthorizationModal()}
    </main>
  `);
  bindChatApp();
  const windowEl = document.querySelector(".chat-window");
  if (windowEl) windowEl.scrollTop = windowEl.scrollHeight;
}

function renderHistory() {
  if (!state.requests.length) return `<div class="history-empty">No past chats</div>`;
  const needsInfo = state.requests.filter((request) => request.missingCount > 0 || request.status === "Waiting for user");
  const others = state.requests.filter((request) => !needsInfo.some((item) => item.id === request.id));
  return `
    ${needsInfo.length ? `<div class="history-section-label">Needs you</div>${needsInfo.map(renderHistoryItem).join("")}` : ""}
    ${others.length ? `<div class="history-section-label">History</div>${others.map(renderHistoryItem).join("")}` : ""}
  `;
}

function renderHistoryItem(request) {
  return `
    <a class="history-item ${state.activeRequest?.id === request.id ? "active" : ""}" href="#/request/${request.id}">
      <span class="history-title"><i class="status-dot status-${statusSlug(request.status)}"></i>${escapeHtml(request.title)}</span>
      <small>${escapeHtml(request.status)}${request.missingCount ? ` · ${request.missingCount} needed` : ""}</small>
    </a>
  `;
}

function statusSlug(status) {
  return String(status || "drafting").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderEmptyChat() {
  return `
    <section class="empty-chat">
      <div class="brand-large"><span class="brand-mark" aria-hidden="true"></span>CallRunner</div>
      <h1>What can I handle for you?</h1>
      <p class="quiet-start">Tell me what needs to get done. I’ll check what the company usually asks for before I bother you with questions.</p>
      ${state.isThinking ? renderPendingThinking() : ""}
    </section>
  `;
}

function renderActiveChat() {
  const request = state.activeRequest;
  return `
    <section class="chat-thread">
      <div class="chat-title">
        <div>
          <h1>${escapeHtml(request.dashboard.label || request.title)}</h1>
          <p><span class="status-pill"><i class="status-dot status-${statusSlug(request.status)}"></i>${escapeHtml(request.status)}</span></p>
        </div>
        ${renderHeaderAction(request)}
      </div>
      ${visibleMessages(request).map(renderMessage).join("")}
      ${state.pendingMessage ? renderPendingUserMessage() : ""}
      ${state.isThinking ? renderThinkingMessage() : ""}
      ${renderTaskCard(request)}
    </section>
  `;
}

function renderHeaderAction(request) {
  const missing = missingFields(request);
  if (missing.length) return `<button class="ghost-button" data-action="open-requirements">Fill missing details</button>`;
  if (request.dashboard?.type === "health_claim") {
    return request.status === "In progress"
      ? `<button class="ghost-button" disabled>Call scheduled</button>`
      : "";
  }
  return `<button class="ghost-button" data-action="run-agents">${["In progress", "Completed"].includes(request.status) ? "Agents running" : "Run agents"}</button>`;
}

function renderMessage(message) {
  const isUser = message.sender === "user";
  return `
    <div class="gpt-message ${isUser ? "user-message" : "assistant-message"}">
      ${isUser ? "" : `<div class="message-avatar"><span class="brand-mark" aria-hidden="true"></span></div>`}
      <div class="message-content">${escapeHtml(message.body)}</div>
    </div>
  `;
}

function visibleMessages(request) {
  const messages = request.messages || [];
  if (request.dashboard?.type !== "health_claim") return messages;
  return messages.filter((message) => {
    if (message.sender === "user") return true;
    return /scheduled the call/i.test(message.body || "");
  });
}

function renderThinkingMessage() {
  return `
    <div class="gpt-message assistant-message thinking-message">
      <div class="message-avatar"><span class="brand-mark" aria-hidden="true"></span></div>
      <div class="message-content">${renderThinkingContent()}</div>
    </div>
  `;
}

function renderPendingUserMessage() {
  return `
    <div class="gpt-message user-message">
      <div class="message-content">${escapeHtml(state.pendingMessage)}</div>
    </div>
  `;
}

function renderPendingThinking() {
  return `
    <div class="pending-thinking">
      ${state.pendingMessage ? `<div class="mini-user">${escapeHtml(state.pendingMessage)}</div>` : ""}
      <div class="mini-thinking">${renderThinkingContent()}</div>
    </div>
  `;
}

function renderThinkingContent() {
  const steps = state.thinkingSteps.length ? state.thinkingSteps : [state.thinkingText || "Reading..."];
  return `
    <div class="thinking-card">
      <div class="thinking-list">
        ${steps.map((step, index) => `<span class="${index === steps.length - 1 ? "current" : ""}">${escapeHtml(step)}</span>`).join("")}
      </div>
      <div class="thinking-cues" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>
  `;
}

function renderTaskCard(request) {
  const missing = missingFields(request);
  if (missing.length) {
    return `
      <div class="inline-task-card">
        <strong>${missing.length} details needed</strong>
        <span>${missing.slice(0, 3).map((field) => escapeHtml(field.label)).join(", ")}${missing.length > 3 ? "..." : ""}</span>
        <button class="button" data-action="open-requirements">Fill form</button>
      </div>
    `;
  }
  if (request.artifacts) {
    return `
      <div class="inline-task-card">
        <strong>Agent work package ready</strong>
        <span>Email and phone scripts are prepared for ${escapeHtml(companyName(request))}.</span>
        <button class="button" data-action="run-agents" ${["In progress", "Completed"].includes(request.status) ? "disabled" : ""}>${["In progress", "Completed"].includes(request.status) ? "In progress" : "Run agents"}</button>
      </div>
    `;
  }
  if (request.dashboard.type === "health_claim") {
    if (request.status === "In progress") {
      return `
        <div class="inline-task-card">
          <strong>Call scheduled</strong>
          <span>2026-05-04T15:00:00Z · 8:00 a.m.</span>
        </div>
      `;
    }
    return "";
  }
  return `
    <div class="inline-task-card">
      <strong>Requirements captured</strong>
      <span>CallRunner has enough to research and draft the work.</span>
      <button class="button" data-action="research-task">Research and draft</button>
    </div>
  `;
}

function renderRequirementsModal() {
  const request = state.activeRequest;
  if (!request || !state.requirementsOpen) return "";
  const missing = missingFields(request);
  if (!missing.length) return "";
  return `
    <div class="modal-backdrop">
      <section class="requirements-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>Fill the missing details</h2>
            <p>${escapeHtml(request.dashboard.label)} · ${missing.length} item${missing.length === 1 ? "" : "s"}</p>
          </div>
          <button class="icon-button" data-action="close-requirements" aria-label="Close">×</button>
        </div>
        <form id="requirementsForm" class="missing-form">
          ${missing.map(renderMissingField).join("")}
          <label class="file-field">
            <span>${escapeHtml(request.dashboard.uploadLabel || "Upload files")}</span>
            <input id="fileInput" type="file" multiple>
          </label>
          <div class="modal-actions">
            <button class="ghost-button" type="button" data-action="close-requirements">Later</button>
            <button class="button" type="submit">Save details</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderAuthorizationModal() {
  const request = state.activeRequest;
  if (!request || !state.authorizationOpen) return "";
  const name = authorizationName(request);
  return `
    <div class="modal-backdrop">
      <section class="requirements-modal authz-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <div>
            <h2>Authorize this call</h2>
          </div>
          <button class="icon-button" data-action="close-authorization" aria-label="Close">×</button>
        </div>
        <form id="authorizationForm" class="authorization-form">
          <div class="authorization-copy">
            <p>I authorize CallRunner to contact third parties on my behalf for the task I selected.</p>
            <p>CallRunner may identify itself as my authorized assistant, share the information I provide, ask questions, wait on hold, and collect information needed to complete the task.</p>
            <p>I understand that actions taken for this task are done with my knowledge and consent, and that the third party may still ask me to verify my identity or join the call.</p>
          </div>
          <label class="authorization-check">
            <input type="checkbox" name="authorized" required>
            <span>I agree</span>
            <em>I, ${escapeHtml(name)}, authorize CallRunner to act on my behalf for this task.</em>
          </label>
          <div class="modal-actions">
            <button class="ghost-button" type="button" data-action="close-authorization">Cancel</button>
            <button class="button" type="submit">Authorize</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function authorizationName(request) {
  const values = request.dashboard.values || {};
  return values.memberFullName || values.passHolderName || values.fullName || values.name || "the member";
}

function renderMissingField(field) {
  const label = `${escapeHtml(field.label)}${field.sensitive ? ` <span class="sensitive">Sensitive</span>` : ""}`;
  if (field.type === "textarea") {
    return `
      <label class="modal-field">
        <span>${label}</span>
        <textarea name="${field.key}" placeholder="${escapeHtml(field.placeholder || field.question || "")}"></textarea>
      </label>
    `;
  }
  if (field.type === "select") {
    return `
      <label class="modal-field">
        <span>${label}</span>
        <select name="${field.key}">
          <option value="">Select</option>
          ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  const type = field.type === "date" ? "date" : "text";
  return `
    <label class="modal-field">
      <span>${label}</span>
      <input name="${field.key}" type="${type}" placeholder="${escapeHtml(field.placeholder || field.question || "")}">
    </label>
  `;
}

function bindChatApp() {
  bindLogout();
  document.querySelectorAll("[data-action='new-chat']").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeRequest = null;
      state.requirementsOpen = false;
      navigate("/workspace");
      renderChatApp();
    });
  });
  document.querySelector("#chatComposer")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.message;
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    await sendChat(message, state.activeRequest?.id || null);
  });
  document.querySelectorAll("[data-action='open-requirements']").forEach((button) => {
    button.addEventListener("click", () => {
      state.requirementsOpen = true;
      renderChatApp();
    });
  });
  document.querySelectorAll("[data-action='close-requirements']").forEach((button) => {
    button.addEventListener("click", () => {
      state.requirementsOpen = false;
      renderChatApp();
    });
  });
  document.querySelectorAll("[data-action='close-authorization']").forEach((button) => {
    button.addEventListener("click", () => {
      state.authorizationOpen = false;
      renderChatApp();
    });
  });
  document.querySelectorAll("[data-action='research-task']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!state.activeRequest) return;
      await sendChat("research and draft", state.activeRequest.id);
    });
  });
  document.querySelectorAll("[data-action='run-agents']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!state.activeRequest || button.disabled) return;
      await sendChat("run agents", state.activeRequest.id);
    });
  });
  document.querySelector("#requirementsForm")?.addEventListener("submit", saveRequirements);
  document.querySelector("#authorizationForm")?.addEventListener("submit", confirmAuthorizationAndRun);
  document.querySelector("#fileInput")?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) await uploadFile(state.activeRequest.id, file);
    showToast("File uploaded.");
  });
}

async function sendChat(message, requestId) {
  try {
    state.isThinking = true;
    state.requirementsOpen = false;
    state.authorizationOpen = false;
    state.pendingMessage = message;
    state.thinkingText = "Reading...";
    state.thinkingSteps = [];
    renderChatApp();
    await playThinkingSequence(requestId);
    if (requestId && isRunAgentsIntent(message) && needsAuthorization(state.activeRequest)) {
      state.isThinking = false;
      state.pendingMessage = "";
      state.thinkingText = "";
      state.thinkingSteps = [];
      state.authorizationOpen = true;
      renderChatApp();
      return;
    }
    const result = await api("/api/chat", { method: "POST", body: { message, requestId } });
    state.requests = result.requests || state.requests;
    state.activeRequest = result.request;
    state.requirementsOpen = missingFields(result.request).length > 0;
    state.isThinking = false;
    state.pendingMessage = "";
    state.thinkingText = "";
    state.thinkingSteps = [];
    navigate(`/request/${result.request.id}`);
    renderChatApp();
  } catch (error) {
    state.isThinking = false;
    state.pendingMessage = "";
    state.thinkingText = "";
    state.thinkingSteps = [];
    showToast(error.message);
    renderChatApp();
  }
}

async function playThinkingSequence(requestId) {
  const lower = state.pendingMessage.toLowerCase();
  const companyMatch = lower.match(/\b(geico|epic pass|epic|vail|kaiser|aetna|anthem|comcast|xfinity|verizon|at&t|delta|united|american airlines)\b/i)?.[0];
  const company = companyMatch ? companyMatch.replace(/\b\w/g, (char) => char.toUpperCase()) : "";
  const steps = [
    "Reading...",
    company ? `Checking ${company}...` : "Checking the basics...",
    "Finding blanks...",
    requestId ? "Updating..." : "Making the form..."
  ];
  for (const step of steps) {
    state.thinkingText = step;
    state.thinkingSteps = [...state.thinkingSteps, step].slice(-4);
    renderChatApp();
    await sleep(1550 + Math.floor(Math.random() * 900));
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRunAgentsIntent(message) {
  return /\b(run agents|do the work|call them|email them|send it|handle it|schedule call|schedule the call)\b/i.test(message);
}

function needsAuthorization(request) {
  if (!request) return false;
  return request.dashboard?.type === "health_claim"
    && !request.authorizationAccepted
    && !["In progress", "Completed"].includes(request.status)
    && missingFields(request).length === 0;
}

async function confirmAuthorizationAndRun(event) {
  event.preventDefault();
  if (!state.activeRequest) return;
  state.authorizationOpen = false;
  state.isThinking = true;
  state.pendingMessage = "";
  state.thinkingSteps = [];
  const steps = ["Checking consent...", "Scheduling call..."];
  for (const step of steps) {
    state.thinkingText = step;
    state.thinkingSteps = [...state.thinkingSteps, step];
    renderChatApp();
    await sleep(1500 + Math.floor(Math.random() * 700));
  }
  const result = await api(`/api/requests/${state.activeRequest.id}/agent-run`, {
    method: "POST",
    body: { authorized: true }
  });
  state.activeRequest = result.request;
  state.requests = (await api("/api/requests")).requests;
  state.isThinking = false;
  state.thinkingText = "";
  state.thinkingSteps = [];
  renderChatApp();
}

async function saveRequirements(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const result = await api(`/api/requests/${state.activeRequest.id}/dashboard`, {
    method: "PATCH",
    body: { values }
  });
  state.activeRequest = result.request;
  state.requirementsOpen = missingFields(result.request).length > 0;
  if (state.activeRequest.dashboard?.type === "health_claim" && !state.requirementsOpen) {
    state.isThinking = true;
    state.pendingMessage = "";
    state.thinkingText = "Checking...";
    state.thinkingSteps = [];
    renderChatApp();
    for (const step of ["Checking...", "Preparing consent..."]) {
      state.thinkingText = step;
      state.thinkingSteps = [...state.thinkingSteps, step];
      renderChatApp();
      await sleep(1300 + Math.floor(Math.random() * 700));
    }
    state.isThinking = false;
    state.thinkingText = "";
    state.thinkingSteps = [];
    state.authorizationOpen = true;
    renderChatApp();
    return;
  }
  showToast(state.requirementsOpen ? "Saved. A few details are still missing." : "Details saved.");
  renderChatApp();
}

function uploadFile(requestId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        resolve(await api(`/api/requests/${requestId}/files`, {
          method: "POST",
          body: { name: file.name, type: file.type, size: file.size, data: reader.result }
        }));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function missingFields(request) {
  return (request.dashboard.fields || []).filter((field) => {
    if (field.generated || field.type === "generated" || field.type === "file-note") return false;
    return field.required && !String(request.dashboard.values?.[field.key] || "").trim();
  });
}

function companyName(request) {
  const values = request.dashboard.values || {};
  return values.merchantName || values.companyName || values.providerName || values.travelCompany || "the company";
}

async function renderAdmin() {
  if (!state.user) return navigate("/auth");
  if (state.user.role !== "admin") {
    app.innerHTML = shell(`<main class="page"><div class="empty-state"><h3>Admin access required</h3></div></main>`);
    return;
  }
  const { requests } = await api("/api/admin/requests");
  app.innerHTML = shell(`
    <main class="page">
      <div class="page-title">
        <div>
          <h1>Admin</h1>
          <p>All tasks, users, statuses, and required actions.</p>
        </div>
        <a class="ghost-button" href="#/workspace">Back to chat</a>
      </div>
      <section class="container">
        <table class="admin-table">
          <thead>
            <tr><th>Task</th><th>User</th><th>Status</th><th>Action</th><th>Updated</th></tr>
          </thead>
          <tbody>
            ${requests.map((request) => `
              <tr>
                <td><a href="#/request/${request.id}">${escapeHtml(request.title)}</a></td>
                <td>${escapeHtml(request.user?.email || "")}</td>
                <td>${escapeHtml(request.status)}</td>
                <td>${request.missingCount ? `${request.missingCount} needed` : "None"}</td>
                <td>${new Date(request.updatedAt).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    </main>
  `);
}

boot().catch((error) => {
  app.innerHTML = `<main class="page"><div class="empty-state"><h3>Could not start app</h3><p>${escapeHtml(error.message)}</p></div></main>`;
});
