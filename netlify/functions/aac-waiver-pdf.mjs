import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const INK = rgb(0.1, 0.1, 0.12);
const QUIET = rgb(0.25, 0.25, 0.28);

// Underlines on the scanned Stars form, in PDF points (origin is the bottom-left).
// Text y is the baseline. Signature y is the bottom of the image.
const FIELDS = {
  participantSignature: { x: 158, y: 152, maxW: 200, maxH: 18 },
  participantDate: { x: 381, y: 151.2, size: 11, maxW: 105 },
  parentSignature: { x: 168, y: 127.6, maxW: 190, maxH: 18 },
  parentDate: { x: 381, y: 126.6, size: 11, maxW: 105 },
  name: { x: 104, y: 101.2, size: 12, maxW: 400 },
  age: { x: 71, y: 86.6, size: 12, maxW: 48 },
  birthdate: { x: 214, y: 86.6, size: 12, maxW: 120 },
  phone: { x: 100, y: 73, size: 12, maxW: 360 },
};

async function loadTemplate() {
  const candidates = [
    path.join(process.cwd(), "netlify/functions/aac-waiver-template.pdf"),
    "/var/task/netlify/functions/aac-waiver-template.pdf",
  ];
  if (import.meta.url) {
    candidates.unshift(fileURLToPath(new URL("./aac-waiver-template.pdf", import.meta.url)));
  }
  let lastError;
  for (const path of candidates) {
    try {
      return await readFile(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function drawFitted(page, font, text, field) {
  const value = String(text || "");
  if (!value) return;
  let size = field.size;
  while (size > 7 && font.widthOfTextAtSize(value, size) > field.maxW) size -= 0.5;
  page.drawText(value, {
    x: field.x,
    y: field.y,
    size,
    font,
    color: INK,
  });
}

async function drawSignature(doc, page, bytes, field) {
  if (!bytes) return;
  const image = await doc.embedPng(bytes);
  const scale = Math.min(field.maxW / image.width, field.maxH / image.height);
  page.drawImage(image, {
    x: field.x,
    y: field.y,
    width: image.width * scale,
    height: image.height * scale,
  });
}

export async function buildWaiverPdf(fields) {
  const doc = await PDFDocument.load(await loadTemplate());
  const page = doc.getPages()[0];
  const font = await doc.embedFont(StandardFonts.Helvetica);

  await drawSignature(doc, page, fields.participantPng, FIELDS.participantSignature);
  drawFitted(page, font, fields.signedDate, FIELDS.participantDate);
  if (fields.parentPng) {
    await drawSignature(doc, page, fields.parentPng, FIELDS.parentSignature);
    drawFitted(page, font, fields.signedDate, FIELDS.parentDate);
  }
  drawFitted(page, font, fields.name, FIELDS.name);
  drawFitted(page, font, String(fields.age), FIELDS.age);
  drawFitted(page, font, fields.birthdate, FIELDS.birthdate);
  drawFitted(page, font, fields.phone, FIELDS.phone);

  const footer = `Electronically signed ${fields.signedLabel} by ${fields.name} (${fields.email}).`;
  let footerSize = 8;
  while (footerSize > 6 && font.widthOfTextAtSize(footer, footerSize) > 520) footerSize -= 0.5;
  page.drawText(footer, {
    x: 48,
    y: 28,
    size: footerSize,
    font,
    color: QUIET,
  });

  doc.setTitle(`AAC waiver — ${fields.name}`);
  doc.setAuthor(fields.name);
  doc.setSubject("Release of liability, waiver of claims, indemnification, and arbitration agreement");
  return doc.save();
}
