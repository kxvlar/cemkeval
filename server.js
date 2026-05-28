const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} = require("node:fs");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "pine-agent.sqlite");
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const STATUSES = [
  "Drafting",
  "Waiting for user",
  "Ready to send",
  "In progress",
  "Completed",
  "Failed"
];

const TASK_TYPES = {
  bill: {
    label: "Lower a bill",
    icon: "$",
    accent: "mint",
    summary: "Negotiate a recurring bill using account details, competitor prices, and a direct retention script.",
    fields: [
      { key: "providerName", label: "Provider name", type: "text", required: true, placeholder: "Comcast, Verizon, AT&T", question: "Which provider is the bill with?" },
      { key: "currentMonthlyBill", label: "Current monthly bill", type: "money", required: true, placeholder: "145", question: "What is the current monthly amount?" },
      { key: "planType", label: "Plan type", type: "text", required: true, placeholder: "Internet 500 Mbps, family phone plan", question: "What plan or package are you on?" },
      { key: "accountNumber", label: "Account number", type: "text", required: false, sensitive: true, placeholder: "Optional" },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, placeholder: "Lower to under $95/month or receive a loyalty credit", question: "What outcome would feel like a win?" },
      { key: "competitorPrices", label: "Competitor prices found", type: "generated", generated: true },
      { key: "suggestedNegotiationScript", label: "Suggested negotiation script", type: "generated", generated: true },
      { key: "estimatedSavings", label: "Estimated savings", type: "generated", generated: true }
    ],
    uploadLabel: "Upload bill"
  },
  subscription: {
    label: "Cancel a subscription",
    icon: "X",
    accent: "coral",
    summary: "Cancel cleanly, check refund eligibility, and collect proof of confirmation.",
    fields: [
      { key: "companyName", label: "Company name", type: "text", required: true, placeholder: "Streaming, software, gym, box service", question: "Which company should we cancel?" },
      { key: "loginDetails", label: "Login/account details field", type: "textarea", required: false, sensitive: true, placeholder: "Username, masked account hint, or where you usually log in" },
      { key: "subscriptionType", label: "Subscription type", type: "text", required: true, placeholder: "Monthly premium plan", question: "What subscription type or plan is it?" },
      { key: "renewalDate", label: "Renewal date", type: "date", required: true, question: "When does it renew?" },
      { key: "cancellationPolicy", label: "Cancellation policy", type: "generated", generated: true },
      { key: "refundEligibility", label: "Refund eligibility", type: "generated", generated: true },
      { key: "cancellationEmailScript", label: "Cancellation email/script", type: "generated", generated: true },
      { key: "confirmationStatus", label: "Confirmation status", type: "select", options: ["Not requested", "Requested", "Confirmed", "Needs follow-up"], required: false }
    ],
    uploadLabel: "Upload invoice or renewal notice"
  },
  refund: {
    label: "Get a refund",
    icon: "%",
    accent: "gold",
    summary: "Build a refund request with purchase proof, policy notes, and escalation steps.",
    fields: [
      { key: "merchantName", label: "Merchant/company", type: "text", required: true, placeholder: "Store, app, airline, marketplace", question: "Who should the refund request go to?" },
      { key: "orderNumber", label: "Order or booking number", type: "text", required: false, placeholder: "Optional but useful" },
      { key: "purchaseDate", label: "Purchase date", type: "date", required: true, question: "When was the purchase made?" },
      { key: "refundAmount", label: "Refund amount", type: "money", required: true, question: "How much are you trying to recover?" },
      { key: "refundReason", label: "Refund reason", type: "textarea", required: true, placeholder: "Describe what went wrong", question: "What happened?" },
      { key: "refundPolicy", label: "Policy research", type: "generated", generated: true },
      { key: "refundRequestDraft", label: "Refund request draft", type: "generated", generated: true },
      { key: "escalationRoute", label: "Escalation route", type: "generated", generated: true }
    ],
    uploadLabel: "Upload receipt, screenshots, or proof"
  },
  complaint: {
    label: "File a complaint",
    icon: "!",
    accent: "ink",
    summary: "Turn a messy issue into a documented complaint with a clear resolution ask.",
    fields: [
      { key: "companyName", label: "Company/agency", type: "text", required: true, question: "Who is the complaint about?" },
      { key: "issueSummary", label: "Issue summary", type: "textarea", required: true, question: "What happened, in plain terms?" },
      { key: "desiredResolution", label: "Desired resolution", type: "textarea", required: true, question: "What do you want them to do?" },
      { key: "incidentDates", label: "Important dates", type: "text", required: false, placeholder: "Purchase, service, contact, denial dates" },
      { key: "contactHistory", label: "Contact history", type: "textarea", required: false, placeholder: "Calls, emails, chats, reference numbers" },
      { key: "complaintPolicy", label: "Policy/context research", type: "generated", generated: true },
      { key: "complaintDraft", label: "Complaint letter", type: "generated", generated: true },
      { key: "escalationPath", label: "Escalation path", type: "generated", generated: true }
    ],
    uploadLabel: "Upload evidence"
  },
  parking: {
    label: "Dispute a parking ticket",
    icon: "P",
    accent: "sky",
    summary: "Prepare a ticket dispute with deadlines, evidence, and a concise argument.",
    fields: [
      { key: "cityAgency", label: "City/agency", type: "text", required: true, question: "Which city or agency issued the ticket?" },
      { key: "ticketNumber", label: "Ticket number", type: "text", required: true, question: "What is the ticket number?" },
      { key: "violationDate", label: "Violation date", type: "date", required: true, question: "What is the violation date?" },
      { key: "fineAmount", label: "Fine amount", type: "money", required: true, question: "How much is the fine?" },
      { key: "disputeReason", label: "Reason for dispute", type: "textarea", required: true, placeholder: "Broken meter, unclear signage, paid parking proof", question: "Why should it be dismissed or reduced?" },
      { key: "filingDeadline", label: "Filing deadline", type: "generated", generated: true },
      { key: "disputeArgument", label: "Dispute argument", type: "generated", generated: true },
      { key: "submissionChecklist", label: "Submission checklist", type: "generated", generated: true }
    ],
    uploadLabel: "Upload ticket, sign photos, meter photos, receipts"
  },
  appointment: {
    label: "Book an appointment",
    icon: "+",
    accent: "mint",
    summary: "Collect scheduling constraints and produce a call/email booking script.",
    fields: [
      { key: "providerName", label: "Provider/company", type: "text", required: true, question: "Who should the appointment be with?" },
      { key: "appointmentType", label: "Appointment type", type: "text", required: true, placeholder: "Dental cleaning, passport renewal, repair visit", question: "What type of appointment do you need?" },
      { key: "dateWindow", label: "Date/time window", type: "textarea", required: true, placeholder: "Weekdays after 3pm, next two weeks", question: "What times work for you?" },
      { key: "locationPreference", label: "Location preference", type: "text", required: false, placeholder: "Nearby city, office, remote" },
      { key: "insuranceOrAccount", label: "Insurance/account info", type: "text", required: false, sensitive: true, placeholder: "Optional" },
      { key: "constraints", label: "Constraints", type: "textarea", required: false, placeholder: "Accessibility, urgency, preferred clinician, language" },
      { key: "bookingScript", label: "Booking script", type: "generated", generated: true },
      { key: "bookingChecklist", label: "Booking checklist", type: "generated", generated: true }
    ],
    uploadLabel: "Upload referral, form, or prior notice"
  },
  travel: {
    label: "Travel issue help",
    icon: ">",
    accent: "sky",
    summary: "Handle airline, hotel, rental, and booking problems with policy-backed messaging.",
    fields: [
      { key: "travelCompany", label: "Airline/hotel/company", type: "text", required: true, question: "Which airline, hotel, or travel company is involved?" },
      { key: "bookingNumber", label: "Booking number", type: "text", required: true, question: "What is the booking or confirmation number?" },
      { key: "tripDate", label: "Date of trip", type: "date", required: true, question: "What was the trip date?" },
      { key: "problemType", label: "Problem type", type: "select", options: ["Delay", "Cancellation", "Baggage", "Hotel issue", "Overcharge", "Refund delay", "Other"], required: true, question: "What kind of travel issue is it?" },
      { key: "uploadedReceipts", label: "Uploaded receipts/screenshots", type: "file-note", generated: true },
      { key: "policyResearch", label: "Policy research", type: "generated", generated: true },
      { key: "compensationRequest", label: "Compensation/refund request", type: "generated", generated: true },
      { key: "draftMessage", label: "Draft message", type: "generated", generated: true }
    ],
    uploadLabel: "Upload receipts, screenshots, boarding pass, or hotel folio"
  },
  general: {
    label: "General request",
    icon: "*",
    accent: "coral",
    summary: "For any call, email, account, company, or form task that does not fit the presets.",
    fields: [
      { key: "companyName", label: "Company/organization", type: "text", required: true, question: "Which company or organization is this for?" },
      { key: "taskGoal", label: "Task goal", type: "textarea", required: true, question: "What exactly do you want done?" },
      { key: "accountInfo", label: "Account details", type: "textarea", required: false, sensitive: true, placeholder: "Masked account hint, plan, reference number" },
      { key: "contactPreference", label: "Preferred contact method", type: "select", options: ["Email", "Phone", "Web form", "Chat", "No preference"], required: false },
      { key: "constraints", label: "Constraints", type: "textarea", required: false, placeholder: "Deadline, budget, things to avoid" },
      { key: "researchNotes", label: "Research notes", type: "generated", generated: true },
      { key: "callScript", label: "Call script", type: "generated", generated: true },
      { key: "emailDraft", label: "Email draft", type: "generated", generated: true }
    ],
    uploadLabel: "Upload relevant files"
  }
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      dashboard_json TEXT NOT NULL,
      research_json TEXT,
      plan_json TEXT,
      artifacts_json TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS status_events (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );
  `);

  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (existing === 0) {
    createUser("Alex Morgan", "alex@example.com", "demo123", "user");
    createUser("CallRunner Admin", "admin@example.com", "admin123", "admin");
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function createUser(name, email, password, role = "user") {
  const user = {
    id: id("usr"),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password_hash: hashPassword(password),
    role,
    created_at: now()
  };
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, user.name, user.email, user.password_hash, user.role, user.created_at);
  return publicUser(user);
}

function nameFromEmail(email) {
  const local = String(email || "").split("@")[0] || "CallRunner User";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ") || "CallRunner User";
}

function seedDemoRequest(userId) {
  seedScenarioRequests(userId);
}

function seedScenarioRequests(userId) {
  const scenarios = [
    {
      title: "EPIC Pass refund for unused medical ski day",
      type: "refund",
      status: "Ready to send",
      description: "I need a refund from EPIC Pass. I bought a 2-day pass for Vail, skied day 1, then had a medical issue and could not use day 2. I have a doctor's note.",
      values: {
        passHolderName: "Alex Morgan",
        epicAccountEmail: "alex@example.com",
        resort: "Vail",
        tripDates: "January 18-19, 2026",
        unusedDayDate: "January 19, 2026",
        medicalIssueSummary: "Acute knee swelling after the first ski day. Doctor advised no skiing on day 2.",
        doctorNoteAvailable: "Yes",
        refundAmount: "189",
        desiredOutcome: "Refund the unused second ski day to the original payment method."
      }
    },
    {
      title: "Cancel GEICO auto policy after switching carriers",
      type: "subscription",
      status: "Completed",
      description: "Cancel my GEICO car insurance because I switched carriers and need confirmation plus any unused premium refund.",
      values: {
        policyNumber: "GEI-DEMO-2481",
        vehicle: "2021 Toyota RAV4",
        state: "California",
        cancellationEffectiveDate: "2026-06-01",
        replacementCoverageDate: "2026-06-01",
        renewalDate: "2026-06-15",
        refundMailingAddress: "On file",
        confirmationStatus: "Confirmed"
      }
    },
    {
      title: "Lower medical bill and request itemized breakdown",
      type: "bill",
      status: "Waiting for user",
      description: "Lower my medical bill. I need an itemized breakdown first, then I want the agent to negotiate over the phone.",
      values: {
        providerName: "Summit Health Billing",
        patientName: "Alex Morgan",
        serviceDate: "2026-04-03",
        planType: "Outpatient imaging",
        currentMonthlyBill: "1240",
        insuranceStatus: "Insurance processed",
        eobStatus: "Yes",
        itemizedBillNeeded: "Yes",
        desiredOutcome: "Ask for an itemized bill, coding review, financial assistance screening, and a 40% reduction or no-interest payment plan."
      }
    }
  ];

  for (const scenario of scenarios) {
    const exists = db.prepare("SELECT id FROM requests WHERE user_id = ? AND title = ?").get(userId, scenario.title);
    if (exists) continue;
    const dashboard = createPersonalizedDashboard(scenario.type, scenario.description, scenario.values);
    const generated = generateResearchPlanAndArtifacts({
      type: dashboard.type,
      dashboard,
      description: scenario.description,
      files: []
    });
    const requestId = id("req");
    const createdAt = now();
    db.prepare(`
      INSERT INTO requests (id, user_id, type, title, description, status, dashboard_json, research_json, plan_json, artifacts_json, approved_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      userId,
      dashboard.type,
      scenario.title,
      scenario.description,
      scenario.status,
      JSON.stringify(generated.dashboard),
      JSON.stringify(generated.research),
      JSON.stringify(generated.plan),
      JSON.stringify(generated.artifacts),
      ["In progress", "Completed"].includes(scenario.status) ? createdAt : null,
      createdAt,
      createdAt
    );
    addStatusEvent(requestId, scenario.status, scenario.status === "Completed" ? "Demo task completed with simulated confirmation." : "Demo task seeded for chat testing.");
    addMessage(requestId, "user", scenario.description, { kind: "demo" });
    addMessage(requestId, "assistant", scenario.status === "Completed"
      ? "Demo complete: GEICO cancellation confirmation is recorded, and the unused-premium refund follow-up is saved in the task."
      : composeFollowup(generated.dashboard, []), { kind: "followup" });
    if (scenario.status !== "Waiting for user") {
      addMessage(requestId, "assistant", "I prepared the personalized requirement table, researched the context, and drafted the agent work package. You can inspect the table or ask me to run the agents again.", { kind: "plan" });
    }
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, expires, now());
  return { token, expires };
}

