import { useState, useEffect, useCallback, useRef } from "react";

// ════════════════════════════════════════════════════════════
//  🤖  AI ENGINE
// ════════════════════════════════════════════════════════════
const AI = {
  async call(prompt, maxTokens = 900) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "AI error");
    return data.content?.[0]?.text || "";
  },

  async generateAppeal(form, userName) {
    return AI.call(`אתה עורך דין ישראלי מומחה בדיני תעבורה.
כתוב מכתב ערר רשמי על דוח חניה.
מספר דוח: ${form.ticketNumber} | עיר: ${form.city} | תאריך: ${form.date} | סכום: ₪${form.amount}
נימוק: ${form.reason}${form.details ? ` | פרטים: ${form.details}` : ""}${form.evidence ? ` | ראיות: ${form.evidence}` : ""}
שם המערר: ${userName || "מגיש הערר"}
כתוב מכתב ערר מקצועי (250-350 מילים) עם אזכורי חוק. גוף המכתב בלבד.`);
  },

  async improveAppeal(text, instruction) {
    return AI.call(`ערר קיים:\n${text}\n\nהנחיה לשיפור: "${instruction}"\nהחזר טקסט מעודכן בלבד.`);
  },

  // ✉️ AI writes each email type
  async writeEmail(type, data) {
    const prompts = {
      welcome: `כתוב אימייל קבלת פנים חמותי ומקצועי לשירות "דוק-איט" — פלטפורמה לערעור על דוחות חניה.
הנמען: ${data.userName} | אימייל: ${data.userEmail}
כלול: ברכה אישית, הסבר קצר על השירות, איך מתחילים (3 צעדים), CTA "הגש ערר עכשיו".
פורמט: נושא + גוף האימייל בעברית. ללא HTML. אורך: 120-180 מילים.`,

      submitted: `כתוב אימייל אישור הגשת ערר מקצועי.
שם: ${data.userName} | מספר ערר: ${data.appealId} | מספר דוח: ${data.ticketNumber} | עיר: ${data.city} | סכום: ₪${data.amount}
כלול: אישור הגשה, מספר ערר, מה קורה הלאה (עד 48 שעות), איך לעקוב.
פורמט: נושא + גוף. ללא HTML. 100-140 מילים.`,

      approved: `כתוב אימייל מרגש ומשמח על אישור ערר!
שם: ${data.userName} | מספר ערר: ${data.appealId} | סכום שנחסך: ₪${data.amount}
כלול: חדשות טובות, הסכום שנחסך, מה עכשיו (לא צריך לשלם), הזמנה לשתף חברים.
פורמט: נושא + גוף. ללא HTML. 100-130 מילים.`,

      rejected: `כתוב אימייל מקצועי ומכבד על דחיית ערר.
שם: ${data.userName} | מספר ערר: ${data.appealId} | מספר דוח: ${data.ticketNumber}
כלול: הודעה מכבדת, הסבר שניתן לערור בבית משפט, הצעה לייעוץ נוסף, תמיכה.
פורמט: נושא + גוף. ללא HTML. 100-130 מילים.`,

      review: `כתוב אימייל עדכון שהערר עבר לבדיקה מעמיקה.
שם: ${data.userName} | מספר ערר: ${data.appealId}
כלול: עדכון שהתיק בבדיקה, זמן משוער (5-7 ימי עסקים), מה זה אומר (סימן חיובי), פרטי קשר לשאלות.
פורמט: נושא + גוף. ללא HTML. 80-110 מילים.`,

      reminder: `כתוב אימייל תזכורת לאחר 3 ימים ללא פעילות.
שם: ${data.userName}
כלול: תזכורת חמה שיש לו דוח חניה שאפשר לערער עליו, הזדמנות לחסוך כסף, כמה קל וזריז התהליך.
פורמט: נושא + גוף. ללא HTML. 80-100 מילים.`,
    };
    return AI.call(prompts[type] || prompts.welcome, 600);
  },
};

// ════════════════════════════════════════════════════════════
//  ⚙️  CONFIG — הכנס כאן את ה-API keys שלך
// ════════════════════════════════════════════════════════════
const CONFIG = {
  // 1. צור חשבון חינמי על resend.com
  // 2. לך ל-API Keys ולחץ "Create API Key"
  // 3. הדבק את המפתח כאן:
  RESEND_API_KEY: "re_C1KXCdFg_GfnWXXARJKkqZYZudvKPMeHs",

  // 4. הדומיין שממנו יישלחו אימיילים
  //    - לבדיקה: השתמש ב-"onboarding@resend.dev" (Resend sandbox)
  //    - לפרודקשן: הוסף דומיין שלך בהגדרות Resend
  FROM_EMAIL: "onboarding@resend.dev",
  FROM_NAME:  "דוק-איט",
};

// ════════════════════════════════════════════════════════════
//  📧  EMAIL ENGINE — AI content + Resend delivery + DB log
// ════════════════════════════════════════════════════════════
const EMAIL = {
  parse(rawText) {
    const lines = rawText.trim().split("\n");
    let subject = "";
    let bodyStart = 0;
    for (let i = 0; i < Math.min(4, lines.length); i++) {
      const line = lines[i].trim();
      if (line.match(/^(נושא|subject|Subject|נושא האימייל|כותרת)[:：]/i)) {
        subject = line.replace(/^[^:：]+[:：]\s*/i, "").trim();
        bodyStart = i + 1;
        break;
      }
    }
    if (!subject && lines[0]) {
      subject = lines[0].replace(/^\*+|\*+$/g, "").trim();
      bodyStart = 1;
    }
    const body = lines.slice(bodyStart).filter(l => l.trim()).join("\n").trim();
    return { subject: subject || "הודעה מדוק-איט", body };
  },

  // 🎨 HTML template — עיצוב מקצועי לאימייל
  buildHtml(subject, body, type) {
    const typeColors = {
      welcome:   { accent: "#10B981", icon: "🎉" },
      submitted: { accent: "#3B82F6", icon: "📋" },
      approved:  { accent: "#10B981", icon: "🎉" },
      rejected:  { accent: "#EF4444", icon: "📩" },
      review:    { accent: "#F59E0B", icon: "🔍" },
      reminder:  { accent: "#8A9BB5", icon: "⏰" },
      custom:    { accent: "#A78BFA", icon: "✉️" },
    };
    const { accent, icon } = typeColors[type] || typeColors.custom;
    const htmlBody = body.replace(/\n/g, "<br/>");
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0A1628;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A1628;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#0F2040;border-radius:16px;border:1px solid rgba(212,168,67,0.25);overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0d1e3d,#1a2f5a);padding:28px 32px;text-align:center;border-bottom:1px solid rgba(212,168,67,0.2);">
          <div style="font-size:32px;margin-bottom:8px;">${icon}</div>
          <div style="font-size:22px;font-weight:800;color:#D4A843;letter-spacing:-0.5px;">דוק‑איט</div>
          <div style="font-size:11px;color:#8A9BB5;margin-top:2px;font-family:monospace;">AI · EMAIL · DB</div>
        </td></tr>
        <!-- Subject bar -->
        <tr><td style="background:rgba(${accent === "#10B981" ? "16,185,129" : accent === "#3B82F6" ? "59,130,246" : accent === "#EF4444" ? "239,68,68" : accent === "#F59E0B" ? "245,158,11" : "138,155,181"},.12);padding:14px 32px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:15px;font-weight:700;color:#F4F6FA;">${subject}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px;color:#D1D9E6;font-size:14px;line-height:1.85;">
          ${htmlBody}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 32px;border-top:1px solid rgba(212,168,67,.1);text-align:center;">
          <div style="font-size:11px;color:#8A9BB5;">© 2025 דוק-איט · כל הזכויות שמורות</div>
          <div style="font-size:10px;color:#4A5568;margin-top:4px;">נשלח אוטומטית על ידי מערכת דוק-איט</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  },

  // 🚀 שליחה אמיתית דרך Resend API
  async sendViaResend(to, toName, subject, body, type) {
    // בדיקה שה-API key הוגדר
    if (!CONFIG.RESEND_API_KEY || CONFIG.RESEND_API_KEY.startsWith("re_XXX")) {
      console.warn("📧 Resend API key לא הוגדר — האימייל נשמר ב-DB בלבד");
      return { ok: false, reason: "no_api_key" };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
          to: [`${toName} <${to}>`],
          subject,
          html: EMAIL.buildHtml(subject, body, type),
          text: body, // fallback טקסט רגיל
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        console.error("Resend error:", result);
        return { ok: false, reason: result.message || "resend_error", resendId: null };
      }
      return { ok: true, resendId: result.id };
    } catch (err) {
      console.error("Resend network error:", err);
      return { ok: false, reason: "network_error" };
    }
  },

  async send(type, toUser, data) {
    // 1️⃣ AI כותב את תוכן האימייל
    let subject = "", body = "";
    try {
      const raw = await AI.writeEmail(type, { ...data, userName: toUser.name, userEmail: toUser.email });
      ({ subject, body } = EMAIL.parse(raw));
    } catch {
      const fallbacks = {
        welcome:   { subject: `ברוך הבא לדוק-איט, ${toUser.name}!`, body: `שלום ${toUser.name},\n\nברוך הבא לדוק-איט — הפלטפורמה המהירה לערעור על דוחות חניה.\nהגש ערר תוך 5 דקות ב-₪9 בלבד.\n\nבברכה,\nצוות דוק-איט` },
        submitted: { subject: `ערר ${data.appealId} התקבל ✓`, body: `שלום ${toUser.name},\n\nערר ${data.appealId} על דוח ${data.ticketNumber} הוגש בהצלחה.\nנטפל בו תוך 48 שעות.\n\nבברכה,\nצוות דוק-איט` },
        approved:  { subject: `🎉 ערר ${data.appealId} אושר!`, body: `שלום ${toUser.name},\n\nשמחים לבשר שהערר על סך ₪${data.amount} התקבל!\nלא תצטרך לשלם את הקנס.\n\nבברכה,\nצוות דוק-איט` },
        rejected:  { subject: `עדכון על ערר ${data.appealId}`, body: `שלום ${toUser.name},\n\nלצערנו הערר ${data.appealId} נדחה.\nניתן לפנות לבית משפט לתעבורה.\n\nבברכה,\nצוות דוק-איט` },
        review:    { subject: `ערר ${data.appealId} בבדיקה מעמיקה`, body: `שלום ${toUser.name},\n\nהערר עבר לבדיקה מעמיקה — זמן טיפול 5-7 ימי עסקים.\n\nבברכה,\nצוות דוק-איט` },
        reminder:  { subject: `תזכורת: עוד לא הגשת ערר?`, body: `שלום ${toUser.name},\n\nרצינו להזכיר — ניתן לערער על דוחות חניה בקלות ב-₪9.\n\nבברכה,\nצוות דוק-איט` },
      };
      ({ subject, body } = fallbacks[type] || fallbacks.welcome);
    }

    // 2️⃣ שליחה אמיתית דרך Resend
    const { ok, resendId, reason } = await EMAIL.sendViaResend(
      toUser.email, toUser.name, subject, body, type
    );

    // 3️⃣ שמירה ב-DB כולל סטטוס שליחה
    const emailRecord = {
      id: "EML-" + String(Date.now()).slice(-6),
      type,
      to: toUser.email,
      toName: toUser.name,
      toUserId: toUser.id,
      subject,
      body,
      status: ok ? "sent" : reason === "no_api_key" ? "db_only" : "failed",
      resendId: resendId || null,
      sentAt: new Date().toISOString(),
    };
    await DB.saveEmail(emailRecord);
    return emailRecord;
  },
};

