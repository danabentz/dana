import { getStore } from "@netlify/blobs";
import { buildWaiverPdf } from "./aac-waiver-pdf.mjs";

const ORGANIZER_EMAIL = "danabentzpdx@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const clean = (value, max) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const isAdmin = (req) => {
  const key = process.env.AAC_ADMIN_KEY;
  return Boolean(key) && req.headers.get("x-admin-key") === key;
};

function chicagoParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
}

function signedStamp(date = new Date()) {
  const parts = chicagoParts(date);
  const stamp = `${parts.month}/${parts.day}/${parts.year}`;
  const label = `${stamp} at ${parts.hour}:${parts.minute} ${parts.dayPeriod} CT`;
  return { stamp, label };
}

function ageInChicago(birthdate, on = new Date()) {
  const match = DATE_RE.exec(birthdate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  const today = chicagoParts(on);
  let age = Number(today.year) - year;
  const todayMd = Number(today.month) * 100 + Number(today.day);
  if (todayMd < month * 100 + day) age -= 1;
  return age;
}

function displayDate(birthdate) {
  const [, year, month, day] = DATE_RE.exec(birthdate);
  return `${month}/${day}/${year}`;
}

function decodePng(dataUrl) {
  const match = /^data:image\/png;base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) return null;
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (bytes.length < 80 || bytes.length > 500_000) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  return bytes;
}

function fileSlug(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "player";
}

async function sendWaiverEmail({ pdf, name, email, phone, age, birthdate, signedLabel }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { emailed: false, emailError: "RESEND_API_KEY is not set." };

  const recipients = [...new Set([email, process.env.WAIVER_TO || ORGANIZER_EMAIL])];
  const filename = `AAC-waiver-${fileSlug(name)}.pdf`;
  const lines = [
    `${name} signed the AAC plaza and on-ice waiver.`,
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Age: ${age}`,
    `Birthdate: ${birthdate}`,
    `Signed: ${signedLabel}`,
    "",
    "The signed waiver is attached.",
  ];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.WAIVER_FROM || "AAC Waivers <onboarding@resend.dev>",
      to: recipients,
      reply_to: email,
      subject: `AAC waiver signed — ${name}`,
      text: lines.join("\n"),
      attachments: [
        {
          filename,
          content: Buffer.from(pdf).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { emailed: false, emailError: detail.slice(0, 500) };
  }
  return { emailed: true, emailError: "" };
}

export default async (req, context) => {
  const storeName =
    context?.deploy?.context === "production" ? "aac-waivers" : "aac-waivers-preview";
  const store = getStore({ name: storeName, consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (!isAdmin(req)) return json({ error: "Wrong admin key." }, 401);

    if (url.searchParams.get("id")) {
      const id = clean(url.searchParams.get("id"), 80);
      const pdf = await store.get(`pdf/${id}`, { type: "arrayBuffer" });
      if (!pdf) return json({ error: "We couldn't find that waiver." }, 404);
      const meta = await store.get(`meta/${id}`, { type: "json" });
      const filename = `AAC-waiver-${fileSlug(meta?.name || "player")}.pdf`;
      return new Response(pdf, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    const { blobs } = await store.list({ prefix: "meta/" });
    const waivers = (
      await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })))
    )
      .filter((waiver) => waiver?.id && waiver?.name)
      .sort((a, b) => String(b.signedAt).localeCompare(String(a.signedAt)));
    return json({ waivers });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid request." }, 400);
  if (clean(body.company, 80)) return json({ ok: true, emailed: false });

  const name = clean(body.name, 80);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 30);
  const birthdate = clean(body.birthdate, 10);
  const age = ageInChicago(birthdate);
  const participantPng = decodePng(body.participantSignature);

  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email." }, 400);
  if (phone.replace(/\D/g, "").length < 10)
    return json({ error: "Please enter a phone number." }, 400);
  if (age == null || age < 1 || age > 100)
    return json({ error: "Please enter your birthdate." }, 400);
  if (body.ack !== true)
    return json({ error: "Please confirm that you have read the agreement." }, 400);
  if (!participantPng) return json({ error: "Please sign your name." }, 400);

  const { stamp, label } = signedStamp();
  let pdf;
  try {
    pdf = await buildWaiverPdf({
      name,
      age,
      birthdate: displayDate(birthdate),
      phone,
      email,
      signedDate: stamp,
      signedLabel: label,
      participantPng,
      parentPng: null,
    });
  } catch (error) {
    console.error("waiver pdf", error);
    return json({ error: "We couldn't prepare the waiver. Try again." }, 500);
  }

  const signedAt = new Date().toISOString();
  const id = `${signedAt}-${crypto.randomUUID().slice(0, 8)}`;
  const meta = {
    id,
    name,
    email,
    phone,
    age,
    birthdate,
    signedAt,
    signedLabel: label,
    emailed: false,
    emailError: "",
  };

  try {
    await store.set(`pdf/${id}`, pdf);
    await store.setJSON(`meta/${id}`, meta);
  } catch (error) {
    console.error("waiver save", error);
    return json({ error: "We couldn't save the waiver. Try again." }, 500);
  }

  let emailed = false;
  try {
    const result = await sendWaiverEmail({
      pdf,
      name,
      email,
      phone,
      age,
      birthdate: displayDate(birthdate),
      signedLabel: label,
    });
    emailed = result.emailed;
    meta.emailed = result.emailed;
    meta.emailError = result.emailError || "";
    if (!result.emailed) console.error("waiver email", result.emailError);
    await store.setJSON(`meta/${id}`, meta);
  } catch (error) {
    console.error("waiver email", error);
    meta.emailError = "Email failed.";
    try {
      await store.setJSON(`meta/${id}`, meta);
    } catch {
      // The PDF is already saved. Email status can be missing.
    }
  }

  return json({
    ok: true,
    id,
    emailed,
    filename: `AAC-waiver-${fileSlug(name)}.pdf`,
    pdf: Buffer.from(pdf).toString("base64"),
  });
};

export const config = {
  path: "/api/aac-waiver",
  includedFiles: ["netlify/functions/aac-waiver-template.pdf"],
};