function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.pine_session;
  if (!token) return null;
  const session = db.prepare(`
    SELECT sessions.token, sessions.expires_at, users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    if (session) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return publicUser(session);
}

function parseCookies(header) {
  return header.split(";").reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey) cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function setSessionCookie(res, session) {
  res.setHeader("Set-Cookie", [
    `pine_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(session.expires).toUTCString()}`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "pine_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createDashboard(type, description) {
  const template = TASK_TYPES[type] || TASK_TYPES.general;
  const values = {};
  for (const field of template.fields) values[field.key] = "";
  return {
    type,
    label: template.label,
    summary: template.summary,
    uploadLabel: template.uploadLabel,
    fields: template.fields,
    values,
    description,
    generatedAt: null
  };
}

function makeValues(fields, seedValues = {}) {
  const values = {};
  for (const field of fields) values[field.key] = seedValues[field.key] || "";
  return values;
}

function createPersonalizedDashboard(type, description, seedValues = {}) {
  const lower = `${description || ""} ${Object.values(seedValues).join(" ")}`.toLowerCase();
  const chosenType = classifyTask(type, description);

  if (isUnitedHealthClaimIntent(lower)) {
    const fields = [
      { key: "memberFullName", label: "Member full name", type: "text", required: true, question: "What is the member's full name?" },
      { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, sensitive: true, question: "What is the member's date of birth?" },
      { key: "contactEmail", label: "Email", type: "text", required: true, question: "What's the email you used for your UnitedHealthcare member account?" },
      { key: "uhcMemberId", label: "UHC member ID", type: "text", required: true, sensitive: true, question: "What is the UHC member ID?" },
      { key: "claimId", label: "Claim ID", type: "text", required: true, sensitive: true, question: "What is the claim ID?" },
      { key: "dateOfService", label: "Date of service", type: "date", required: true, question: "What was the date of service?" },
      { key: "providerName", label: "Provider or hospital name", type: "text", required: true, question: "What provider or hospital was this with?" },
      { key: "callStatus", label: "Call status", type: "generated", generated: true },
      { key: "scheduledCallTime", label: "Scheduled call time", type: "generated", generated: true }
    ];
    return {
      type: "health_claim",
      label: "UnitedHealthcare claim denial call",
      summary: "Call UnitedHealthcare about a denied claim or bill that was not covered.",
      uploadLabel: "Upload denial letter, bill, EOB, or claim screenshot (optional)",
      fields,
      values: makeValues(fields, {
        ...inferFieldValues({ fields, values: {} }, description),
        ...seedValues
      }),
      description,
      generatedAt: null,
      persona: "UHC_CLAIM_DENIAL"
    };
  }

  if (/(epic|epic pass|ski|snowboard|vail|breckenridge|keystone|park city)/.test(lower) && /(refund|medical|injur|sick|doctor|unused|couldn.?t use|could not use)/.test(lower)) {
    const fields = [
      { key: "merchantName", label: "Company", type: "text", required: true, question: "Which pass/company should I contact?" },
      { key: "passHolderName", label: "Pass holder name", type: "text", required: true, question: "What name is on the EPIC Pass account?" },
      { key: "epicAccountEmail", label: "EPIC account email", type: "text", required: true, sensitive: true, question: "What email is on the EPIC account?" },
      { key: "orderNumber", label: "Pass/order number", type: "text", required: false, sensitive: true, placeholder: "Optional but very useful" },
      { key: "resort", label: "Resort visited", type: "text", required: true, placeholder: "Vail, Breckenridge, Park City", question: "Which resort was this for?" },
      { key: "tripDates", label: "Trip dates", type: "text", required: true, placeholder: "Jan 12-13, 2026", question: "What were the skiing dates?" },
      { key: "usedDay", label: "Used ski day", type: "text", required: true, placeholder: "Day 1 used" },
      { key: "unusedDayDate", label: "Unused day to refund", type: "text", required: true, placeholder: "Day 2, Jan 13, 2026", question: "Which day could you not use?" },
      { key: "medicalIssueSummary", label: "Medical issue summary", type: "textarea", required: true, question: "What medical issue prevented you from skiing?" },
      { key: "doctorNoteAvailable", label: "Doctor note available", type: "select", options: ["Yes", "No", "Can get one"], required: true, question: "Do you have a doctor's note or medical documentation?" },
      { key: "refundAmount", label: "Requested refund amount", type: "money", required: false, placeholder: "If known" },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, placeholder: "Refund unused second day to original payment method", question: "What exact outcome should I ask EPIC for?" },
      { key: "uploadedMedicalProof", label: "Uploaded medical proof", type: "file-note", generated: true },
      { key: "refundPolicy", label: "EPIC policy/context research", type: "generated", generated: true },
      { key: "medicalExceptionArgument", label: "Medical exception argument", type: "generated", generated: true },
      { key: "refundRequestDraft", label: "Refund request message", type: "generated", generated: true },
      { key: "escalationRoute", label: "Escalation path", type: "generated", generated: true }
    ];
    return {
      type: "refund",
      label: "EPIC Pass medical refund",
      summary: "A medical-exception refund request for an unused ski day, with proof, policy framing, and escalation.",
      uploadLabel: "Upload doctor's note, receipt, pass confirmation, or trip proof",
      fields,
      values: makeValues(fields, {
        merchantName: "EPIC Pass",
        usedDay: "Day 1 used",
        desiredOutcome: "Refund the unused second day because a medical issue prevented skiing.",
        ...inferFieldValues({ fields, values: {} }, description),
        ...seedValues
      }),
      description,
      generatedAt: null,
      persona: "EPIC_PASS_MEDICAL_REFUND"
    };
  }

  if (/(geico|car insurance|auto insurance)/.test(lower) && /(cancel|switch|switched|end policy|stop)/.test(lower)) {
    const fields = [
      { key: "companyName", label: "Company", type: "text", required: true, question: "Which insurer are we canceling?" },
      { key: "subscriptionType", label: "Policy type", type: "text", required: true, question: "What kind of policy is it?" },
      { key: "policyNumber", label: "Policy number", type: "text", required: true, sensitive: true, question: "What is the GEICO policy number?" },
      { key: "vehicle", label: "Vehicle on policy", type: "text", required: true, placeholder: "2021 Toyota RAV4", question: "Which vehicle is on the policy?" },
      { key: "state", label: "Garaging state", type: "text", required: true, placeholder: "CA, NY, TX", question: "What state is the policy in?" },
      { key: "renewalDate", label: "Next renewal/payment date", type: "date", required: false },
      { key: "cancellationEffectiveDate", label: "Requested cancellation date", type: "date", required: true, question: "What effective cancellation date should we request?" },
      { key: "replacementCoverageDate", label: "New coverage start date", type: "date", required: true, question: "When does your replacement coverage start?" },
      { key: "lienholder", label: "Loan/lease holder", type: "text", required: false, placeholder: "Optional" },
      { key: "refundMailingAddress", label: "Refund mailing address", type: "textarea", required: false, sensitive: true },
      { key: "confirmationStatus", label: "Confirmation status", type: "select", options: ["Not requested", "Requested", "Confirmed", "Needs follow-up"], required: false },
      { key: "cancellationPolicy", label: "GEICO cancellation policy/context", type: "generated", generated: true },
      { key: "refundEligibility", label: "Premium refund eligibility", type: "generated", generated: true },
      { key: "cancellationEmailScript", label: "Cancellation message", type: "generated", generated: true },
      { key: "phoneScript", label: "Phone script", type: "generated", generated: true }
    ];
    return {
      type: "subscription",
      label: "GEICO auto policy cancellation",
      summary: "Cancel a GEICO car policy cleanly, confirm replacement coverage, and request any unused-premium refund.",
      uploadLabel: "Upload declarations page, new insurance card, or GEICO renewal notice",
      fields,
      values: makeValues(fields, {
        companyName: "GEICO",
        subscriptionType: "Auto insurance policy",
        confirmationStatus: "Not requested",
        ...inferFieldValues({ fields, values: {} }, description),
        ...seedValues
      }),
      description,
      generatedAt: null,
      persona: "GEICO_AUTO_CANCEL"
    };
  }

  if (/(medical bill|hospital bill|clinic bill|doctor bill|provider bill|itemized|eob|financial assistance)/.test(lower) && /(lower|negotiate|breakdown|itemized|bill)/.test(lower)) {
    const fields = [
      { key: "providerName", label: "Provider or hospital", type: "text", required: true, question: "Which provider or hospital sent the bill?" },
      { key: "patientName", label: "Patient name", type: "text", required: true, sensitive: true, question: "Whose name is on the bill?" },
      { key: "accountNumber", label: "Account or bill number", type: "text", required: false, sensitive: true, placeholder: "Optional" },
      { key: "serviceDate", label: "Service date", type: "date", required: true, question: "What was the service date?" },
      { key: "planType", label: "Service/visit type", type: "text", required: true, placeholder: "ER visit, imaging, lab work", question: "What was the visit or service type?" },
      { key: "currentMonthlyBill", label: "Total bill amount", type: "money", required: true, question: "What amount are they asking you to pay?" },
      { key: "insuranceStatus", label: "Insurance status", type: "select", options: ["Insurance processed", "Insurance pending", "No insurance", "Out of network", "Not sure"], required: true, question: "Has insurance processed it yet?" },
      { key: "eobStatus", label: "EOB received", type: "select", options: ["Yes", "No", "Not sure"], required: true, question: "Do you have an Explanation of Benefits?" },
      { key: "itemizedBillNeeded", label: "Need itemized breakdown", type: "select", options: ["Yes", "Already have it", "Not sure"], required: true },
      { key: "financialHardship", label: "Financial hardship context", type: "textarea", required: false, sensitive: true, placeholder: "Optional income, hardship, payment constraints" },
      { key: "desiredOutcome", label: "Desired outcome", type: "textarea", required: true, placeholder: "Itemized bill, coding review, charity care, 40% reduction, payment plan", question: "What outcome should I push for?" },
      { key: "competitorPrices", label: "Fair-price/context research", type: "generated", generated: true },
      { key: "suggestedNegotiationScript", label: "Phone negotiation script", type: "generated", generated: true },
      { key: "estimatedSavings", label: "Estimated reduction target", type: "generated", generated: true },
      { key: "itemizedBreakdownRequest", label: "Itemized breakdown request", type: "generated", generated: true }
    ];
    return {
      type: "bill",
      label: "Medical bill negotiation",
      summary: "Ask for an itemized breakdown, insurance/coding review, financial assistance, and a negotiated reduction by phone.",
      uploadLabel: "Upload bill, EOB, insurance card, or provider letter",
      fields,
      values: makeValues(fields, {
        itemizedBillNeeded: "Yes",
        desiredOutcome: "Get an itemized breakdown, verify insurance/coding, and negotiate a lower balance or payment plan.",
        ...inferFieldValues({ fields, values: {} }, description),
        ...seedValues
      }),
      description,
      generatedAt: null,
      persona: "MEDICAL_BILL_NEGOTIATION"
    };
  }

  const dashboard = createDashboard(chosenType, description);
  dashboard.values = { ...dashboard.values, ...inferFieldValues(dashboard, description), ...seedValues };
  return dashboard;
}

function classifyTask(taskType, text) {
  if (taskType && TASK_TYPES[taskType]) return taskType;
  const lower = `${taskType || ""} ${text || ""}`.toLowerCase();
  if (isUnitedHealthClaimIntent(lower)) return "general";
  if (/(epic|refund|return|chargeback|money back|reimburse|unused day|medical issue)/.test(lower)) return "refund";
  if (/(medical bill|hospital bill|clinic bill|doctor bill|itemized|eob|financial assistance)/.test(lower)) return "bill";
  if (/(bill|negotiate|lower|internet|phone|utility|premium)/.test(lower)) return "bill";
  if (/(cancel|subscription|membership|renewal)/.test(lower)) return "subscription";
  if (/(complaint|complain|escalate|bad service|formal)/.test(lower)) return "complaint";
  if (/(parking|ticket|citation|fine)/.test(lower)) return "parking";
  if (/(appointment|book|schedule|reservation)/.test(lower)) return "appointment";
  if (/(flight|airline|hotel|travel|trip|booking|baggage|delay)/.test(lower)) return "travel";
  return "general";
}

function createTitle(type, body) {
  const template = TASK_TYPES[type] || TASK_TYPES.general;
  const clean = (body || "").trim().replace(/\s+/g, " ");
  if (type === "health_claim") return "UnitedHealthcare denied claim call";
  if (clean.length > 4) return clean.length > 62 ? `${clean.slice(0, 59)}...` : clean;
  return template.label;
}

function normalizedIntentText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactIntentText(text) {
  return normalizedIntentText(text).replace(/\s+/g, "");
}

function isUnitedHealthClaimIntent(text) {
  const normalized = normalizedIntentText(text);
  const compact = compactIntentText(text);
  if (/\b(uhc demo|uhc claim|callrunner uhc|unitedhealth demo|united healthcare demo)\b/.test(normalized)) return true;
  const companyHit = /\buhc\b|\bu h c\b/.test(normalized)
    || /\bunited\b/.test(normalized)
    || /(united|untied|unitd|unietd|unitehd|unirted|unoted|unoithed|unitred).*(health|helath|hearlth|heath|halth|healthcare|halthcare|insur|insuran|insurance)/.test(normalized)
    || /(health|helath|hearlth|heath|halth|healthcare|insur|insurance).*(united|untied|unitd|unietd|unitehd|unirted|unoted|unoithed|unitred)/.test(normalized)
    || /(unitedhealth|unoithedhealth|unitredhealth|unitehdhealth|unitehdhearlth|unitedhelath|unitedheath|unitedhealthcare|unitedhalthcare|untiedhealth|untiedhealthcare|unirtedhealth|unotedhealth|uhc)/.test(compact);
  const claimHit = /(claim|clami|cliam|rejected|rjected|reject|rejects|rejets|denied|deneid|deny|denial|not covered|not coverd|not covred|bill not|bill wasn|bill wasnt|eob|underpaid|under paid|coverage|cover)/.test(normalized)
    || /(claim|clami|cliam|rejected|rjected|reject|rejets|denied|deneid|denial|notcovered|notcoverd|notcovred|billnot|underpaid|eob)/.test(compact);
  return companyHit && claimHit;
}

function isCancelCallIntent(message) {
  const normalized = normalizedIntentText(message);
  const compact = compactIntentText(message);
  return /(cancel|cancell|cance|calncel|canel|cnacel|cancl|stop|call off|dont call|don t call|remove)/.test(normalized)
    || /(cancel|cancell|cance|calncel|canel|cnacel|cancl|stop|calloff|dontcall|remove)/.test(compact);
}

function healthClaimScheduleMessage() {
  return [
    "UnitedHealthcare Member Services 866-801-4409 is closed right now. It opens tomorrow, May 29, 2026, at 8:00 a.m. EST.",
    "",
    "I scheduled the call for Friday, May 29, 2026 at 8:00 a.m. EST / 5:00 a.m. PST.",
    "",
    "I'll let you know when the call is done. You can check the status from this chat."
  ].join("\n");
}

function getRequestForUser(requestId, user) {
  const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId);
  if (!row) return null;
  if (user.role !== "admin" && row.user_id !== user.id) return null;
  return hydrateRequest(row);
}

function hydrateRequest(row) {
  const files = db.prepare("SELECT id, original_name, mime_type, size, created_at FROM uploaded_files WHERE request_id = ? ORDER BY created_at DESC").all(row.id);
  const messages = db.prepare("SELECT id, sender, body, meta_json, created_at FROM ai_messages WHERE request_id = ? ORDER BY created_at ASC").all(row.id)
    .map((message) => ({ ...message, meta: parseJson(message.meta_json, {}) }));
  const events = db.prepare("SELECT id, status, note, created_at FROM status_events WHERE request_id = ? ORDER BY created_at ASC").all(row.id);
  const user = db.prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?").get(row.user_id);
  return {
    id: row.id,
    userId: row.user_id,
    user: publicUser(user),
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    dashboard: parseJson(row.dashboard_json, {}),
    research: parseJson(row.research_json, null),
    plan: parseJson(row.plan_json, null),
    artifacts: parseJson(row.artifacts_json, null),
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    files,
    messages,
    events
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function summarizeRequest(row) {
  const hydrated = hydrateRequest(row);
  return {
    id: hydrated.id,
    title: hydrated.title,
    type: hydrated.type,
    typeLabel: hydrated.dashboard.label,
    status: hydrated.status,
    user: hydrated.user,
    createdAt: hydrated.createdAt,
    updatedAt: hydrated.updatedAt,
    missingCount: getMissingFields(hydrated.dashboard, hydrated.files).length
  };
}

function getMissingFields(dashboard, files) {
  const uploadedCount = files ? files.length : 0;
  return (dashboard.fields || []).filter((field) => {
    if (field.generated || field.type === "generated" || field.type === "file-note") return false;
    const value = dashboard.values?.[field.key];
    const empty = value === undefined || value === null || String(value).trim() === "";
    if (!field.required) return false;
    return empty;
  }).map((field) => ({ key: field.key, label: field.label, question: field.question || `What is the ${field.label.toLowerCase()}?` }));
}

function composeFollowup(dashboard, files) {
  const missing = getMissingFields(dashboard, files);
  if (missing.length === 0) {
    return [
      "I checked what this kind of company usually asks for and you gave me enough to build the working file.",
      "",
      "Next I’ll prep the exact message, phone script, and follow-up checklist. I won’t mark anything done unless there is proof or you confirm it."
    ].join("\n");
  }
  const questions = missing.slice(0, 4).map((field) => `- ${field.question}`).join("\n");
  return [
    "I read your request, did a quick requirements check, and started a working file for it.",
    "",
    "I only need the details that customer service will probably ask for. Fill these in and I’ll keep going:",
    questions
  ].join("\n");
}

function addMessage(requestId, sender, body, meta = {}) {
  db.prepare(`
    INSERT INTO ai_messages (id, request_id, sender, body, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id("msg"), requestId, sender, body, JSON.stringify(meta), now());
}