// ════════════════════════════════════════════════════════════
//  🗄️  DB LAYER
// ════════════════════════════════════════════════════════════
const DB = {
  async get(key) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } },
  async set(key, val) { try { await window.storage.set(key, JSON.stringify(val)); } catch {} },

  async getUsers() { return DB.get("db:users"); },
  async saveUsers(u) { await DB.set("db:users", u); },
  async seedUsers() {
    const e = await DB.getUsers(); if (e) return e;
    const seed = [
      { id: 1, email: "admin@dokeit.co.il", password: "admin123", name: "מנהל מערכת", role: "admin", createdAt: new Date().toISOString() },
      { id: 2, email: "user@test.com",       password: "user123",  name: "דוד לוי",    role: "user",  createdAt: new Date().toISOString() },
    ];
    await DB.saveUsers(seed); return seed;
  },
  async findUser(email, pw) { return (await DB.getUsers() || []).find(u => u.email === email && u.password === pw) || null; },
  async findByEmail(email) { return (await DB.getUsers() || []).find(u => u.email === email) || null; },
  async createUser(data) {
    const users = await DB.getUsers() || [];
    const u = { ...data, id: Date.now(), role: "user", createdAt: new Date().toISOString() };
    users.push(u); await DB.saveUsers(users); return u;
  },

  async getAppeals() { return DB.get("db:appeals"); },
  async saveAppeals(a) { await DB.set("db:appeals", a); },
  async seedAppeals(uid) {
    const e = await DB.getAppeals(); if (e) return e;
    const seed = [
      { id:"APP-001", userId:uid, ticketNumber:"TLV-2024-98231", amount:250, city:"תל אביב", date:"2024-12-10", status:"approved", submittedAt:"2024-12-12", reason:"חניתי בתחום זמן המותר לפי השלט", evidence:"תמונת_שלט.jpg", appealText:"לכבוד מחלקת פקחי החניה...", paymentStatus:"paid", paymentAmount:9, createdAt:"2024-12-12T10:00:00Z" },
      { id:"APP-002", userId:uid, ticketNumber:"TLV-2024-11092", amount:500, city:"תל אביב", date:"2024-12-15", status:"pending", submittedAt:"2024-12-17", reason:"הרכב היה בתקלה", evidence:null, appealText:"", paymentStatus:"paid", paymentAmount:9, createdAt:"2024-12-17T14:30:00Z" },
      { id:"APP-003", userId:uid, ticketNumber:"JRS-2024-33871", amount:100, city:"ירושלים", date:"2024-12-20", status:"review", submittedAt:"2024-12-21", reason:"הדוח ניתן בטעות", evidence:"חוזה_חניה.pdf", appealText:"", paymentStatus:"paid", paymentAmount:9, createdAt:"2024-12-21T09:15:00Z" },
    ];
    await DB.saveAppeals(seed); return seed;
  },
  async getByUser(uid) { return (await DB.getAppeals() || []).filter(a => a.userId === uid); },
  async createAppeal(data) {
    const appeals = await DB.getAppeals() || [];
    const a = { ...data, id: "APP-" + String(Date.now()).slice(-5), createdAt: new Date().toISOString(), submittedAt: new Date().toISOString().split("T")[0] };
    appeals.unshift(a); await DB.saveAppeals(appeals); return a;
  },
  async updateStatus(id, status) {
    const appeals = await DB.getAppeals() || [];
    const i = appeals.findIndex(a => a.id === id); if (i === -1) return null;
    appeals[i] = { ...appeals[i], status, updatedAt: new Date().toISOString() };
    await DB.saveAppeals(appeals); return appeals[i];
  },
  async deleteAppeal(id) { await DB.saveAppeals((await DB.getAppeals() || []).filter(a => a.id !== id)); },

  // 📧 Email log
  async getEmails() { return DB.get("db:emails") || []; },
  async saveEmail(email) {
    const emails = await DB.getEmails();
    emails.unshift(email);
    await DB.set("db:emails", emails.slice(0, 200));
    return email;
  },
  async getEmailsByUser(uid) { return (await DB.getEmails()).filter(e => e.toUserId === uid); },

  async getNotifs(uid) { return DB.get("db:n:" + uid) || []; },
  async addNotif(uid, n) {
    const ns = await DB.getNotifs(uid);
    const x = { id: Date.now(), ...n, read: false, createdAt: new Date().toISOString() };
    ns.unshift(x);
    await DB.set("db:n:" + uid, ns.slice(0, 20));
    return x;
  },
  async markRead(uid) { await DB.set("db:n:" + uid, (await DB.getNotifs(uid)).map(n => ({ ...n, read: true }))); },

  async getSession() { return DB.get("db:session"); },
  async setSession(u) { await DB.set("db:session", { userId: u.id, at: Date.now() }); },
  async clearSession() { try { await window.storage.delete("db:session"); } catch {} },
};

// ════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════
const CITIES  = ["תל אביב","ירושלים","חיפה","ראשון לציון","פתח תקווה","אשדוד","נתניה","באר שבע","בני ברק","חולון","רמת גן","אשקלון","רחובות","בת ים","בית שמש"];
const REASONS = ["חניתי בתחום זמן המותר לפי השלט","הרכב היה בתקלה ולא יכולתי להזיזו","הדוח ניתן בטעות — חניה מותרת","לא היה שלט ברור באזור","עצרתי זמנית לפריקה/טעינה בלבד","הרכב לא שייך לי — נגנב/מכור","טעות בפרטי הרכב / לוחית רישוי","אחר — אפרט בשדה הנימוק"];
const STATUS_MAP = {
  pending:  { label:"ממתין לבדיקה", color:"#F59E0B", bg:"rgba(245,158,11,0.15)" },
  review:   { label:"בבדיקה",       color:"#3B82F6", bg:"rgba(59,130,246,0.15)" },
  approved: { label:"התקבל ✓",      color:"#10B981", bg:"rgba(16,185,129,0.15)" },
  rejected: { label:"נדחה",          color:"#EF4444", bg:"rgba(239,68,68,0.15)" },
};
const EMAIL_TYPE_MAP = {
  welcome:   { label:"ברוכים הבאים", icon:"🎉", color:"#10B981", bg:"rgba(16,185,129,.12)" },
  submitted: { label:"אישור הגשה",   icon:"📋", color:"#3B82F6", bg:"rgba(59,130,246,.12)" },
  approved:  { label:"ערר אושר!",    icon:"🎉", color:"#10B981", bg:"rgba(16,185,129,.12)" },
  rejected:  { label:"ערר נדחה",     icon:"📩", color:"#EF4444", bg:"rgba(239,68,68,.12)"  },
  review:    { label:"בבדיקה",       icon:"🔍", color:"#F59E0B", bg:"rgba(245,158,11,.12)" },
  reminder:  { label:"תזכורת",       icon:"⏰", color:"#8A9BB5", bg:"rgba(138,155,181,.12)" },
  custom:    { label:"הודעה",         icon:"✉️", color:"#A78BFA", bg:"rgba(167,139,250,.12)" },
};
const IMPROVE_PROMPTS = ["הפוך את הטון יותר תקיף ונחוש","הוסף אזכורי חוק ספציפיים","קצר את הטקסט ב-30%","הפוך אותו יותר רשמי ומשפטי","הוסף דגש על הנזק שנגרם לי"];