function addStatusEvent(requestId, status, note) {
  db.prepare(`
    INSERT INTO status_events (id, request_id, status, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id("evt"), requestId, status, note, now());
}

function setRequestStatus(requestId, status, note) {
  if (!STATUSES.includes(status)) throw httpError(400, "Unsupported status.");
  const current = db.prepare("SELECT status FROM requests WHERE id = ?").get(requestId);
  if (!current) throw httpError(404, "Request not found.");
  db.prepare("UPDATE requests SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), requestId);
  if (current.status !== status) addStatusEvent(requestId, status, note || `Status changed to ${status}.`);
}

function updateDashboard(requestId, dashboard) {
  db.prepare("UPDATE requests SET dashboard_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(dashboard), now(), requestId);
}

function generateResearchPlanAndArtifacts(requestRecord) {
  const dashboard = requestRecord.dashboard;
  const values = dashboard.values || {};
  const type = requestRecord.type;
  const company = firstFilled(values, [
    "providerName",
    "companyName",
    "merchantName",
    "cityAgency",
    "travelCompany"
  ]) || "the company";
  const amount = firstFilled(values, ["currentMonthlyBill", "refundAmount", "fineAmount"]) || "";
  const date = firstFilled(values, ["renewalDate", "purchaseDate", "violationDate", "tripDate"]) || "";
  const mockSource = "MVP simulated research based on common consumer-support policies and escalation patterns.";

  const research = {
    company,
    generatedAt: now(),
    sourceNote: mockSource,
    findings: [],
    assumptions: [],
    riskLevel: "Medium"
  };
  const plan = {
    generatedAt: now(),
    recommendedOutcome: "",
    steps: [],
    proofNeeded: [],
    approvalNote: "The app will not claim this is completed until you confirm the result or upload proof."
  };
  const artifacts = {
    generatedAt: now(),
    emailSubject: "",
    emailBody: "",
    callScript: "",
    checklist: []
  };

  if (type === "bill") {
    const current = Number(String(values.currentMonthlyBill || "0").replace(/[^0-9.]/g, ""));
    const target = current ? Math.max(35, Math.round(current * 0.72)) : 95;
    research.findings = [
      `Retention teams often have promotional, loyalty, autopay, and plan-rightsizing options that are not visible in the account portal.`,
      `Comparable providers in many US markets advertise starter internet or wireless plans below the current ${formatMoney(current || amount)} monthly bill.`,
      `Best leverage: ask for a loyalty review, cite competitor pricing, and be ready to downgrade extras you do not use.`
    ];
    research.assumptions = ["Competitor pricing should be checked against the exact service address before sending."];
    plan.recommendedOutcome = `Ask ${company} to reduce the bill to about ${formatMoney(target)}/month or apply a 12-month loyalty credit.`;
    plan.steps = [
      step("Verify the bill", "Confirm the current plan, total monthly cost, promo expiration, fees, and any contract terms.", "Waiting for user"),
      step("Use competitor leverage", "Open with a direct comparison and ask the retention team to match or beat the best available option.", "Ready"),
      step("Request a written confirmation", "Before accepting, ask for the new monthly total, duration, taxes/fees, and contract impact in writing.", "Ready")
    ];
    plan.proofNeeded = ["Recent bill", "Account number or service address", "Screenshot of competitor offer if available"];
    artifacts.emailSubject = `Request to lower ${company} monthly bill`;
    artifacts.emailBody = `Hello ${company} support,\n\nMy current monthly bill is ${formatMoney(current || amount)} for ${values.planType || "my current plan"}. I would like a loyalty review because the price is no longer competitive. My goal is ${values.desiredOutcome || `to reduce the bill to around ${formatMoney(target)}/month`}.\n\nPlease review available loyalty credits, plan adjustments, or current promotions that can lower the total monthly cost without reducing essential service quality. Before I agree to any change, please confirm the final monthly total, duration, fees, and whether there is any contract impact.\n\nThank you.`;
    artifacts.callScript = `I am calling about my ${company} bill. My current total is ${formatMoney(current || amount)} for ${values.planType || "my plan"}. I am reviewing lower-priced alternatives and would prefer to stay if you can bring the monthly total closer to ${formatMoney(target)}. Can you check retention, loyalty, and current promotional offers?`;
    artifacts.checklist = ["Upload the latest bill", "Confirm whether autopay/paperless discounts are active", "Ask for written confirmation before accepting"];
    dashboard.values.competitorPrices = `Mock scan: comparable plans commonly appear in the ${formatMoney(Math.max(35, target - 18))}-${formatMoney(target + 12)}/month range before equipment, taxes, and local fees. Verify by address before using as proof.`;
    dashboard.values.suggestedNegotiationScript = artifacts.callScript;
    dashboard.values.estimatedSavings = current ? `${formatMoney(current - target)}/month, about ${formatMoney((current - target) * 12)}/year if accepted.` : "Estimate available after confirming the current bill.";
    if (dashboard.persona === "MEDICAL_BILL_NEGOTIATION") {
      const reductionTarget = current ? Math.round(current * 0.6) : 0;
      research.findings = [
        `Medical billing negotiations should start with an itemized bill, coding review, and insurance/EOB reconciliation before negotiating dollars.`,
        `Useful pressure points: prompt-pay discount, charity care/financial assistance, hardship review, self-pay adjustment, and no-interest payment plan.`,
        `The phone agent should avoid accepting responsibility for the full balance until the provider confirms itemization, coding, insurance posting, and assistance screening.`
      ];
      plan.recommendedOutcome = `Ask ${company} for an itemized breakdown, coding/insurance review, financial assistance screening, and a reduced balance target around ${formatMoney(reductionTarget)} if appropriate.`;
      plan.steps = [
        step("Request itemized breakdown", "Ask billing to pause collections while they send line-item charges, CPT/revenue codes, insurance adjustments, and patient responsibility.", "Ready"),
        step("Run billing review call", "Call the billing office using the script, confirm EOB posting, ask for coding review, and request discount/assistance options.", "Ready"),
        step("Negotiate written outcome", "If they offer a reduction or payment plan, ask for the final balance, terms, and collections hold in writing.", "Ready")
      ];
      plan.proofNeeded = ["Medical bill", "Explanation of Benefits", "Insurance card", "Income/financial assistance documents if using hardship review"];
      artifacts.emailSubject = `Request for itemized bill and billing review`;
      artifacts.emailBody = `Hello ${company} billing team,\n\nI am requesting an itemized breakdown and billing review for account ${values.accountNumber || "[account number]"} for ${values.planType || "medical services"} on ${values.serviceDate || "[service date]"}.\n\nPlease send line-item charges, billing codes, insurance adjustments, and the current patient responsibility. I also want to be screened for financial assistance, prompt-pay discounts, and any available balance reduction or no-interest payment plan.\n\nPlease pause collections while this review is open and confirm the response in writing.\n\nThank you.`;
      artifacts.callScript = `I am calling about a medical bill from ${company}. Before discussing payment, I need an itemized bill with codes and insurance adjustments, confirmation that the EOB was posted correctly, and a review for financial assistance or prompt-pay discount. The current balance I see is ${formatMoney(current)}. Can you pause collections during review and tell me what reduction or payment-plan options are available?`;
      artifacts.checklist = ["Upload bill and EOB", "Ask for itemized charges and codes", "Request collections hold", "Ask for charity care/financial assistance", "Get any agreement in writing"];
      dashboard.values.competitorPrices = "Fair-price context will focus on billing code review, insurance/EOB reconciliation, charity care, prompt-pay discount, and payment-plan leverage rather than competitor shopping.";
      dashboard.values.suggestedNegotiationScript = artifacts.callScript;
      dashboard.values.estimatedSavings = current ? `Negotiation target: reduce from ${formatMoney(current)} toward ${formatMoney(reductionTarget)} or secure financial assistance/payment plan.` : "Estimate available after bill amount is confirmed.";
      dashboard.values.itemizedBreakdownRequest = artifacts.emailBody;
    }
  }

  if (type === "subscription") {
    research.findings = [
      `${company} cancellation usually requires confirmation inside the account portal, by support chat, or by email.`,
      `Refund eligibility is strongest when the renewal was recent, the service has not been used since renewal, or local law gives a cooling-off period.`,
      `Keep proof: cancellation confirmation number, timestamp, agent name, and final access date.`
    ];
    plan.recommendedOutcome = `Cancel ${values.subscriptionType || "the subscription"} and request a refund if the renewal is recent or service was unused.`;
    plan.steps = [
      step("Capture account state", "Screenshot subscription status, renewal date, and current plan before canceling.", "Waiting for user"),
      step("Send cancellation request", "Use the generated message or portal flow and request written confirmation.", "Ready"),
      step("Follow up on refund", "If refund is denied, ask for the specific policy clause and escalation route.", "Ready")
    ];
    plan.proofNeeded = ["Renewal notice", "Last invoice", "Any cancellation confirmation"];
    artifacts.emailSubject = `Cancel subscription and confirm account closure`;
    artifacts.emailBody = `Hello ${company} support,\n\nPlease cancel my ${values.subscriptionType || "subscription"} effective immediately and confirm in writing that no further charges will be made. The renewal date I have is ${date || "listed on my account"}.\n\nIf a recent renewal charge is eligible for refund, please process it or send the exact policy language used to deny the refund.\n\nThank you.`;
    artifacts.callScript = `I want to cancel my ${values.subscriptionType || "subscription"} with ${company}. Please confirm the cancellation date, whether any refund applies, and that no additional charges will be made.`;
    artifacts.checklist = ["Screenshot subscription page", "Save confirmation email", "Set calendar follow-up before the next billing date"];
    dashboard.values.cancellationPolicy = "Mock research: cancellation commonly requires portal confirmation or written support confirmation. Ask for the exact effective date and final charge status.";
    dashboard.values.refundEligibility = "Likely stronger if renewal occurred recently, the service was unused after renewal, or the company advertised a satisfaction guarantee.";
    dashboard.values.cancellationEmailScript = artifacts.emailBody;
    if (!dashboard.values.confirmationStatus) dashboard.values.confirmationStatus = "Not requested";
    if (dashboard.persona === "GEICO_AUTO_CANCEL") {
      research.findings = [
        `Auto insurance cancellation should confirm the effective date and avoid any lapse between old and replacement coverage.`,
        `Unused premium refunds usually depend on paid-through date, billing method, and state/policy terms.`,
        `If a vehicle has a lien or lease, the lienholder may need updated proof of replacement coverage.`
      ];
      plan.recommendedOutcome = `Cancel the GEICO auto policy effective ${values.cancellationEffectiveDate || values.replacementCoverageDate || "the requested date"} and request confirmation plus any unused-premium refund.`;
      plan.steps = [
        step("Verify replacement coverage", "Confirm the new policy starts before or on the GEICO cancellation date.", "Waiting for user"),
        step("Submit cancellation request", "Send the cancellation message or call GEICO with policy number, vehicle, state, and effective date.", "Ready"),
        step("Capture confirmation", "Ask for confirmation number, final bill/refund amount, and whether lienholder notice is needed.", "Ready")
      ];
      plan.proofNeeded = ["GEICO policy number", "New insurance card/declarations page", "Vehicle details", "Cancellation effective date"];
      artifacts.emailSubject = `Cancel GEICO auto policy effective ${values.cancellationEffectiveDate || ""}`;
      artifacts.emailBody = `Hello GEICO,\n\nPlease cancel my auto insurance policy ${values.policyNumber || "[policy number]"} for ${values.vehicle || "[vehicle]"} effective ${values.cancellationEffectiveDate || "[date]"}.\n\nMy replacement coverage starts ${values.replacementCoverageDate || "[replacement coverage date]"}, so please confirm there will be no coverage lapse. Please also confirm any unused-premium refund, final balance, and whether any lienholder notice is required.\n\nPlease send written confirmation of the cancellation effective date and confirmation number.\n\nThank you.`;
      artifacts.callScript = `I am calling to cancel my GEICO auto policy ${values.policyNumber || "[policy number]"} for ${values.vehicle || "[vehicle]"}. I need cancellation effective ${values.cancellationEffectiveDate || "[date]"}, replacement coverage starts ${values.replacementCoverageDate || "[date]"}, and I need written confirmation plus any unused-premium refund details.`;
      artifacts.checklist = ["Upload new insurance card", "Confirm no lapse", "Ask for cancellation confirmation number", "Ask about refund/final balance", "Notify lienholder if needed"];
      dashboard.values.cancellationPolicy = "GEICO cancellation context: confirm effective date, no coverage gap, final balance/refund, and written proof. State and policy terms control exact refund handling.";
      dashboard.values.refundEligibility = "Unused premium refund may be available if the policy is prepaid beyond the cancellation effective date.";
      dashboard.values.cancellationEmailScript = artifacts.emailBody;
      dashboard.values.phoneScript = artifacts.callScript;
    }
  }

  if (type === "refund") {
    research.findings = [
      `Refund requests are strongest when they name the amount, date, order/reference number, and specific failure.`,
      `If normal support denies the request, the next useful escalation is a written supervisor review with policy language requested.`,
      `For card payments, chargeback windows can be time-limited, so preserve proof and act quickly.`
    ];
    plan.recommendedOutcome = `Request a ${formatMoney(amount)} refund from ${company}.`;
    plan.steps = [
      step("Assemble proof", "Attach receipt, screenshots, delivery/service evidence, and prior support messages.", "Waiting for user"),
      step("Send concise refund request", "State the amount, reason, and requested deadline for response.", "Ready"),
      step("Escalate if denied", "Ask for supervisor review and preserve denial language for payment dispute options.", "Ready")
    ];
    plan.proofNeeded = ["Receipt", "Order number", "Screenshots showing the problem"];
    artifacts.emailSubject = `Refund request for ${values.orderNumber || "recent purchase"}`;
    artifacts.emailBody = `Hello ${company} support,\n\nI am requesting a refund of ${formatMoney(amount)} for ${values.orderNumber ? `order ${values.orderNumber}` : "my purchase"} made on ${date || "the purchase date on my receipt"}.\n\nReason: ${values.refundReason || "The product/service did not match what was promised."}\n\nPlease process the refund to the original payment method or provide the exact policy basis for any denial. I have attached supporting documentation.\n\nThank you.`;
    artifacts.callScript = `I am calling to request a refund of ${formatMoney(amount)} from ${company}. The issue is: ${values.refundReason || "the purchase problem documented in my account"}. Can you process that today or escalate to a supervisor?`;
    artifacts.checklist = ["Upload receipt", "Attach problem screenshots", "Ask for response within 5 business days"];
    dashboard.values.refundPolicy = "Mock research: refund leverage improves with prompt notice, clear proof, unused/defective service, or mismatch between promise and delivery.";
    dashboard.values.refundRequestDraft = artifacts.emailBody;
    dashboard.values.escalationRoute = "If denied, request supervisor review, then consider payment-card dispute, platform marketplace support, or regulator complaint depending on the merchant.";
    if (dashboard.persona === "EPIC_PASS_MEDICAL_REFUND") {
      research.findings = [
        `The strongest EPIC Pass medical refund case is framed as an exception request for an unused ski day with medical documentation, not as a generic dissatisfaction claim.`,
        `Useful evidence: pass/order confirmation, trip dates, lift/resort usage record if available, doctor's note, and a short timeline showing day 1 used and day 2 unusable.`,
        `The request should ask for a one-time medical exception, refund/credit for the unused day, and the exact policy basis if denied.`
      ];
      plan.recommendedOutcome = `Ask EPIC Pass for a medical-exception refund or credit for the unused second ski day at ${values.resort || "the resort"}.`;
      plan.steps = [
        step("Package proof", "Attach doctor's note, pass/order confirmation, trip dates, and any resort/lift usage proof.", "Waiting for user"),
        step("Send medical exception request", "Use the drafted message to request refund/credit for the unused day and ask for written review.", "Ready"),
        step("Escalate if denied", "Ask for supervisor review, policy language, and whether a partial credit or account credit is available.", "Ready")
      ];
      plan.proofNeeded = ["Doctor's note", "EPIC Pass/order confirmation", "Trip dates", "Proof day 2 was unused"];
      artifacts.emailSubject = `Medical exception refund request for unused EPIC Pass day`;
      artifacts.emailBody = `Hello EPIC Pass support,\n\nI am requesting a medical-exception refund or credit for an unused ski day.\n\nPass holder: ${values.passHolderName || "[name]"}\nAccount email: ${values.epicAccountEmail || "[email]"}\nPass/order number: ${values.orderNumber || "[order number if available]"}\nResort: ${values.resort || "[resort]"}\nTrip dates: ${values.tripDates || "[trip dates]"}\nUnused day: ${values.unusedDayDate || "[unused day]"}\n\nI used ${values.usedDay || "the first ski day"}, then a medical issue prevented me from skiing the remaining day. Summary: ${values.medicalIssueSummary || "medical documentation attached"}.\n\nI have medical documentation available and can provide the doctor's note, pass confirmation, and trip proof. Please review this as a one-time medical exception and refund or credit the unused day. If denied, please provide the exact policy basis and escalation path for medical exception review.\n\nThank you.`;
      artifacts.callScript = `I am calling about an EPIC Pass medical-exception refund. I used day 1 at ${values.resort || "the resort"} but could not use ${values.unusedDayDate || "day 2"} because of a medical issue. I have a doctor's note. Can you open a medical exception review for a refund or credit for the unused day and give me the case number?`;
      artifacts.checklist = ["Upload doctor's note", "Upload EPIC receipt/order confirmation", "Confirm pass holder email", "Ask for case number", "Ask for exact denial basis if refused"];
      dashboard.values.uploadedMedicalProof = `${requestRecord.files.length} file(s) uploaded.`;
      dashboard.values.refundPolicy = "Simulated policy research: frame as a documented medical exception for an unused day; exact terms depend on EPIC Pass product, coverage, purchase terms, and support review.";
      dashboard.values.medicalExceptionArgument = `Medical-exception argument: ${values.passHolderName || "the pass holder"} used the first day but could not use ${values.unusedDayDate || "the second day"} due to a documented medical issue. Request a refund or credit only for the unused day, with doctor's note and trip proof attached.`;
      dashboard.values.refundRequestDraft = artifacts.emailBody;
      dashboard.values.escalationRoute = "If support denies it, ask for supervisor review, exact policy language, whether Epic Coverage applies, and whether a partial account credit can be granted.";
    }
  }

  if (type === "complaint") {
    research.findings = [
      `Formal complaints work best when they separate facts, impact, requested resolution, and deadline.`,
      `Escalation should move from frontline support to executive/customer relations, regulator, marketplace, or payment provider depending on the issue.`,
      `A calm record with dates and reference numbers is more effective than a long narrative.`
    ];
    plan.recommendedOutcome = values.desiredResolution || `Resolve the issue with ${company}.`;
    plan.steps = [
      step("Create a fact timeline", "List dates, contacts, reference numbers, and what each party said.", "Waiting for user"),
      step("Send formal complaint", "Use the generated letter with a clear deadline and requested resolution.", "Ready"),
      step("Escalate with proof", "If no response, send the same packet to the appropriate escalation channel.", "Ready")
    ];
    plan.proofNeeded = ["Screenshots", "Receipts/contracts", "Prior emails or chat transcripts"];
    artifacts.emailSubject = `Formal complaint and request for resolution`;
    artifacts.emailBody = `Hello ${company} team,\n\nI am filing a formal complaint about the following issue:\n\n${values.issueSummary || "Issue summary"}\n\nRequested resolution:\n${values.desiredResolution || "Please provide a practical resolution."}\n\nRelevant dates/contact history:\n${values.incidentDates || values.contactHistory || "See attached documentation."}\n\nPlease respond with a resolution or escalation path within 7 business days.\n\nThank you.`;
    artifacts.callScript = `I am following up on a formal complaint. The issue is: ${values.issueSummary || "the documented issue"}. I am requesting: ${values.desiredResolution || "a clear resolution"}. Can you provide a reference number and escalation contact?`;
    artifacts.checklist = ["Upload evidence", "Keep complaint under one page", "Set follow-up date"];
    dashboard.values.complaintPolicy = "Mock research: complaint handling typically requires a concise fact timeline, documentation, and a specific resolution ask.";
    dashboard.values.complaintDraft = artifacts.emailBody;
    dashboard.values.escalationPath = "Start with customer relations. If unresolved, escalate to executive support, marketplace/payment provider, regulator, or consumer protection office depending on the sector.";
  }

  if (type === "parking") {
    research.findings = [
      `Ticket disputes are deadline-sensitive and usually require submitting evidence through the issuing agency portal or by mail.`,
      `Strong arguments cite broken/obscured signage, payment proof, emergency circumstances, wrong vehicle/location/time, or agency error.`,
      `Paying the ticket may waive dispute rights in some jurisdictions, so check the agency wording before payment.`
    ];
    plan.recommendedOutcome = `Dispute ticket ${values.ticketNumber || ""} and request dismissal or reduction.`;
    plan.steps = [
      step("Confirm deadline", "Use the ticket issue date and agency rules to identify the dispute window.", "Waiting for user"),
      step("Prepare evidence packet", "Attach ticket image, location photos, meter/app receipt, and a short timeline.", "Ready"),
      step("Submit dispute", "Use the agency portal or mail method and save proof of submission.", "Ready")
    ];
    plan.proofNeeded = ["Ticket photo", "Sign/meter photos", "Payment proof", "Map/location evidence"];
    artifacts.emailSubject = `Parking ticket dispute ${values.ticketNumber || ""}`;
    artifacts.emailBody = `To whom it may concern,\n\nI am disputing parking ticket ${values.ticketNumber || ""} issued by ${company} on ${date || "the listed violation date"} for ${formatMoney(amount)}.\n\nReason for dispute:\n${values.disputeReason || "See attached evidence."}\n\nI request dismissal or reduction based on the attached evidence. Please confirm receipt of this dispute and any next hearing or review date.\n\nThank you.`;
    artifacts.callScript = `I am calling about ticket ${values.ticketNumber || ""}. I want to confirm the dispute deadline, accepted evidence formats, and whether payment would waive my dispute rights.`;
    artifacts.checklist = ["Photograph ticket front/back", "Upload sign or meter photos", "Submit before deadline", "Save portal confirmation"];
    dashboard.values.filingDeadline = "Mock research: many agencies require disputes within 21-30 days of ticket issuance, but the ticket or agency portal controls.";
    dashboard.values.disputeArgument = artifacts.emailBody;
    dashboard.values.submissionChecklist = artifacts.checklist.join("\n");
  }

  if (type === "appointment") {
    research.findings = [
      `Appointments are easiest to book when the request includes service type, date windows, location, account/insurance requirements, and callback availability.`,
      `If the first slot is too late, ask for cancellation lists, alternate locations, telehealth/remote options, or escalation for urgent needs.`,
      `Confirm cancellation policy, documents to bring, and any pre-visit forms.`
    ];
    plan.recommendedOutcome = `Book ${values.appointmentType || "the appointment"} with ${company}.`;
    plan.steps = [
      step("Confirm constraints", "Use the availability window and location preference to limit acceptable times.", "Waiting for user"),
      step("Contact scheduler", "Use the generated script and ask about cancellations or alternate locations if needed.", "Ready"),
      step("Confirm details", "Record date, time, location, prep instructions, fees, and cancellation policy.", "Ready")
    ];
    plan.proofNeeded = ["Referral or account info if required", "Insurance card if applicable", "Calendar availability"];
    artifacts.emailSubject = `Appointment request: ${values.appointmentType || "Scheduling"}`;
    artifacts.emailBody = `Hello ${company},\n\nI would like to book ${values.appointmentType || "an appointment"}. My available windows are:\n${values.dateWindow || "Please send available times."}\n\nLocation preference: ${values.locationPreference || "Flexible"}\nConstraints: ${values.constraints || "None listed"}\n\nPlease confirm the soonest available appointment, any documents needed, fees, and cancellation policy.\n\nThank you.`;
    artifacts.callScript = `I would like to schedule ${values.appointmentType || "an appointment"} with ${company}. My available times are ${values.dateWindow || "flexible"}. Do you have anything in that window, and is there a cancellation list or alternate location if not?`;
    artifacts.checklist = ["Confirm date/time/location", "Ask what to bring", "Ask about cancellation policy", "Save confirmation"];
    dashboard.values.bookingScript = artifacts.callScript;
    dashboard.values.bookingChecklist = artifacts.checklist.join("\n");
  }

  if (type === "travel") {
    research.findings = [
      `Travel claims should include booking number, trip date, exact disruption, receipts, and requested compensation/refund.`,
      `Airline, hotel, and booking-platform policies differ; the strongest request cites the policy category and keeps receipts itemized.`,
      `If the company denies compensation, request the specific policy basis and escalate through the booking platform, card issuer, or regulator where appropriate.`
    ];
    plan.recommendedOutcome = `Request compensation or refund from ${company} for the ${values.problemType || "travel"} issue.`;
    plan.steps = [
      step("Attach travel proof", "Upload receipt, itinerary, boarding pass, hotel folio, screenshots, and expense receipts.", "Waiting for user"),
      step("Send policy-backed claim", "Use the generated message with booking number, date, issue, and requested amount/remedy.", "Ready"),
      step("Escalate if denied", "Ask for policy language and preserve denial for regulator, platform, or card dispute review.", "Ready")
    ];
    plan.proofNeeded = ["Booking confirmation", "Receipts", "Screenshots of delay/cancellation or charges"];
    artifacts.emailSubject = `Compensation request for booking ${values.bookingNumber || ""}`;
    artifacts.emailBody = `Hello ${company} support,\n\nI am requesting compensation/refund for booking ${values.bookingNumber || ""} on ${date || "the trip date"}.\n\nProblem type: ${values.problemType || "Travel issue"}\nRequested resolution: reimbursement or appropriate compensation for the documented disruption and expenses.\n\nI have attached receipts/screenshots. Please process the request or send the exact policy reason if denied.\n\nThank you.`;
    artifacts.callScript = `I am calling about booking ${values.bookingNumber || ""} with ${company}. The issue was ${values.problemType || "a travel disruption"}. I have receipts and would like to submit a compensation or refund request. What is the fastest path and reference number?`;
    artifacts.checklist = ["Upload itinerary", "Upload receipts", "Keep claim concise", "Ask for case/reference number"];
    dashboard.values.uploadedReceipts = `${requestRecord.files.length} file(s) uploaded.`;
    dashboard.values.policyResearch = "Mock research: travel compensation depends on carrier/hotel policy, disruption reason, timing, and receipts. Ask the company to cite the exact policy if denied.";
    dashboard.values.compensationRequest = plan.recommendedOutcome;
    dashboard.values.draftMessage = artifacts.emailBody;
  }

  if (type === "general") {
    research.findings = [
      `General requests work best when the ask is specific, the authorization/account details are ready, and the next action is constrained to one channel.`,
      `The draft should include desired result, deadline, proof, and fallback escalation.`
    ];
    plan.recommendedOutcome = values.taskGoal || `Complete the requested task with ${company}.`;
    plan.steps = [
      step("Confirm authority and details", "Make sure account details and authorization are enough for the company to act.", "Waiting for user"),
      step("Use the best contact channel", "Send the generated message or use the call script depending on the user preference.", "Ready"),
      step("Record outcome", "Save the confirmation, reference number, and follow-up deadline.", "Ready")
    ];
    plan.proofNeeded = ["Relevant account details", "Any supporting screenshots or documents"];
    artifacts.emailSubject = `Request for assistance`;
    artifacts.emailBody = `Hello ${company},\n\nI need help with the following request:\n\n${values.taskGoal || requestRecord.description}\n\nRelevant details:\n${values.accountInfo || "See attached information."}\n\nPlease confirm the next step, timeline, and any reference number for this request.\n\nThank you.`;
    artifacts.callScript = `I am calling about this request: ${values.taskGoal || requestRecord.description}. Can you help complete it today or direct me to the correct department? Please provide a reference number.`;
    artifacts.checklist = ["Upload supporting files", "Confirm contact channel", "Save reference number"];
    dashboard.values.researchNotes = research.findings.join("\n");
    dashboard.values.callScript = artifacts.callScript;
    dashboard.values.emailDraft = artifacts.emailBody;
  }

  return { dashboard, research, plan, artifacts };
}

function firstFilled(values, keys) {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function step(title, detail, state) {
  return { title, detail, state };
}

function formatMoney(value) {
  const number = Number(String(value || "0").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return `$${Math.round(number).toLocaleString("en-US")}`;
}

function inferFieldValues(dashboard, text) {
  const lower = String(text || "").toLowerCase();
  const updates = {};
  const money = String(text || "").match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  const date = String(text || "").match(/\b(20[0-9]{2}-[0-9]{2}-[0-9]{2})\b/);

  if (/(epic|vail|breckenridge|keystone|park city|ski|snowboard)/.test(lower)) {
    updates.merchantName = "EPIC Pass";
    if (/vail/.test(lower)) updates.resort = "Vail";
    if (/breckenridge/.test(lower)) updates.resort = "Breckenridge";
    if (/keystone/.test(lower)) updates.resort = "Keystone";
    if (/park city/.test(lower)) updates.resort = "Park City";
    if (/doctor/.test(lower)) updates.doctorNoteAvailable = "Yes";
    if (/(medical|injur|sick|knee|ankle|illness|doctor)/.test(lower)) {
      updates.medicalIssueSummary = sentenceFor(text, /(medical|injur|sick|knee|ankle|illness|doctor)/i) || "A medical issue prevented use of the remaining ski day.";
      updates.refundReason = updates.medicalIssueSummary;
    }
    if (/(2-day|two day|2 day|second day|day 2)/.test(lower)) {
      updates.usedDay = "Day 1 used";
      updates.unusedDayDate = "Day 2 unused";
      updates.desiredOutcome = "Refund the unused second ski day because a medical issue prevented skiing.";
    }
    if (money) updates.refundAmount = money[1].replaceAll(",", "");
  }

  if (/(geico|car insurance|auto insurance)/.test(lower)) {
    updates.companyName = "GEICO";
    updates.subscriptionType = "Auto insurance policy";
    const policy = String(text || "").match(/policy(?: number| #| no\.?)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
    if (policy) updates.policyNumber = policy[1];
    const vehicle = String(text || "").match(/\b(20[0-9]{2}\s+[A-Za-z]+\s+[A-Za-z0-9-]+)\b/);
    if (vehicle) updates.vehicle = vehicle[1];
    const state = String(text || "").match(/\b(CA|NY|TX|FL|WA|OR|CO|IL|MA|NJ|PA|AZ|NV|VA|GA)\b/);
    if (state) updates.state = state[1];
    if (date) {
      updates.cancellationEffectiveDate = date[1];
      updates.replacementCoverageDate = date[1];
    }
    if (/switched|new carrier|replacement/.test(lower)) updates.replacementCoverageDate ||= date?.[1] || "";
  }

  if (/(medical bill|hospital bill|clinic bill|doctor bill|itemized|eob|financial assistance)/.test(lower)) {
    updates.itemizedBillNeeded = "Yes";
    updates.desiredOutcome ||= "Get an itemized breakdown, verify insurance/coding, and negotiate a lower balance or payment plan.";
    if (money) updates.currentMonthlyBill = money[1].replaceAll(",", "");
    if (/eob/.test(lower)) updates.eobStatus = "Yes";
    if (/insurance processed|processed by insurance/.test(lower)) updates.insuranceStatus = "Insurance processed";
    if (/insurance pending/.test(lower)) updates.insuranceStatus = "Insurance pending";
    if (/no insurance|uninsured/.test(lower)) updates.insuranceStatus = "No insurance";
    if (date) updates.serviceDate = date[1];
    const provider = String(text || "").match(/(?:from|provider is|hospital is|clinic is)\s+([A-Z][A-Za-z0-9 &'-]{2,40})/);
    if (provider) updates.providerName = provider[1].trim();
  }

  if (isUnitedHealthClaimIntent(lower)) {
    if (date) updates.dateOfService = date[1];
    const email = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (email) updates.contactEmail = email[0];
    const member = String(text || "").match(/member(?: id)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
    if (member) updates.uhcMemberId = member[1];
    const claim = String(text || "").match(/claim(?: id| number)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
    if (claim) updates.claimId = claim[1];
    const provider = String(text || "").match(/(?:provider|hospital|with|from)\s+([A-Z][A-Za-z0-9 &'.-]{2,50})/);
    if (provider) updates.providerName = provider[1].trim();
  }

  const allowedKeys = new Set((dashboard.fields || []).map((field) => field.key));
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.has(key) || updates[key] === "") {
      delete updates[key];
    }
  }
  return updates;
}

function sentenceFor(text, pattern) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => pattern.test(sentence))?.trim() || "";
}

function extractChatFieldUpdates(dashboard, text) {
  const updates = inferFieldValues(dashboard, text);
  const missing = getMissingFields(dashboard, []);
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const field of dashboard.fields || []) {
    if (field.generated) continue;
    for (const line of lines) {
      const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]+/g, "\\s*");
      const pattern = new RegExp(`^(?:${field.key}|${normalizedLabel})\\s*[:=-]\\s*(.+)$`, "i");
      const match = line.match(pattern);
      if (match) updates[field.key] = match[1].trim();
    }
  }
  if (Object.keys(updates).length === 0 && missing.length === 1 && text.trim().length < 220) {
    updates[missing[0].key] = text.trim();
  }
  return updates;
}

function createRequestFromChat(user, message) {
  const effectiveMessage = expandDemoPrompt(message);
  const type = classifyTask(null, effectiveMessage);
  const dashboard = createPersonalizedDashboard(type, effectiveMessage);
  const title = createTitle(dashboard.type, effectiveMessage);
  const requestId = id("req");
  const createdAt = now();
  const initialStatus = getMissingFields(dashboard, []).length ? "Waiting for user" : "Drafting";
  db.prepare(`
    INSERT INTO requests (id, user_id, type, title, description, status, dashboard_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(requestId, user.id, dashboard.type, title, effectiveMessage, initialStatus, JSON.stringify(dashboard), createdAt, createdAt);
  addStatusEvent(requestId, initialStatus, "Created from chat.");
  addMessage(requestId, "user", message, { kind: "chat" });
  if (dashboard.type !== "health_claim") {
    addMessage(requestId, "assistant", composeChatReply(getRequestForUser(requestId, user), Object.keys(inferFieldValues(dashboard, effectiveMessage)), effectiveMessage !== message), { kind: "followup" });
  }
  return getRequestForUser(requestId, user);
}

function expandDemoPrompt(message) {
  if (!/^\s*(demo|live demo|start demo|show demo|choose demo)\s*$/i.test(message)) return message;
  return "Live demo: cancel my GEICO car insurance because I switched carriers. The policy number is GEI-DEMO-2481, vehicle is 2021 Toyota RAV4, state CA, cancellation effective date is 2026-06-01, and replacement coverage starts 2026-06-01. Please make sure there is no lapse and ask for written confirmation plus any unused premium refund.";
}

function composeChatReply(requestRecord, updatedKeys = [], choseDemo = false) {
  const missing = getMissingFields(requestRecord.dashboard, requestRecord.files);
  const labels = updatedKeys
    .map((key) => requestRecord.dashboard.fields.find((field) => field.key === key)?.label || key)
    .filter(Boolean);
  const demoLine = choseDemo ? "I’ll use a GEICO cancellation as the live demo because it shows the full flow cleanly: policy details, cancellation date, replacement coverage, confirmation, and refund follow-up.\n\n" : "";
  const updatedLine = labels.length ? `I reviewed your message and filled the working file with: ${labels.join(", ")}.\n\n` : "";
  if (missing.length === 0) {
    return `${demoLine}${updatedLine}I have enough to proceed without guessing. Next I’ll research the company rules, draft the exact message, and prep the call script.`;
  }
  return `${demoLine}${updatedLine}${composeFollowup(requestRecord.dashboard, requestRecord.files)}`;
}

function processChatMessage(user, requestId, message) {
  const requestRecord = getRequestForUser(requestId, user);
  if (!requestRecord) throw httpError(404, "Request not found.");
  addMessage(requestId, "user", message, { kind: "chat" });

  if (isCancelCallIntent(message) && (requestRecord.dashboard?.persona === "UHC_CLAIM_DENIAL" || requestRecord.dashboard?.type === "health_claim")) {
    return cancelScheduledCall(user, requestId, requestRecord);
  }

  if (/\b(run agents|do the work|let agents work|start working|handle it|proceed with agents|send it|call them|email them|schedule call|schedule the call|schedule a call|schedule it|start the call)\b/i.test(message)) {
    return runAgents(user, requestId);
  }

  if (/\b(research|draft|make plan|action plan)\b/i.test(message)) {
    return researchRequest(user, requestId);
  }

  if (/\b(mark completed|it is done|completed|confirmed)\b/i.test(message)) {
    setRequestStatus(requestId, "Completed", "User confirmed completion in chat.");
    addMessage(requestId, "assistant", "Marked completed based on your confirmation. I saved the task history and will keep the proof checklist in this conversation.", { kind: "completion" });
    return getRequestForUser(requestId, user);
  }

  const dashboard = requestRecord.dashboard;
  const updates = extractChatFieldUpdates(dashboard, message);
  if (Object.keys(updates).length > 0) {
    dashboard.values = { ...(dashboard.values || {}), ...updates };
    updateDashboard(requestId, dashboard);
  }
  const latest = getRequestForUser(requestId, user);
  const missing = getMissingFields(latest.dashboard, latest.files);
  setRequestStatus(requestId, missing.length ? "Waiting for user" : "Drafting", missing.length ? "Still collecting required details from chat." : "Requirements table is ready for agent work.");
  if (latest.dashboard.type !== "health_claim") {
    addMessage(requestId, "assistant", composeChatReply(latest, Object.keys(updates)), { kind: "followup", updates });
  }
  return getRequestForUser(requestId, user);
}

function researchRequest(user, requestId) {
  const fresh = getRequestForUser(requestId, user);
  const missing = getMissingFields(fresh.dashboard, fresh.files);
  if (missing.length) {
    addMessage(requestId, "assistant", composeFollowup(fresh.dashboard, fresh.files), { kind: "followup" });
    setRequestStatus(requestId, "Waiting for user", "Research paused until required details are filled.");
    return getRequestForUser(requestId, user);
  }
  setRequestStatus(requestId, "Drafting", "Researching context and drafting the agent work package.");
  const generated = generateResearchPlanAndArtifacts(fresh);
  db.prepare(`
    UPDATE requests
    SET dashboard_json = ?, research_json = ?, plan_json = ?, artifacts_json = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(generated.dashboard),
    JSON.stringify(generated.research),
    JSON.stringify(generated.plan),
    JSON.stringify(generated.artifacts),
    "Ready to send",
    now(),
    requestId
  );
  addStatusEvent(requestId, "Ready to send", "Agent research and drafts are ready.");
  addMessage(requestId, "assistant", "Research is done. I filled the agent-output rows in the table and prepared the email/phone scripts.", { kind: "plan" });
  return getRequestForUser(requestId, user);
}

function runAgents(user, requestId) {
  let requestRecord = getRequestForUser(requestId, user);
  const missing = getMissingFields(requestRecord.dashboard, requestRecord.files);
  if (missing.length) {
    addMessage(requestId, "assistant", `I cannot run agents yet because the table still needs:\n${missing.map((field) => `- ${field.label}`).join("\n")}`, { kind: "blocked" });
    setRequestStatus(requestId, "Waiting for user", "Agent work blocked by missing required fields.");
    return getRequestForUser(requestId, user);
  }

  if (requestRecord.dashboard.persona === "UHC_CLAIM_DENIAL") {
    const dashboard = requestRecord.dashboard;
    dashboard.values.callStatus = "Call scheduled";
    dashboard.values.scheduledCallTime = "2026-05-29T12:00:00Z";
    db.prepare("UPDATE requests SET dashboard_json = ?, approved_at = COALESCE(approved_at, ?), status = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(dashboard), now(), "In progress", now(), requestId);
    addStatusEvent(requestId, "In progress", "UnitedHealthcare call scheduled.");
    addMessage(requestId, "assistant", healthClaimScheduleMessage(), { kind: "call-scheduled" });
    return getRequestForUser(requestId, user);
  }

  if (!requestRecord.plan || !requestRecord.artifacts) {
    requestRecord = researchRequest(user, requestId);
  }

  const fresh = getRequestForUser(requestId, user);
  db.prepare("UPDATE requests SET approved_at = COALESCE(approved_at, ?), status = ?, updated_at = ? WHERE id = ?")
    .run(now(), "In progress", now(), requestId);
  addStatusEvent(requestId, "In progress", "Agents started simulated outreach from chat.");
  const company = firstFilled(fresh.dashboard.values || {}, ["merchantName", "companyName", "providerName", "travelCompany", "cityAgency"]) || "the company";
  addMessage(requestId, "assistant", `Agent work started for ${company}.\n\nResearch agent: checked the policy/context assumptions and proof checklist.\nEmail agent: prepared the outgoing message in the table.\nPhone agent: prepared the call script, including what to say while waiting through hold music.\nTracker agent: status is now In progress. I will not mark it completed unless you confirm the result or upload proof.`, { kind: "agent-run" });
  return getRequestForUser(requestId, user);
}

function cancelScheduledCall(user, requestId, requestRecord) {
  const dashboard = requestRecord.dashboard || {};
  if (dashboard.persona === "UHC_CLAIM_DENIAL" || dashboard.type === "health_claim") {
    dashboard.values = { ...(dashboard.values || {}), callStatus: "Cancelled" };
    db.prepare("UPDATE requests SET dashboard_json = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(dashboard), "Completed", now(), requestId);
    addStatusEvent(requestId, "Completed", "Scheduled call cancelled in chat.");
  }
  addMessage(requestId, "assistant", "Okay, I cancelled this call. Please let me know if there's anything else I can help you with.", { kind: "call-cancelled" });
  return getRequestForUser(requestId, user);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw httpError(413, "Payload too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Invalid JSON.");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function requireUser(req) {
  const user = getUserFromRequest(req);
  if (!user) throw httpError(401, "Please log in.");
  return user;
}

function requireAdmin(user) {
  if (user.role !== "admin") throw httpError(403, "Admin access required.");
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/meta") {
    return sendJson(res, 200, { taskTypes: TASK_TYPES, statuses: STATUSES });
  }

  if (method === "GET" && pathname === "/api/session") {
    return sendJson(res, 200, { user: getUserFromRequest(req) });
  }

  if (method === "POST" && pathname === "/api/signup") {
    const body = await readJson(req);
    if (!body.name || !body.email || !body.password) throw httpError(400, "Name, email, and password are required.");
    const user = createUser(body.name, body.email, body.password, "user");
    const session = createSession(user.id);
    setSessionCookie(res, session);
    return sendJson(res, 201, { user });
  }

  if (method === "POST" && pathname === "/api/login") {
    const body = await readJson(req);
    const email = String(body.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) throw httpError(400, "Enter an email to continue.");
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const suppliedPassword = String(body.password || "");
    if (user && user.role === "admin" && !suppliedPassword) throw httpError(401, "Admin login needs a password.");
    if (user && suppliedPassword && !verifyPassword(suppliedPassword, user.password_hash)) throw httpError(401, "Invalid email or password.");
    if (!user) {
      createUser(nameFromEmail(email), email, crypto.randomBytes(18).toString("hex"), "user");
      user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    }
    const session = createSession(user.id);
    setSessionCookie(res, session);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/logout") {
    const cookies = parseCookies(req.headers.cookie || "");
    if (cookies.pine_session) db.prepare("DELETE FROM sessions WHERE token = ?").run(cookies.pine_session);
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  const user = requireUser(req);

  if (method === "GET" && pathname === "/api/requests") {
    const rows = db.prepare(`
      SELECT * FROM requests
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(user.id);
    return sendJson(res, 200, { requests: rows.map(summarizeRequest) });
  }

  if (method === "POST" && pathname === "/api/requests") {
    const body = await readJson(req);
    const description = String(body.description || body.customRequest || "").trim();
    const type = classifyTask(body.taskType, description);
    if (!description && !body.taskType) throw httpError(400, "Choose a task type or describe the request.");
    const dashboard = createPersonalizedDashboard(type, description);
    const title = createTitle(type, description || TASK_TYPES[type].label);
    const requestId = id("req");
    const createdAt = now();
    const initialStatus = getMissingFields(dashboard, []).length ? "Waiting for user" : "Drafting";
    db.prepare(`
      INSERT INTO requests (id, user_id, type, title, description, status, dashboard_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requestId, user.id, dashboard.type, title, description || TASK_TYPES[type].summary, initialStatus, JSON.stringify(dashboard), createdAt, createdAt);
    addMessage(requestId, "assistant", composeFollowup(dashboard, []), { kind: "followup" });
    addStatusEvent(requestId, initialStatus, "Request created.");
    return sendJson(res, 201, { request: getRequestForUser(requestId, user) });
  }

  if (method === "POST" && pathname === "/api/chat") {
    const body = await readJson(req);
    const message = String(body.message || "").trim();
    if (!message) throw httpError(400, "Message is required.");
    const request = body.requestId
      ? processChatMessage(user, String(body.requestId), message)
      : createRequestFromChat(user, message);
    const rows = db.prepare(`
      SELECT * FROM requests
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(user.id);
    return sendJson(res, 200, { request, requests: rows.map(summarizeRequest) });
  }

  if (method === "GET" && pathname === "/api/admin/requests") {
    requireAdmin(user);
    const rows = db.prepare("SELECT * FROM requests ORDER BY updated_at DESC").all();
    return sendJson(res, 200, { requests: rows.map(summarizeRequest) });
  }

  const requestMatch = pathname.match(/^\/api\/requests\/([^/]+)(?:\/([^/]+))?$/);
  if (!requestMatch) throw httpError(404, "Not found.");
  const requestId = requestMatch[1];
  const action = requestMatch[2] || "";
  const requestRecord = getRequestForUser(requestId, user);
  if (!requestRecord) throw httpError(404, "Request not found.");

  if (method === "GET" && !action) {
    return sendJson(res, 200, { request: requestRecord });
  }

  if (method === "PATCH" && action === "dashboard") {
    const body = await readJson(req);
    const dashboard = requestRecord.dashboard;
    dashboard.values = { ...(dashboard.values || {}), ...(body.values || {}) };
    updateDashboard(requestId, dashboard);
    const missing = getMissingFields(dashboard, requestRecord.files);
    setRequestStatus(requestId, missing.length ? "Waiting for user" : "Drafting", missing.length ? "Still collecting required details." : "Core details are ready for research.");
    if (dashboard.type !== "health_claim") {
      addMessage(
        requestId,
        "assistant",
        missing.length
          ? `Saved those details. I still need ${missing.length} more item${missing.length === 1 ? "" : "s"} before I can do the outreach cleanly.`
          : "Got it. The form is filled enough for me to research and draft the work.",
        { kind: "dashboard-save" }
      );
    }
    return sendJson(res, 200, { request: getRequestForUser(requestId, user), missing });
  }

  if (method === "POST" && action === "chat") {
    const body = await readJson(req);
    const message = String(body.message || "").trim();
    if (!message) throw httpError(400, "Message is required.");
    return sendJson(res, 200, { request: processChatMessage(user, requestId, message) });
  }

  if (method === "POST" && action === "files") {
    const body = await readJson(req);
    const fileName = String(body.name || "upload.bin").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const mimeType = String(body.type || "application/octet-stream");
    const base64 = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) throw httpError(400, "File data is required.");
    const buffer = Buffer.from(base64, "base64");
    const fileId = id("file");
    const storageName = `${fileId}-${fileName}`;
    const storagePath = path.join(UPLOAD_DIR, storageName);
    writeFileSync(storagePath, buffer);
    db.prepare(`
      INSERT INTO uploaded_files (id, request_id, original_name, mime_type, size, storage_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, requestId, fileName, mimeType, buffer.length, storagePath, now());
    addStatusEvent(requestId, requestRecord.status, `Uploaded ${fileName}.`);
    return sendJson(res, 201, { request: getRequestForUser(requestId, user) });
  }

  if (method === "POST" && action === "research") {
    return sendJson(res, 200, { request: researchRequest(user, requestId) });
  }

  if (method === "POST" && action === "agent-run") {
    return sendJson(res, 200, { request: runAgents(user, requestId) });
  }

  if (method === "POST" && action === "approve") {
    return sendJson(res, 200, { request: runAgents(user, requestId) });
  }

  if (method === "PATCH" && action === "status") {
    const body = await readJson(req);
    const status = String(body.status || "");
    setRequestStatus(requestId, status, body.note || "Status updated by user.");
    if (status === "Completed") {
      addMessage(requestId, "assistant", "Marked completed based on your confirmation. Keep any confirmation numbers or proof with the request.", { kind: "completion" });
    }
    return sendJson(res, 200, { request: getRequestForUser(requestId, user) });
  }

  throw httpError(404, "Not found.");
}

function serveStatic(req, res, url) {
  let filePath = path.normalize(decodeURIComponent(url.pathname));
  if (filePath === "/") filePath = "/index.html";
  const ext = path.extname(filePath);
  const resolved = path.join(PUBLIC_DIR, filePath);
  const target = resolved.startsWith(PUBLIC_DIR) && existsSync(resolved) && ext ? resolved : path.join(PUBLIC_DIR, "index.html");
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[path.extname(target)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
  res.end(readFileSync(target));
}

initializeDatabase();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { error: error.message || "Server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CallRunner listening on ${HOST}:${PORT}`);
});