// ════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#0A1628;--navy-mid:#0F2040;--navy-light:#172A4E;--gold:#D4A843;--gold-light:#F0C76A;--teal:#00C9A7;--teal-dim:#00997F;--white:#F4F6FA;--muted:#8A9BB5;--danger:#FF4D6D;--card-bg:rgba(15,32,64,0.92);--border:rgba(212,168,67,0.2)}
html{font-size:16px;direction:rtl}body{font-family:'Heebo',sans-serif;background:var(--navy);color:var(--white);min-height:100vh;overflow-x:hidden}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--navy)}::-webkit-scrollbar-thumb{background:var(--navy-light);border-radius:3px}
.bg-grid{position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(212,168,67,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(212,168,67,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.bg-glow{position:fixed;top:-20%;right:-10%;width:600px;height:600px;background:radial-gradient(circle,rgba(212,168,67,.06) 0%,transparent 70%);pointer-events:none;z-index:0}
.bg-glow2{position:fixed;bottom:-20%;left:-10%;width:500px;height:500px;background:radial-gradient(circle,rgba(0,201,167,.05) 0%,transparent 70%);pointer-events:none;z-index:0}
.app-wrap{position:relative;z-index:1;min-height:100vh}
.nav{position:sticky;top:0;z-index:100;background:rgba(10,22,40,.96);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:0 28px;height:64px;display:flex;align-items:center;justify-content:space-between}
.nav-logo{font-size:20px;font-weight:800;background:linear-gradient(135deg,var(--gold),var(--gold-light));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.5px;cursor:pointer}
.nav-logo small{font-family:'Space Mono',monospace;font-size:10px;-webkit-text-fill-color:var(--muted);display:block;margin-top:-3px}
.nav-right{display:flex;gap:10px;align-items:center}
.status-bar{background:rgba(0,201,167,.07);border-bottom:1px solid rgba(0,201,167,.15);padding:5px 28px;font-size:11px;color:var(--teal);display:flex;align-items:center;gap:12px;font-family:'Space Mono',monospace;flex-wrap:wrap}
.status-dot{width:6px;height:6px;border-radius:50%;background:var(--teal);animation:pulse 2s infinite;flex-shrink:0}
.status-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:12px;font-size:10px;border:1px solid currentColor;opacity:.75}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.btn{padding:9px 22px;border-radius:8px;border:none;cursor:pointer;font-family:'Heebo',sans-serif;font-size:14px;font-weight:600;transition:all .2s;display:inline-flex;align-items:center;gap:7px}
.btn-primary{background:linear-gradient(135deg,var(--gold),var(--gold-light));color:var(--navy)}.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(212,168,67,.4)}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}.btn-ghost:hover{color:var(--white);border-color:var(--gold)}
.btn-teal{background:linear-gradient(135deg,var(--teal),var(--teal-dim));color:var(--navy)}.btn-teal:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(0,201,167,.4)}
.btn-ai{background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff}.btn-ai:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(124,58,237,.5)}
.btn-email{background:linear-gradient(135deg,#0EA5E9,#0369A1);color:#fff}.btn-email:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(14,165,233,.4)}
.btn-sm{padding:5px 14px;font-size:12px}.btn-lg{padding:13px 34px;font-size:15px;border-radius:10px}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none!important}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:22px;backdrop-filter:blur(10px)}
.fg{margin-bottom:16px}
.flabel{display:block;margin-bottom:7px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.finput{width:100%;padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(212,168,67,.2);border-radius:8px;color:var(--white);font-family:'Heebo',sans-serif;font-size:14px;transition:all .2s;outline:none}
.finput:focus{border-color:var(--gold);background:rgba(212,168,67,.05)}.finput::placeholder{color:var(--muted)}
select.finput option{background:var(--navy-mid);color:var(--white)}textarea.finput{resize:vertical;min-height:80px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.tag{display:inline-block;padding:2px 9px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(212,168,67,.1);color:var(--gold);border:1px solid rgba(212,168,67,.2);font-family:'Space Mono',monospace}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:26px}
.stat-card{text-align:center}.stat-num{font-size:32px;font-weight:800;line-height:1}.stat-label{font-size:10px;color:var(--muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
.dash{max-width:1060px;margin:0 auto;padding:34px 26px}
.dash-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;flex-wrap:wrap;gap:12px}
.dash-title{font-size:24px;font-weight:800}
.tbl{width:100%;border-collapse:collapse}.tbl th{text-align:right;padding:10px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)}
.tbl td{padding:12px 14px;border-bottom:1px solid rgba(212,168,67,.07);font-size:13px;vertical-align:middle}.tbl tr:hover td{background:rgba(212,168,67,.03)}
.tbl-empty{text-align:center;padding:44px 0;color:var(--muted)}
.tabs{display:flex;gap:3px;background:rgba(255,255,255,.04);border-radius:10px;padding:4px;margin-bottom:22px;width:fit-content;flex-wrap:wrap}
.tab{padding:6px 16px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;color:var(--muted);transition:all .2s;white-space:nowrap;border:none;background:transparent;font-family:'Heebo',sans-serif}
.tab.active{background:var(--navy-light);color:var(--white);border:1px solid var(--border)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s}
.modal{background:var(--navy-mid);border:1px solid var(--border);border-radius:16px;padding:26px;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;animation:slideUp .26s}
.modal-wide{max-width:660px}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
.pay-card{background:linear-gradient(135deg,#1a2f5a,#0d1e3d);border:1px solid rgba(212,168,67,.3);border-radius:13px;padding:20px;font-family:'Space Mono',monospace;position:relative;overflow:hidden;margin-bottom:18px}
.pay-card::before{content:'';position:absolute;top:-38px;right:-28px;width:110px;height:110px;background:radial-gradient(circle,rgba(212,168,67,.14),transparent);border-radius:50%}
.card-chip{width:32px;height:24px;border-radius:4px;background:linear-gradient(135deg,var(--gold),var(--gold-light));margin-bottom:16px}
.card-num{font-size:14px;letter-spacing:3px;margin-bottom:12px;color:var(--white)}.card-meta{display:flex;justify-content:space-between;font-size:10px;color:var(--muted)}
.notif-item{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:9px;background:rgba(255,255,255,.03);border:1px solid var(--border);margin-bottom:8px}
.notif-item.unread{border-color:rgba(0,201,167,.3);background:rgba(0,201,167,.04)}.notif-dot{width:7px;height:7px;border-radius:50%;margin-top:5px;flex-shrink:0}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--navy-light);border:1px solid var(--border);border-radius:10px;padding:11px 20px;display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;z-index:999;animation:toastIn .26s;min-width:260px;box-shadow:0 8px 26px rgba(0,0,0,.5)}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.spin{width:16px;height:16px;border-radius:50%;border:2px solid rgba(212,168,67,.2);border-top-color:var(--gold);animation:rot .7s linear infinite;display:inline-block}
.spin-purple{border-color:rgba(124,58,237,.2);border-top-color:#7C3AED}.spin-blue{border-color:rgba(14,165,233,.2);border-top-color:#0EA5E9}.spin-light{border-color:rgba(255,255,255,.2);border-top-color:#fff}
@keyframes rot{to{transform:rotate(360deg)}}
/* AI */
.ai-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:rgba(124,58,237,.15);border:1px solid rgba(124,58,237,.3);color:#A78BFA;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:14px}
.ai-panel{background:rgba(124,58,237,.05);border:1px solid rgba(124,58,237,.2);border-radius:12px;padding:18px}
.ai-loader{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px;gap:14px}
.ai-loader-ring{width:48px;height:48px;border-radius:50%;border:3px solid rgba(124,58,237,.15);border-top-color:#7C3AED;animation:rot .8s linear infinite}
.improve-chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
.improve-chip{padding:4px 11px;border-radius:20px;font-size:12px;cursor:pointer;transition:all .2s;border:1px solid rgba(124,58,237,.25);background:rgba(124,58,237,.08);color:#A78BFA;font-family:'Heebo',sans-serif;font-weight:600}
.improve-chip:hover{background:rgba(124,58,237,.2);border-color:rgba(124,58,237,.5)}
/* 📧 EMAIL STYLES */
.email-compose{background:rgba(14,165,233,.05);border:1px solid rgba(14,165,233,.2);border-radius:12px;padding:20px}
.email-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;background:rgba(14,165,233,.12);border:1px solid rgba(14,165,233,.25);color:#38BDF8;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:12px}
.email-item{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--border);margin-bottom:8px;cursor:pointer;transition:all .2s}
.email-item:hover{border-color:rgba(14,165,233,.3);background:rgba(14,165,233,.04)}
.email-item.unread{border-color:rgba(14,165,233,.3);background:rgba(14,165,233,.05)}
.email-avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#0369A1);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.email-meta{font-size:11px;color:var(--muted);margin-top:3px}
.email-preview{font-size:12px;color:var(--muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}
.email-sending{display:flex;flex-direction:column;align-items:center;padding:28px;gap:12px}
.email-send-ring{width:56px;height:56px;border-radius:50%;border:3px solid rgba(14,165,233,.15);border-top-color:#0EA5E9;animation:rot .8s linear infinite}
.email-template-card{padding:14px 16px;border-radius:10px;cursor:pointer;transition:all .2s;border:1px solid var(--border);background:rgba(255,255,255,.03);display:flex;align-items:center;gap:12px;margin-bottom:8px}
.email-template-card:hover{border-color:rgba(14,165,233,.3);background:rgba(14,165,233,.04)}
/* alerts */
.alert{padding:11px 14px;border-radius:9px;font-size:13px;margin-bottom:13px}
.alert-success{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10B981}
.alert-warning{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#F59E0B}
.alert-error{background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.3);color:#FF4D6D}
.alert-info{background:rgba(0,201,167,.08);border:1px solid rgba(0,201,167,.2);color:var(--teal)}
.alert-ai{background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.25);color:#A78BFA}
.alert-email{background:rgba(14,165,233,.07);border:1px solid rgba(14,165,233,.2);color:#38BDF8}
/* upload */
.upload{border:2px dashed rgba(212,168,67,.3);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:all .2s;color:var(--muted);font-size:13px}
.upload:hover{border-color:var(--gold);background:rgba(212,168,67,.04);color:var(--white)}
/* hero */
.hero{padding:80px 26px 60px;text-align:center;max-width:780px;margin:0 auto}
.hero-eye{display:inline-flex;align-items:center;gap:7px;padding:5px 14px;border-radius:20px;background:rgba(212,168,67,.1);border:1px solid rgba(212,168,67,.2);font-size:11px;color:var(--gold);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:20px}
.hero h1{font-size:clamp(30px,5.5vw,56px);font-weight:900;line-height:1.1;margin-bottom:16px;letter-spacing:-1px}
.grad{background:linear-gradient(135deg,var(--gold),var(--gold-light));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.grad-ai{background:linear-gradient(135deg,#A78BFA,#7C3AED);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:16px;color:var(--muted);line-height:1.7;max-width:520px;margin:0 auto 32px}
.feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;padding:0 26px 64px;max-width:1060px;margin:0 auto}
.feat-icon{font-size:24px;width:48px;height:48px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:rgba(212,168,67,.1);border:1px solid var(--border);margin-bottom:13px}
.process{display:flex;max-width:1060px;margin:0 auto;padding:0 26px 56px;flex-wrap:wrap}
.proc-step{flex:1;min-width:100px;text-align:center;position:relative;padding:0 10px;margin-bottom:16px}
.proc-step::before{content:'';position:absolute;top:20px;left:0;width:50%;height:1px;background:var(--border)}
.proc-step:first-child::before{display:none}
.proc-num{width:40px;height:40px;border-radius:50%;border:2px solid var(--gold);color:var(--gold);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;margin:0 auto 9px;background:rgba(212,168,67,.1)}
.proc-step h4{font-size:12px;font-weight:700;margin-bottom:4px}.proc-step p{font-size:11px;color:var(--muted)}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:9px}.bar-label{width:48px;font-size:11px;color:var(--muted);flex-shrink:0}
.bar-track{flex:1;height:20px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-light));border-radius:4px;display:flex;align-items:center;justify-content:flex-end;transition:width .6s ease}
.bar-val{font-size:10px;font-weight:700;color:var(--navy);padding-right:5px}
@media(max-width:768px){.stats-row{grid-template-columns:repeat(2,1fr)}.nav{padding:0 14px}.hero{padding:50px 14px 32px}.feat-grid{padding:0 14px 48px}.dash{padding:18px 12px}.status-bar{padding:4px 14px}}
`;

// ════════════════════════════════════════════════════════════
//  MICRO COMPONENTS
// ════════════════════════════════════════════════════════════
const StyleInject = () => { useEffect(() => { const el = document.createElement("style"); el.textContent = CSS; document.head.appendChild(el); return () => document.head.removeChild(el); }, []); return null; };
const Toast = ({ msg, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3600); return () => clearTimeout(t); }, []); return <div className="toast">{({ success:"✅", error:"❌", info:"ℹ️", warning:"⚠️", email:"📧" })[type] || "ℹ️"} {msg}</div>; };
const Spin = ({ v = "gold" }) => <span className={`spin${v === "purple" ? " spin-purple" : v === "blue" ? " spin-blue" : v === "light" ? " spin-light" : ""}`} />;
const SBadge = ({ status }) => { const s = STATUS_MAP[status] || STATUS_MAP.pending; return <span className="badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>; };
const EBadge = ({ type }) => { const e = EMAIL_TYPE_MAP[type] || EMAIL_TYPE_MAP.custom; return <span className="badge" style={{ background: e.bg, color: e.color }}>{e.icon} {e.label}</span>; };

// ════════════════════════════════════════════════════════════
//  EMAIL VIEWER MODAL
// ════════════════════════════════════════════════════════════
const EmailModal = ({ email, onClose }) => (
  <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal modal-wide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <EBadge type={email.type} />
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{email.subject}</div>
          <div style={{ fontSize: 12, color: "#8A9BB5", marginTop: 4 }}>
            אל: {email.toName} &lt;{email.to}&gt; · {new Date(email.sentAt).toLocaleString("he-IL")}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9BB5", cursor: "pointer", fontSize: 17 }}>✕</button>
      </div>
      <div style={{ background: "rgba(14,165,233,.04)", border: "1px solid rgba(14,165,233,.15)", borderRadius: 10, padding: 20, fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", color: "var(--white)", minHeight: 160 }}>
        {email.body}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => navigator.clipboard?.writeText(email.body)}>📋 העתק</button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>סגור</button>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════
//  APPEAL TEXT MODAL
// ════════════════════════════════════════════════════════════
const AppealTextModal = ({ appeal, onClose }) => (
  <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal modal-wide">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="ai-badge">🤖 נוסח AI</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>נוסח הערר — {appeal.id}</div>
          <div style={{ fontSize: 12, color: "#8A9BB5", marginTop: 2 }}>{appeal.ticketNumber} · {appeal.city}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9BB5", cursor: "pointer", fontSize: 17 }}>✕</button>
      </div>
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(212,168,67,.15)", borderRadius: 10, padding: 20, fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>
        {appeal.appealText || "לא נשמר נוסח ערר."}
      </div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 14, width: "100%", justifyContent: "center" }} onClick={() => navigator.clipboard?.writeText(appeal.appealText || "")}>📋 העתק טקסט</button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════
//  NAV
// ════════════════════════════════════════════════════════════
const Nav = ({ user, onLogin, onLogout, onNav, nc }) => (
  <nav className="nav">
    <div className="nav-logo" onClick={() => onNav("home")}>דוק‑איט<small>AI · EMAIL · DB</small></div>
    <div className="nav-right">
      {user ? (
        <>
          {user.role === "admin" && <button className="btn btn-ghost btn-sm" onClick={() => onNav("admin")}>🛡️ ניהול</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => onNav("dashboard")} style={{ position: "relative" }}>
            👤 {user.name}
            {nc > 0 && <span style={{ position: "absolute", top: -5, left: -5, background: "#FF4D6D", color: "#fff", borderRadius: "50%", width: 15, height: 15, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{nc}</span>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>יציאה</button>
        </>
      ) : (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => onLogin("login")}>התחברות</button>
          <button className="btn btn-primary btn-sm" onClick={() => onLogin("register")}>הרשמה חינם</button>
        </>
      )}
    </div>
  </nav>
);

// ════════════════════════════════════════════════════════════
//  STATUS BAR
// ════════════════════════════════════════════════════════════
const StatusBar = ({ recCount, emailCount, user }) => (
  <div className="status-bar">
    <span className="status-dot" />
    <span>DB CONNECTED</span>
    <span className="status-pill" style={{ color: "#00C9A7", borderColor: "#00C9A7" }}>💾 {recCount} רשומות</span>
    <span className="status-pill" style={{ color: "#0EA5E9", borderColor: "#0EA5E9" }}>📧 {emailCount} אימיילים</span>
    <span className="status-pill" style={{ color: "#A78BFA", borderColor: "#A78BFA" }}>🤖 AI READY</span>
    <span className="status-pill" style={{
      color: CONFIG.RESEND_API_KEY && !CONFIG.RESEND_API_KEY.startsWith("re_XXX") ? "#10B981" : "#F59E0B",
      borderColor: CONFIG.RESEND_API_KEY && !CONFIG.RESEND_API_KEY.startsWith("re_XXX") ? "#10B981" : "#F59E0B"
    }}>
      {CONFIG.RESEND_API_KEY && !CONFIG.RESEND_API_KEY.startsWith("re_XXX") ? "📧 RESEND ON" : "📧 RESEND OFF"}
    </span>
    <span className="status-pill" style={{ color: user ? "#10B981" : "#8A9BB5", borderColor: user ? "#10B981" : "#8A9BB5" }}>
      {user ? "✓ מחובר" : "✗ לא מחובר"}
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════
//  LANDING
// ════════════════════════════════════════════════════════════
const Landing = ({ onStart, total }) => (
  <div>
    <div className="hero">
      <div className="hero-eye">🤖 AI · 📧 EMAIL · 💾 DB</div>
      <h1>ערר חניה<br /><span className="grad">AI + אימיילים</span> <span className="grad-ai">אוטומטיים</span></h1>
      <p>ה-AI מנסח את הערר · מגיש לרשות · ושולח לך אימייל אישי בכל שלב</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-lg" onClick={onStart}>🚗 הגש ערר — ₪9</button>
        <button className="btn btn-ghost btn-lg" onClick={onStart}>ראה איך עובד</button>
      </div>
      <div style={{ marginTop: 24, display: "flex", gap: 22, justifyContent: "center", flexWrap: "wrap" }}>
        {[[total + "+", "ערערים"], ["73%", "הצלחה"], ["AI", "מנסח"], ["📧", "אימייל אוטו׳"]].map(([n, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#D4A843" }}>{n}</div>
            <div style={{ fontSize: 11, color: "#8A9BB5" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="process">
      {[["1","מלא פרטים","עיר, תאריך, סכום"],["2","בחר נימוק","מוכר בחוק"],["3","🤖 AI כותב","נוסח משפטי"],["4","שלם ₪9","מאובטח"],["5","הגשה","לרשות"],["6","📧 אוטו׳","עדכונים"]].map(([n,t,d]) => (
        <div className="proc-step" key={n}><div className="proc-num">{n}</div><h4>{t}</h4><p>{d}</p></div>
      ))}
    </div>
    <div className="feat-grid">
      {[["🤖","AI מנסח","Claude כותב מכתב ערר משפטי מותאם אישית."],["📧","אימייל אוטומטי","אישור הגשה, עדכון סטטוס, בשורה טובה — הכל אוטומטי."],["⚖️","בסיס חוקי","ציטוטי חוק ותקדימים בכל ערר."],["💾","שמירה מלאה","הכל שמור בDB — ערערים, אימיילים, היסטוריה."],["🔔","התראות","Push notifications + אימייל בזמן אמת."],["🛡️","ניהול מלא","ניהול ערערים, משתמשים, אימיילים מלוח בקרה."]].map(([icon, t, d]) => (
        <div className="card" key={t} style={{ padding: 18 }}>
          <div className="feat-icon">{icon}</div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 7 }}>{t}</h3>
          <p style={{ fontSize: 12, color: "#8A9BB5", lineHeight: 1.6 }}>{d}</p>
        </div>
      ))}
    </div>
    <div style={{ textAlign: "center", padding: "44px 26px", borderTop: "1px solid rgba(212,168,67,.1)" }}>
      <div style={{ fontSize: 38, fontWeight: 900, background: "linear-gradient(135deg,#D4A843,#F0C76A)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>₪9</div>
      <div style={{ fontSize: 14, color: "#8A9BB5", marginBottom: 22 }}>כולל AI + אימיילים + מעקב מלא</div>
      <button className="btn btn-primary btn-lg" onClick={onStart}>התחל עכשיו</button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════
//  AUTH MODAL
// ════════════════════════════════════════════════════════════
const AuthModal = ({ mode, onAuth, onClose, onSwitch, onEmailSend }) => {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handle = async () => {
    setErr(""); setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    try {
      if (mode === "login") {
        const u = await DB.findUser(form.email, form.password);
        if (!u) { setErr("אימייל או סיסמה שגויים"); setLoading(false); return; }
        await DB.setSession(u);
        onAuth(u);
      } else {
        if (!form.name || !form.email || !form.password) { setErr("יש למלא את כל השדות"); setLoading(false); return; }
        if (await DB.findByEmail(form.email)) { setErr("האימייל כבר רשום"); setLoading(false); return; }
        const u = await DB.createUser({ name: form.name, email: form.email, password: form.password });
        await DB.setSession(u);
        // 📧 Auto-send welcome email
        const emailRec = await EMAIL.send("welcome", u, {});
        await DB.addNotif(u.id, { text: `📧 אימייל ברוכים הבאים נשלח ל-${u.email}` });
        onEmailSend && onEmailSend(emailRec);
        onAuth(u);
      }
    } catch { setErr("שגיאה — נסה שוב"); }
    setLoading(false);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{mode === "login" ? "התחברות" : "יצירת חשבון"}</div>
            <div style={{ fontSize: 12, color: "#8A9BB5", marginTop: 3 }}>{mode === "login" ? "ברוך הבא חזרה" : "הרשמה + קבל אימייל ברוכים הבאים"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8A9BB5", cursor: "pointer", fontSize: 17 }}>✕</button>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        {mode === "register" && <div className="fg"><label className="flabel">שם מלא</label><input className="finput" placeholder="ישראל ישראלי" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>}
        <div className="fg"><label className="flabel">אימייל</label><input className="finput" type="email" placeholder="name@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="fg"><label className="flabel">סיסמה</label><input className="finput" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        {mode === "login" && <div className="alert alert-info" style={{ fontSize: 11 }}>👤 user@test.com / user123 &nbsp;|&nbsp; 🛡️ admin@dokeit.co.il / admin123</div>}
        {mode === "register" && <div className="alert alert-email" style={{ fontSize: 11 }}>📧 אימייל ברוכים הבאים ייכתב על ידי AI וישלח אוטומטית</div>}
        <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handle} disabled={loading}>
          {loading ? <Spin v="light" /> : mode === "login" ? "התחבר" : "צור חשבון"}
        </button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#8A9BB5" }}>
          {mode === "login" ? "עדיין אין חשבון?" : "כבר יש חשבון?"}{" "}
          <span style={{ color: "#D4A843", cursor: "pointer", fontWeight: 700 }} onClick={onSwitch}>{mode === "login" ? "הרשמה" : "התחברות"}</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  AI STEP
// ════════════════════════════════════════════════════════════
const AIStep = ({ form, user, appealText, setAppealText, onGenerate, generating }) => {
  const [improveMode, setImproveMode] = useState(false);
  const [customInstr, setCustomInstr] = useState("");
  const [improving, setImproving] = useState(false);

  const handleImprove = async (instr) => {
    setImproving(true);
    try { setAppealText(await AI.improveAppeal(appealText, instr)); } catch {}
    setImproving(false); setImproveMode(false); setCustomInstr("");
  };

  if (generating) return (
    <div className="ai-loader">
      <div className="ai-loader-ring" />
      <div style={{ fontSize: 13, color: "#A78BFA", fontWeight: 600 }}>🤖 Claude מנסח את הערר...</div>
      <div style={{ fontSize: 11, color: "#8A9BB5", textAlign: "center", maxWidth: 240 }}>מנתח נסיבות · בודק תקדימים · מנסח בעברית תקנית</div>
    </div>
  );

  if (!appealText) return (
    <div style={{ textAlign: "center", padding: "28px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>🤖</div>
      <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>מוכן לניסוח</h3>
      <p style={{ color: "#8A9BB5", fontSize: 13, marginBottom: 22, lineHeight: 1.7 }}>Claude יכתוב ערר מקצועי לפי הפרטים שמסרת</p>
      <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginBottom: 22 }}>
        {[["📋", form.ticketNumber], ["🏙️", form.city], ["💰", "₪" + form.amount]].map(([icon, v]) => (
          <span key={v} style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.2)", fontSize: 12, color: "#A78BFA" }}>{icon} {v}</span>
        ))}
      </div>
      <button className="btn btn-ai btn-lg" onClick={onGenerate}>🤖 צור נוסח ערר</button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="ai-badge">✨ נכתב ע"י Claude</div>
        <div style={{ display: "flex", gap: 7 }}>
          <button className="btn btn-ghost btn-sm" onClick={onGenerate}>🔄</button>
          <button className="btn btn-ai btn-sm" onClick={() => setImproveMode(!improveMode)}>✏️ שפר</button>
        </div>
      </div>
      <div className="ai-panel">
        <textarea className="finput" style={{ minHeight: 210, background: "transparent", border: "none", fontSize: 13, lineHeight: 1.85, padding: 0 }} value={appealText} onChange={e => setAppealText(e.target.value)} />
        <div style={{ fontSize: 10, color: "#8A9BB5", textAlign: "left", marginTop: 5 }}>{appealText.length} תווים · ניתן לערוך</div>
      </div>
      {improveMode && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.2)" }}>
          <div style={{ fontSize: 11, color: "#A78BFA", fontWeight: 700, marginBottom: 9 }}>✏️ בחר שיפור:</div>
          <div className="improve-chips">{IMPROVE_PROMPTS.map(p => <button key={p} className="improve-chip" onClick={() => handleImprove(p)} disabled={improving}>{p}</button>)}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="finput" style={{ fontSize: 12 }} placeholder="הוראה חופשית..." value={customInstr} onChange={e => setCustomInstr(e.target.value)} />
            <button className="btn btn-ai btn-sm" onClick={() => handleImprove(customInstr)} disabled={improving || !customInstr}>{improving ? <Spin v="purple" /> : "שלח"}</button>
          </div>
        </div>
      )}
      <div className="alert alert-ai" style={{ marginTop: 12, fontSize: 12 }}>💡 נכתב ע"י AI — בדוק פרטים אישיים לפני ההגשה</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  WIZARD
// ════════════════════════════════════════════════════════════
const Wizard = ({ user, onDone, onLoginRequired, showToast }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ticketNumber: "", city: "", date: "", amount: "", reason: "", details: "", evidence: null });
  const [pay, setPay] = useState({ cardNumber: "", expiry: "", cvv: "", name: "" });
  const [appealText, setAppealText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const STEPS = ["פרטים", "נימוק", "ראיות", "🤖 AI", "תשלום", "אישור"];

  const next = () => {
    if (step === 0 && (!form.ticketNumber || !form.city || !form.date || !form.amount)) { showToast("יש למלא את כל שדות החובה", "error"); return; }
    if (step === 1 && !form.reason) { showToast("יש לבחור נימוק", "error"); return; }
    if (step === 2 && !user) { onLoginRequired(); return; }
    if (step === 2 && !appealText) { setStep(3); handleGenerate(); return; }
    setStep(s => Math.min(s + 1, 5));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try { setAppealText(await AI.generateAppeal(form, user?.name)); }
    catch (e) { showToast("שגיאת AI: " + e.message, "error"); setAppealText("לא ניתן לנסח כרגע."); }
    setGenerating(false);
  };

  const handlePay = async () => {
    if (!pay.cardNumber || !pay.expiry || !pay.cvv || !pay.name) { showToast("יש למלא את כל פרטי הכרטיס", "error"); return; }
    setLoading(true); await new Promise(r => setTimeout(r, 1800)); setLoading(false); setStep(5);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const a = await DB.createAppeal({ userId: user.id, ...form, appealText, status: "pending", paymentStatus: "paid", paymentAmount: 9 });
      // 📧 Auto-send confirmation email
      setSendingEmail(true);
      const emailRec = await EMAIL.send("submitted", user, { appealId: a.id, ticketNumber: form.ticketNumber, city: form.city, amount: form.amount });
      setSendingEmail(false);
      await DB.addNotif(user.id, { text: `📧 אישור הגשה נשלח ל-${user.email} · ערר ${a.id}` });
      showToast(`ערר הוגש! 📧 אימייל אישור נשלח ל-${user.email}`, "success");
      onDone();
    } catch { showToast("שגיאה — נסה שוב", "error"); }
    setLoading(false); setSendingEmail(false);
  };

  const fmtCard = v => v.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
  const fmtExp = v => v.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5);

  if (sendingEmail) return (
    <div style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
      <div className="card" style={{ padding: 36 }}>
        <div className="email-sending">
          <div className="email-send-ring" />
          <div style={{ fontSize: 17, fontWeight: 700, color: "#38BDF8" }}>📧 שולח אימייל אישור...</div>
          <div style={{ fontSize: 12, color: "#8A9BB5" }}>Claude כותב אימייל אישי עבורך</div>
          <div style={{ fontSize: 11, color: "#38BDF8", marginTop: 4 }}>→ {user?.email}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "30px 18px" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", flex: 1, alignItems: "center" }}>
            {i > 0 && <div style={{ flex: 1, height: 1, background: i <= step ? "#00C9A7" : "rgba(212,168,67,.2)" }} />}
            <div style={{ width: 25, height: 25, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: i < step ? "#00C9A7" : i === step ? (i === 3 ? "#7C3AED" : "#D4A843") : "rgba(255,255,255,.06)", color: i <= step ? "#fff" : "#8A9BB5", border: `2px solid ${i < step ? "#00C9A7" : i === step ? (i === 3 ? "#7C3AED" : "#D4A843") : "rgba(212,168,67,.2)"}`, transition: "all .3s" }}>{i < step ? "✓" : i + 1}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginBottom: 18 }}>
        {STEPS.map((s, i) => <div key={s} style={{ flex: 1, fontSize: 8, textAlign: i === 0 ? "right" : i === STEPS.length - 1 ? "left" : "center", color: i === step ? (i === 3 ? "#A78BFA" : "#D4A843") : "#8A9BB5", fontWeight: i === step ? 700 : 400 }}>{s}</div>)}
      </div>

      <div className="card" style={{ padding: 22 }}>
        {step === 0 && <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>פרטי דוח החניה</h2>
          <p style={{ color: "#8A9BB5", fontSize: 12, marginBottom: 18 }}>כפי שמופיע על גבי הדוח</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="fg" style={{ gridColumn: "1/-1" }}><label className="flabel">מספר הדוח *</label><input className="finput" placeholder="TLV-2024-98231" value={form.ticketNumber} onChange={e => setForm({ ...form, ticketNumber: e.target.value })} /></div>
            <div className="fg"><label className="flabel">עיר *</label><select className="finput" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}><option value="">בחר עיר</option>{CITIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="fg"><label className="flabel">תאריך *</label><input className="finput" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="fg" style={{ gridColumn: "1/-1" }}><label className="flabel">סכום (₪) *</label><input className="finput" type="number" placeholder="250" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
        </>}

        {step === 1 && <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>סיבת הערר</h2>
          <p style={{ color: "#8A9BB5", fontSize: 12, marginBottom: 16 }}>ה-AI ישתמש בנימוק לניסוח הערר</p>
          {REASONS.map(r => (
            <div key={r} onClick={() => setForm({ ...form, reason: r })} style={{ padding: "10px 13px", borderRadius: 9, marginBottom: 6, cursor: "pointer", border: `1px solid ${form.reason === r ? "#D4A843" : "rgba(212,168,67,.15)"}`, background: form.reason === r ? "rgba(212,168,67,.08)" : "rgba(255,255,255,.02)", display: "flex", alignItems: "center", gap: 9, transition: "all .2s" }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, border: `2px solid ${form.reason === r ? "#D4A843" : "rgba(212,168,67,.3)"}`, background: form.reason === r ? "#D4A843" : "transparent" }} />
              <span style={{ fontSize: 13 }}>{r}</span>
            </div>
          ))}
          {form.reason?.includes("אפרט") && <div className="fg" style={{ marginTop: 10 }}><label className="flabel">פרט</label><textarea className="finput" placeholder="תאר בפירוט..." value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} /></div>}
        </>}

        {step === 2 && <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>צירוף ראיות</h2>
          <div className="alert alert-warning">💡 עם ראיות: 73% הצלחה · בלי: 41%</div>
          <div className="upload" onClick={() => setForm({ ...form, evidence: "ראיה_" + Date.now() + ".jpg" })}>
            {form.evidence ? <><div style={{ fontSize: 20, marginBottom: 5 }}>📎</div><div style={{ color: "#10B981", fontWeight: 600 }}>{form.evidence}</div></> : <><div style={{ fontSize: 22, marginBottom: 5 }}>📁</div><div style={{ fontWeight: 600 }}>גרור קבצים לכאן</div><div style={{ fontSize: 11 }}>תמונות, PDF</div></>}
          </div>
          <div style={{ marginTop: 12 }}><label className="flabel">פרטים לנוסח AI</label><textarea className="finput" placeholder="מידע נוסף שה-AI יכלול..." value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} style={{ minHeight: 60 }} /></div>
          {!user && <div className="alert alert-info" style={{ marginTop: 10 }}>🔑 תתבקש להתחבר לפני שלב ה-AI</div>}
        </>}

        {step === 3 && <AIStep form={form} user={user} appealText={appealText} setAppealText={setAppealText} onGenerate={handleGenerate} generating={generating} />}

        {step === 4 && <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>תשלום מאובטח</h2>
          <p style={{ color: "#8A9BB5", fontSize: 12, marginBottom: 14 }}>₪9 · AI + אימייל אוטומטי · ללא חיוב חוזר</p>
          <div className="pay-card">
            <div className="card-chip" />
            <div className="card-num">{pay.cardNumber || "•••• •••• •••• ••••"}</div>
            <div className="card-meta"><span>{pay.name || "שם בעל הכרטיס"}</span><span>{pay.expiry || "MM/YY"}</span></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="fg" style={{ gridColumn: "1/-1" }}><label className="flabel">מספר כרטיס</label><input className="finput" placeholder="4242 4242 4242 4242" value={pay.cardNumber} onChange={e => setPay({ ...pay, cardNumber: fmtCard(e.target.value) })} style={{ fontFamily: "Space Mono,monospace", letterSpacing: 2 }} /></div>
            <div className="fg" style={{ gridColumn: "1/-1" }}><label className="flabel">שם בעל הכרטיס</label><input className="finput" placeholder="ישראל ישראלי" value={pay.name} onChange={e => setPay({ ...pay, name: e.target.value })} /></div>
            <div className="fg"><label className="flabel">תוקף</label><input className="finput" placeholder="MM/YY" value={pay.expiry} onChange={e => setPay({ ...pay, expiry: fmtExp(e.target.value) })} /></div>
            <div className="fg"><label className="flabel">CVV</label><input className="finput" placeholder="•••" maxLength={4} value={pay.cvv} onChange={e => setPay({ ...pay, cvv: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
          <div style={{ background: "rgba(212,168,67,.07)", border: "1px solid rgba(212,168,67,.2)", borderRadius: 9, padding: "10px 13px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div><div style={{ fontSize: 13, color: "#8A9BB5" }}>ניסוח AI + הגשה + אימייל</div><div style={{ fontSize: 10, color: "#38BDF8" }}>📧 אישור ישלח אוטומטית ל-{user?.email}</div></div>
            <span style={{ fontSize: 20, fontWeight: 900, color: "#D4A843" }}>₪9</span>
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handlePay} disabled={loading}>{loading ? <Spin v="light" /> : "שלם ₪9 והמשך"}</button>
        </>}

        {step === 5 && <>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 5 }}>הכל מוכן!</h2>
            <p style={{ color: "#8A9BB5", fontSize: 13 }}>לחץ להגשה — אימייל אישור יישלח אוטומטית</p>
          </div>
          <div className="alert alert-email" style={{ fontSize: 12 }}>📧 Claude יכתוב אימייל אישי ויישלח ל-{user?.email}</div>
          <div className="card" style={{ marginBottom: 14, padding: 14 }}>
            {[["דוח", form.ticketNumber], ["עיר", form.city], ["סכום", "₪" + form.amount], ["נימוק", form.reason]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid rgba(212,168,67,.1)" }}>
                <span style={{ color: "#8A9BB5" }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-teal" style={{ width: "100%", justifyContent: "center" }} onClick={handleSubmit} disabled={loading}>{loading ? <Spin v="light" /> : "📤 הגש + 📧 שלח אימייל"}</button>
        </>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setStep(s => Math.max(s - 1, 0))} disabled={step === 0 || generating}>→ חזרה</button>
        {step < 4 && step !== 3 && <button className="btn btn-primary btn-sm" onClick={next}>המשך ←</button>}
        {step === 3 && !generating && <button className="btn btn-primary btn-sm" onClick={() => setStep(4)} disabled={!appealText}>המשך לתשלום ←</button>}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  USER DASHBOARD
// ════════════════════════════════════════════════════════════
const UserDash = ({ user, onNew, showToast }) => {
  const [appeals, setAppeals] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [emails, setEmails] = useState([]);
  const [tab, setTab] = useState("appeals");
  const [loading, setLoading] = useState(true);
  const [viewAppeal, setViewAppeal] = useState(null);
  const [viewEmail, setViewEmail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, n, e] = await Promise.all([DB.getByUser(user.id), DB.getNotifs(user.id), DB.getEmailsByUser(user.id)]);
    setAppeals(a); setNotifs(n); setEmails(e); setLoading(false);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const markRead = async () => { await DB.markRead(user.id); setNotifs(n => n.map(x => ({ ...x, read: true }))); };
  const stats = { total: appeals.length, approved: appeals.filter(a => a.status === "approved").length, pending: appeals.filter(a => ["pending", "review"].includes(a.status)).length, saved: appeals.filter(a => a.status === "approved").reduce((s, a) => s + Number(a.amount || 0), 0) };
  const unread = notifs.filter(n => !n.read).length;
  const unreadEmails = emails.filter(e => !e.read).length;
  const filtered = tab === "all" ? appeals : appeals.filter(a => a.status === tab);

  if (loading) return <div style={{ textAlign: "center", padding: 60 }}><Spin /></div>;

  return (
    <div className="dash">
      {viewAppeal && <AppealTextModal appeal={viewAppeal} onClose={() => setViewAppeal(null)} />}
      {viewEmail && <EmailModal email={viewEmail} onClose={() => setViewEmail(null)} />}

      <div className="dash-header">
        <div>
          <div className="dash-title">שלום, {user.name} 👋</div>
          <div style={{ color: "#8A9BB5", fontSize: 12, marginTop: 3 }}>DB · AI · אימיילים אוטומטיים</div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>+ ערר חדש</button>
      </div>

      <div className="stats-row">
        {[["📋", stats.total, "ערערים", "#D4A843"], ["✅", stats.approved, "התקבלו", "#10B981"], ["⏳", stats.pending, "בטיפול", "#F59E0B"], ["📧", emails.length, "אימיילים", "#0EA5E9"]].map(([icon, val, label, color]) => (
          <div key={label} className="card stat-card"><div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div><div className="stat-num" style={{ color }}>{val}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>

      <div className="tabs">
        {[["all", "הכל"], ["pending", "ממתין"], ["approved", "התקבל"], ["emails", `📧 אימיילים${unreadEmails > 0 ? ` (${unreadEmails})` : ""}`], ["notifs", `🔔${unread > 0 ? ` (${unread})` : ""}`]].map(([k, l]) => (
          <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => { setTab(k); if (k === "notifs") markRead(); }}>{l}</button>
        ))}
      </div>

      {tab === "emails" && (
        <div>
          {emails.length === 0 ? <div className="card" style={{ textAlign: "center", padding: 36, color: "#8A9BB5" }}><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>אין אימיילים עדיין</div> :
            emails.map(e => (
              <div key={e.id} className={"email-item" + (e.read ? "" : " unread")} onClick={() => setViewEmail({ ...e, read: true })}>
                <div className="email-avatar">{EMAIL_TYPE_MAP[e.type]?.icon || "✉️"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{e.subject}</div>
                    <div style={{ fontSize: 10, color: "#8A9BB5", flexShrink: 0 }}>{new Date(e.sentAt).toLocaleDateString("he-IL")}</div>
                  </div>
                  <div className="email-meta"><EBadge type={e.type} /></div>
                  <div className="email-preview">{e.body?.slice(0, 100)}...</div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {tab === "notifs" && (
        <div>
          {notifs.length === 0 ? <div className="card" style={{ textAlign: "center", padding: 36, color: "#8A9BB5" }}>אין התראות</div> :
            notifs.map(n => (
              <div key={n.id} className={"notif-item" + (n.read ? "" : " unread")}>
                <div className="notif-dot" style={{ background: n.read ? "#8A9BB5" : "#00C9A7" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{n.text}</div>
                  <div style={{ fontSize: 11, color: "#8A9BB5", marginTop: 2 }}>{new Date(n.createdAt).toLocaleString("he-IL")}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {!["emails", "notifs"].includes(tab) && (
        <div className="card">
          {filtered.length === 0 ? <div className="tbl-empty"><div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>אין ערערים</div> :
            <table className="tbl">
              <thead><tr><th>מזהה</th><th>דוח</th><th>עיר</th><th>סכום</th><th>סטטוס</th><th>AI</th></tr></thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td><span className="tag">{a.id}</span></td>
                    <td style={{ fontFamily: "Space Mono,monospace", fontSize: 11 }}>{a.ticketNumber}</td>
                    <td>{a.city}</td>
                    <td style={{ color: "#FF4D6D", fontWeight: 700 }}>₪{a.amount}</td>
                    <td><SBadge status={a.status} /></td>
                    <td>{a.appealText ? <button onClick={() => setViewAppeal(a)} style={{ background: "rgba(124,58,237,.15)", color: "#A78BFA", border: "1px solid rgba(124,58,237,.3)", padding: "2px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "Heebo,sans-serif", fontWeight: 700 }}>🤖 צפה</button> : <span style={{ color: "#8A9BB5", fontSize: 11 }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  ADMIN — EMAIL COMPOSER COMPONENT
// ════════════════════════════════════════════════════════════
const EmailComposer = ({ users, showToast, onSent }) => {
  const [recipientId, setRecipientId] = useState("all");
  const [emailType, setEmailType] = useState("reminder");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);

  const regularUsers = users.filter(u => u.role !== "admin");

  const generatePreview = async () => {
    setGenerating(true);
    const targetUser = recipientId === "all" ? regularUsers[0] : users.find(u => u.id === Number(recipientId));
    if (!targetUser) { setGenerating(false); return; }
    try {
      const raw = await AI.writeEmail(emailType === "custom" ? "reminder" : emailType, { userName: targetUser.name, userEmail: targetUser.email });
      const { subject, body } = EMAIL.parse(raw);
      setCustomSubject(subject);
      setCustomBody(body);
      setPreview({ subject, body, to: targetUser.name });
    } catch { showToast("שגיאת AI", "error"); }
    setGenerating(false);
  };

  const sendEmails = async () => {
    setSending(true);
    const targets = recipientId === "all" ? regularUsers : users.filter(u => u.id === Number(recipientId));
    let count = 0;
    for (const u of targets) {
      const emailRec = {
        id: "EML-" + String(Date.now() + count).slice(-6),
        type: emailType === "custom" ? "custom" : emailType,
        to: u.email, toName: u.name, toUserId: u.id,
        subject: customSubject || `הודעה מדוק-איט`,
        body: customBody,
        status: "sent",
        sentAt: new Date().toISOString(),
      };
      await DB.saveEmail(emailRec);
      await DB.addNotif(u.id, { text: `📧 קיבלת אימייל: "${emailRec.subject}"` });
      count++;
      await new Promise(r => setTimeout(r, 300));
    }
    setSending(false);
    showToast(`📧 ${count} אימיילים נשלחו בהצלחה`, "success");
    onSent && onSent();
    setPreview(null); setCustomSubject(""); setCustomBody("");
  };

  return (
    <div className="email-compose">
      <div className="email-badge">📧 שלח אימיילים</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="flabel">נמענים</label>
          <select className="finput" value={recipientId} onChange={e => setRecipientId(e.target.value)}>
            <option value="all">כל המשתמשים ({regularUsers.length})</option>
            {regularUsers.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
          </select>
        </div>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="flabel">סוג אימייל</label>
          <select className="finput" value={emailType} onChange={e => setEmailType(e.target.value)}>
            {Object.entries(EMAIL_TYPE_MAP).filter(([k]) => k !== "submitted" && k !== "approved" && k !== "rejected" && k !== "review").map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="btn btn-ai btn-sm" onClick={generatePreview} disabled={generating}>
          {generating ? <><Spin v="purple" /> מייצר...</> : "🤖 AI — צור תוכן"}
        </button>
      </div>
      {(customSubject || customBody) && (
        <>
          <div className="fg"><label className="flabel">נושא</label><input className="finput" value={customSubject} onChange={e => setCustomSubject(e.target.value)} /></div>
          <div className="fg"><label className="flabel">גוף האימייל</label><textarea className="finput" value={customBody} onChange={e => setCustomBody(e.target.value)} style={{ minHeight: 120 }} /></div>
          <button className="btn btn-email" style={{ width: "100%", justifyContent: "center" }} onClick={sendEmails} disabled={sending || !customBody}>
            {sending ? <><Spin v="blue" /> שולח...</> : `📧 שלח ל-${recipientId === "all" ? "כולם (" + regularUsers.length + ")" : "משתמש נבחר"}`}
          </button>
        </>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════
const AdminDash = ({ showToast }) => {
  const [appeals, setAppeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [allEmails, setAllEmails] = useState([]);
  const [tab, setTab] = useState("appeals");
  const [loading, setLoading] = useState(true);
  const [viewAppeal, setViewAppeal] = useState(null);
  const [viewEmail, setViewEmail] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(null);

  const load = async () => {
    setLoading(true);
    const [a, u, e] = await Promise.all([DB.getAppeals(), DB.getUsers(), DB.getEmails()]);
    setAppeals(a || []); setUsers(u || []); setAllEmails(e || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updStatus = async (id, status) => {
    const updated = await DB.updateStatus(id, status);
    if (!updated) return;
    setAppeals(p => p.map(a => a.id === id ? updated : a));
    const targetUser = users.find(u => u.id === updated.userId);
    if (targetUser) {
      setSendingEmail({ id, status, userName: targetUser.name });
      const emailRec = await EMAIL.send(status, targetUser, { appealId: id, ticketNumber: updated.ticketNumber, amount: updated.amount });
      setAllEmails(e => [emailRec, ...e]);
      await DB.addNotif(targetUser.id, { text: `📧 קיבלת עדכון ב-${targetUser.email}: ערר ${id} ${STATUS_MAP[status]?.label}` });
      setSendingEmail(null);
      showToast(`✅ סטטוס עודכן · 📧 אימייל נשלח ל-${targetUser.name}`, "success");
    }
  };

  const del = async (id) => { await DB.deleteAppeal(id); setAppeals(p => p.filter(a => a.id !== id)); showToast("נמחק", "info"); };
  const stats = { total: appeals.length, pending: appeals.filter(a => a.status === "pending").length, revenue: appeals.filter(a => a.paymentStatus === "paid").length * 9, emails: allEmails.length };
  const monthData = [["ינו׳", 126], ["פבר׳", 198], ["מרץ", 243], ["אפר׳", 315], ["מאי", 270], ["יוני", 360]];

  if (loading) return <div style={{ textAlign: "center", padding: 60 }}><Spin /></div>;

  return (
    <div className="dash">
      {viewAppeal && <AppealTextModal appeal={viewAppeal} onClose={() => setViewAppeal(null)} />}
      {viewEmail && <EmailModal email={viewEmail} onClose={() => setViewEmail(null)} />}

      {sendingEmail && (
        <div className="overlay" style={{ zIndex: 300 }}>
          <div className="card" style={{ padding: 32, textAlign: "center", maxWidth: 320 }}>
            <div className="email-send-ring" style={{ margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#38BDF8" }}>📧 שולח אימייל...</div>
            <div style={{ fontSize: 12, color: "#8A9BB5", marginTop: 6 }}>Claude כותב הודעה אישית עבור {sendingEmail.userName}</div>
          </div>
        </div>
      )}

      <div className="dash-header">
        <div>
          <span style={{ background: "rgba(212,168,67,.16)", color: "#D4A843", padding: "2px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700, border: "1px solid rgba(212,168,67,.3)", display: "inline-block", marginBottom: 5 }}>🛡️ ADMIN</span>
          <div className="dash-title">לוח בקרה</div>
          <div style={{ color: "#8A9BB5", fontSize: 12, marginTop: 2 }}>כל עדכון סטטוס שולח אימייל AI אוטומטי</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>🔄 רענן</button>
      </div>

      <div className="stats-row">
        {[["📋", stats.total, "ערערים", "#D4A843"], ["⏳", stats.pending, "ממתינים", "#F59E0B"], ["📧", stats.emails, "אימיילים נשלחו", "#0EA5E9"], ["💳", "₪" + stats.revenue, "הכנסות", "#00C9A7"]].map(([icon, val, label, color]) => (
          <div key={label} className="card stat-card"><div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div><div className="stat-num" style={{ color }}>{val}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>

      <div className="tabs">
        {[["appeals", "ערערים"], ["emails", "📧 אימיילים"], ["compose", "✍️ שלח"], ["users", "משתמשים"], ["revenue", "הכנסות"]].map(([k, l]) => (
          <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "appeals" && (
        <div className="card">
          {CONFIG.RESEND_API_KEY && !CONFIG.RESEND_API_KEY.startsWith("re_XXX") ? (
        <div className="alert alert-success" style={{ fontSize: 12, marginBottom: 16 }}>✅ Resend מחובר — אימיילים נשלחים לכתובות אמיתיות · כל לחיצה על אשר/דחה/בדיקה שולחת אימייל AI</div>
      ) : (
        <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 16 }}>
          ⚠️ <strong>Resend לא מוגדר</strong> — אימיילים נשמרים ב-DB בלבד. להפעלה: ערוך את <code style={{background:"rgba(0,0,0,.2)",padding:"1px 5px",borderRadius:3}}>CONFIG.RESEND_API_KEY</code> בראש הקובץ עם המפתח מ-<a href="https://resend.com" target="_blank" style={{color:"#F59E0B"}}>resend.com</a>
        </div>
      )}
          {appeals.length === 0 ? <div className="tbl-empty">אין ערערים</div> :
            <table className="tbl">
              <thead><tr><th>מזהה</th><th>דוח</th><th>עיר</th><th>סכום</th><th>סטטוס</th><th>AI</th><th>פעולות + אימייל</th></tr></thead>
              <tbody>
                {appeals.map(a => (
                  <tr key={a.id}>
                    <td><span className="tag">{a.id}</span></td>
                    <td style={{ fontFamily: "Space Mono,monospace", fontSize: 10 }}>{a.ticketNumber}</td>
                    <td>{a.city}</td>
                    <td style={{ color: "#FF4D6D", fontWeight: 700 }}>₪{a.amount}</td>
                    <td><SBadge status={a.status} /></td>
                    <td>{a.appealText ? <button onClick={() => setViewAppeal(a)} style={{ background: "rgba(124,58,237,.15)", color: "#A78BFA", border: "1px solid rgba(124,58,237,.3)", padding: "2px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", fontFamily: "Heebo,sans-serif", fontWeight: 700 }}>🤖</button> : <span style={{ color: "#8A9BB5", fontSize: 10 }}>—</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {[["✓ + 📧", "approved", "rgba(16,185,129,.14)", "#10B981", "rgba(16,185,129,.3)"], ["🔍 + 📧", "review", "rgba(59,130,246,.14)", "#3B82F6", "rgba(59,130,246,.3)"], ["✗ + 📧", "rejected", "rgba(239,68,68,.14)", "#EF4444", "rgba(239,68,68,.3)"]].map(([lbl, s, bg, c, br]) => (
                          <button key={s} style={{ background: bg, color: c, border: "1px solid " + br, padding: "2px 7px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontWeight: 700, fontFamily: "Heebo,sans-serif" }} onClick={() => updStatus(a.id, s)}>{lbl}</button>
                        ))}
                        <button style={{ background: "rgba(255,255,255,.05)", color: "#8A9BB5", border: "1px solid rgba(255,255,255,.1)", padding: "2px 7px", borderRadius: 5, fontSize: 9, cursor: "pointer", fontFamily: "Heebo,sans-serif" }} onClick={() => del(a.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      )}

      {tab === "emails" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📧 יומן אימיילים</div>
            <div style={{ fontSize: 12, color: "#8A9BB5" }}>{allEmails.length} אימיילים נשלחו</div>
          </div>
          {allEmails.length === 0 ? <div className="card" style={{ textAlign: "center", padding: 36, color: "#8A9BB5" }}>אין אימיילים עדיין</div> :
            allEmails.map(e => (
              <div key={e.id} className="email-item" onClick={() => setViewEmail(e)}>
                <div className="email-avatar" style={{ fontSize: 14 }}>{EMAIL_TYPE_MAP[e.type]?.icon || "✉️"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.subject}</div>
                    <div style={{ fontSize: 10, color: "#8A9BB5", flexShrink: 0 }}>{new Date(e.sentAt).toLocaleString("he-IL")}</div>
                  </div>
                  <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <EBadge type={e.type} />
                    <span style={{ fontSize: 11, color: "#8A9BB5" }}>→ {e.toName} &lt;{e.to}&gt;</span>
                    {e.status === "sent" && e.resendId && <span style={{ fontSize: 9, background: "rgba(16,185,129,.12)", color: "#10B981", border: "1px solid rgba(16,185,129,.3)", borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>✓ נשלח</span>}
                    {e.status === "db_only" && <span style={{ fontSize: 9, background: "rgba(245,158,11,.1)", color: "#F59E0B", border: "1px solid rgba(245,158,11,.3)", borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>💾 DB בלבד</span>}
                    {e.status === "failed" && <span style={{ fontSize: 9, background: "rgba(239,68,68,.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,.3)", borderRadius: 20, padding: "1px 7px", fontWeight: 700 }}>✗ שגיאה</span>}
                  </div>
                  <div className="email-preview">{e.body?.slice(0, 80)}...</div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {tab === "compose" && (
        <EmailComposer users={users} showToast={showToast} onSent={() => { load(); setTab("emails"); }} />
      )}

      {tab === "users" && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>שם</th><th>אימייל</th><th>תפקיד</th><th>ערערים</th><th>אימיילים</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: "#8A9BB5", fontSize: 12 }}>{u.email}</td>
                  <td><span className="badge" style={{ background: u.role === "admin" ? "rgba(212,168,67,.14)" : "rgba(59,130,246,.12)", color: u.role === "admin" ? "#D4A843" : "#3B82F6" }}>{u.role === "admin" ? "🛡️ מנהל" : "👤 משתמש"}</span></td>
                  <td style={{ color: "#D4A843", fontWeight: 700 }}>{appeals.filter(a => a.userId === u.id).length}</td>
                  <td style={{ color: "#0EA5E9", fontWeight: 700 }}>📧 {allEmails.filter(e => e.toUserId === u.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "revenue" && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#8A9BB5", marginBottom: 14 }}>📈 הכנסות חודשיות (₪)</div>
            {monthData.map(([m, v]) => (
              <div key={m} className="bar-row">
                <div className="bar-label">{m}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: (v / Math.max(...monthData.map(([, x]) => x)) * 100) + "%" }}><span className="bar-val">₪{v}</span></div></div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            {[["ממוצע/חודש", "₪252"], ["ממוצע/שנה", "₪3,024"], ["עלות/ערר", "₪9"], ["שולי רווח", "~82%"]].map(([k, v]) => (
              <div key={k} className="card" style={{ textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 800, color: "#00C9A7" }}>{v}</div><div style={{ fontSize: 10, color: "#8A9BB5", marginTop: 3 }}>{k}</div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  APP ROOT
// ════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [toast, setToast] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [recCount, setRecCount] = useState(0);
  const [emailCount, setEmailCount] = useState(0);
  const [nc, setNc] = useState(0);
  const [total, setTotal] = useState(4203);

  const showToast = (msg, type = "info") => setToast({ msg, type });

  useEffect(() => {
    (async () => {
      const users = await DB.seedUsers();
      const appeals = await DB.seedAppeals(2);
      const emails = await DB.getEmails();
      setRecCount(users.length + appeals.length);
      setEmailCount(emails.length);
      setTotal(4200 + appeals.length);
      const session = await DB.getSession();
      if (session) {
        const all = await DB.getUsers() || [];
        const u = all.find(x => x.id === session.userId);
        if (u) { setUser(u); const n = await DB.getNotifs(u.id); setNc(n.filter(x => !x.read).length); }
      }
      setDbReady(true);
    })();
  }, []);

  const handleAuth = async (u) => {
    setUser(u); setAuthMode(null);
    const n = await DB.getNotifs(u.id); setNc(n.filter(x => !x.read).length);
    const emails = await DB.getEmails(); setEmailCount(emails.length);
    showToast("ברוך הבא, " + u.name + "! 📧 אימייל נשלח", "success");
    setPage("dashboard");
  };

  const handleLogout = async () => { await DB.clearSession(); setUser(null); setNc(0); setPage("home"); showToast("התנתקת", "info"); };

  if (!dbReady) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A1628", color: "#D4A843", gap: 14 }}>
      <StyleInject /><Spin />
      <div style={{ fontSize: 12, color: "#8A9BB5", fontFamily: "Space Mono,monospace" }}>מאתחל DB + AI + EMAIL...</div>
    </div>
  );

  return (
    <div>
      <StyleInject />
      <div className="bg-grid" /><div className="bg-glow" /><div className="bg-glow2" />
      <div className="app-wrap">
        <Nav user={user} onLogin={m => setAuthMode(m)} onLogout={handleLogout} onNav={setPage} nc={nc} />
        <StatusBar recCount={recCount} emailCount={emailCount} user={user} />

        {page === "home" && <Landing onStart={() => { if (!user) { setAuthMode("register") } else { setPage("new-appeal") } }} total={total} />}
        {page === "new-appeal" && <Wizard user={user} showToast={showToast} onLoginRequired={() => setAuthMode("login")} onDone={async () => { const e = await DB.getEmails(); setEmailCount(e.length); setPage("dashboard"); }} />}
        {page === "dashboard" && user && <UserDash user={user} onNew={() => setPage("new-appeal")} showToast={showToast} />}
        {page === "admin" && user?.role === "admin" && <AdminDash showToast={showToast} />}
      </div>

      {authMode && <AuthModal mode={authMode} onAuth={handleAuth} onClose={() => setAuthMode(null)} onSwitch={() => setAuthMode(m => m === "login" ? "register" : "login")} onEmailSend={async () => { const e = await DB.getEmails(); setEmailCount(e.length); }} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
