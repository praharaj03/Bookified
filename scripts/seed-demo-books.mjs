import nextEnv from "@next/env";
import { MongoClient, ObjectId } from "mongodb";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, readFile, writeFile } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI before importing demo books.");
const owner = "bookified_public_demo";
const output = new URL("../public/demo/", import.meta.url);
await mkdir(output, { recursive: true });

const demos = [
  {
    id: 11, name: "alice", slug: "demo-alice-in-wonderland",
    title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", year: "1865",
    titleLines: ["Alice's", "Adventures in", "Wonderland"], background: "#173f49", accent: "#d7bb82",
    mirror: "https://raw.githubusercontent.com/GITenberg/Alice-s-Adventures-in-Wonderland_11/master/11.txt",
    summary: "Alice follows a hurried White Rabbit down a rabbit hole and enters a world where familiar rules no longer work. She changes size, talks with strange animals, meets the Cheshire Cat, and joins a tea party where time seems to have stopped. Her attempts to make sense of each encounter reveal the contradictions in Wonderland's language, manners, and authority.\n\nThe Queen of Hearts rules through threats rather than reason. At a chaotic trial, Alice begins to challenge the proceedings instead of accepting them. As she grows more confident, the extraordinary world gives way to an ordinary one: she wakes beside her sister and realizes she has been dreaming.\n\nThe novel explores identity, curiosity, growing up, and the gap between rules and fairness. Its jokes and puzzles invite readers to question assumptions and notice how words can confuse as well as explain. This prepared demo summary describes the complete novel; use questions to explore particular characters or scenes.",
  },
  {
    id: 1661, name: "sherlock-holmes", slug: "demo-adventures-of-sherlock-holmes",
    title: "The Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", year: "1892",
    titleLines: ["The Adventures", "of Sherlock", "Holmes"], background: "#4b2e36", accent: "#d4b47b",
    mirror: "https://raw.githubusercontent.com/GITenberg/The-Adventures-of-Sherlock-Holmes_1661/master/1661.txt",
    summary: "This collection contains twelve mysteries featuring Sherlock Holmes, usually narrated by his friend Dr. Watson. Clients arrive at Baker Street with puzzling problems involving reputation, inheritance, deceit, danger, and disappearance. Holmes combines careful observation with practical investigation, while Watson records both the discoveries and the detective's unusual habits.\n\nThe stories include A Scandal in Bohemia, where Irene Adler outmaneuvers Holmes; The Red-Headed League, whose absurd employment scheme conceals a robbery; and The Adventure of the Speckled Band, in which a young woman fears a repetition of her sister's mysterious death. Each story has its own resolution rather than forming a single continuous plot.\n\nAcross the collection, appearances often mislead, small details matter, and understanding people's motives is as valuable as identifying physical clues. Holmes sometimes distinguishes justice from strict legal punishment. Watson's perspective makes the reader a companion in discovery. This prepared demo summary covers the collection; ask about a particular story, clue, or character to explore it in detail.",
  },
];

function printable(text) {
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "--").normalize("NFKD").replace(/[^\x20-\x7e\n]/g, "");
}
function color(hex) {
  return rgb(...[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255));
}
function wrap(text, font, size, width) {
  const lines = [];
  for (const paragraph of printable(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function sourceText(book) {
  const target = new URL(`${book.name}-original.txt`, output);
  try { return await readFile(target, "utf8"); } catch { /* Download on the first run. */ }
  const urls = [`https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`, book.mirror];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length < 50000 || !/project gutenberg/i.test(text) || !/end of (?:the|this) project gutenberg/i.test(text)) continue;
      await writeFile(target, text, "utf8");
      return text;
    } catch { /* Try the documented Gutenberg mirror next. */ }
  }
  throw new Error(`Could not download the complete public-domain text for ${book.name}.`);
}

function coverSVG(book) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
    <rect width="600" height="900" fill="${book.background}"/>
    <rect x="28" y="28" width="544" height="844" fill="none" stroke="${book.accent}" stroke-width="2"/>
    <text x="300" y="105" text-anchor="middle" font-family="Georgia,serif" font-size="16" letter-spacing="5" fill="${book.accent}">BOOKIFIED CLASSICS</text>
    <circle cx="300" cy="252" r="66" fill="none" stroke="${book.accent}" stroke-width="3"/>
    <circle cx="300" cy="252" r="48" fill="none" stroke="${book.accent}" opacity="0.5"/>
    <path d="M268 238 Q285 227 300 238 Q315 227 332 238 L332 272 Q315 261 300 272 Q285 261 268 272 Z M300 238 L300 272" fill="none" stroke="${book.accent}" stroke-width="3"/>
    ${book.titleLines.map((line, index) => `<text x="300" y="${420 + index * 66}" text-anchor="middle" font-family="Georgia,serif" font-size="49" fill="#fff8ed">${line}</text>`).join("")}
    <line x1="225" y1="665" x2="375" y2="665" stroke="${book.accent}"/>
    <text x="300" y="725" text-anchor="middle" font-family="Georgia,serif" font-size="24" fill="${book.accent}">${book.author}</text>
    <text x="300" y="800" text-anchor="middle" font-family="Georgia,serif" font-size="15" letter-spacing="3" fill="${book.accent}">${book.year} · COMPLETE TEXT</text>
  </svg>`;
}

async function makePDF(book, raw) {
  const start = raw.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  const end = raw.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*/i);
  if (!start || !end || start.index >= end.index) throw new Error(`Missing source boundaries for ${book.name}.`);
  const body = raw.slice(start.index + start[0].length, end.index).trim();
  const license = raw.slice(end.index);
  const pdf = await PDFDocument.create();
  pdf.setTitle(book.title); pdf.setAuthor(book.author);
  pdf.setSubject(`Public-domain demo edition. Source: https://www.gutenberg.org/ebooks/${book.id}`);
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const cover = pdf.addPage([600, 900]);
  cover.drawRectangle({ x: 0, y: 0, width: 600, height: 900, color: color(book.background) });
  cover.drawRectangle({ x: 28, y: 28, width: 544, height: 844, borderColor: color(book.accent), borderWidth: 2 });
  const centered = (text, y, size, font = regular, fill = color(book.accent)) => cover.drawText(text, { x: (600 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: fill });
  centered("BOOKIFIED CLASSICS", 790, 16);
  cover.drawCircle({ x: 300, y: 645, size: 64, borderColor: color(book.accent), borderWidth: 2 });
  centered("READ", 637, 22);
  book.titleLines.forEach((line, index) => centered(line, 480 - index * 66, 46, bold, rgb(1, 0.97, 0.92)));
  centered(book.author, 175, 24);
  centered(`${book.year} - COMPLETE TEXT`, 100, 15);
  const segments = [];

  function addPages(text, searchable) {
    const lines = wrap(text.replace(/\r\n/g, "\n"), regular, 11, 485);
    for (let offset = 0; offset < lines.length; offset += 46) {
      const pageLines = lines.slice(offset, offset + 46);
      const page = pdf.addPage([595, 842]);
      const pageNumber = pdf.getPageCount();
      page.drawText(book.title, { x: 55, y: 807, size: 8, font: regular, color: rgb(0.4, 0.4, 0.4) });
      pageLines.forEach((line, index) => {
        if (line) page.drawText(line, { x: 55, y: 772 - index * 15.5, size: 11, font: regular });
      });
      page.drawText(`${pageNumber}`, { x: 290, y: 33, size: 9, font: regular });
      if (searchable) {
        const words = pageLines.join(" ").split(/\s+/).filter(Boolean);
        for (let index = 0; index < words.length; index += 500) {
          const passage = words.slice(index, index + 500);
          segments.push({ content: passage.join(" "), segmentIndex: segments.length, pageNumber, wordCount: passage.length });
        }
      }
    }
  }
  addPages(body, true);
  addPages(`SOURCE AND LICENSE\n\nComplete text from Project Gutenberg ebook ${book.id}.\nhttps://www.gutenberg.org/ebooks/${book.id}\n\nCover and pagination prepared by Bookified. The original source text and license are also provided alongside this PDF.\n\n${license}`, false);
  const bytes = await pdf.save();
  await writeFile(new URL(`${book.name}.pdf`, output), bytes);
  await writeFile(new URL(`${book.name}-cover.svg`, output), coverSVG(book), "utf8");
  return { segments, fileSize: bytes.length, pages: pdf.getPageCount() };
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db("bookified");
  for (const demo of demos) {
    const raw = await sourceText(demo);
    const { segments, fileSize, pages } = await makePDF(demo, raw);
    const existing = await db.collection("books").findOne({ slug: demo.slug });
    if (existing && !existing.isDemo) throw new Error("A private book already uses a demo slug; no record was changed.");
    const bookId = existing?._id ?? new ObjectId();
    const now = new Date();
    await db.collection("books").updateOne({ _id: bookId }, { $setOnInsert: { createdAt: now, totalSegments: 0 }, $set: { clerkId: owner, title: demo.title, author: demo.author, slug: demo.slug, persona: "george", isDemo: true, sourceURL: `https://www.gutenberg.org/ebooks/${demo.id}`, fileURL: `/demo/${demo.name}.pdf`, fileBlobKey: `demo/${demo.name}.pdf`, coverURL: `/demo/${demo.name}-cover.svg`, fileSize, summary: demo.summary, summaryModel: "prepared-demo-summary", updatedAt: now } }, { upsert: true });
    for (let offset = 0; offset < segments.length; offset += 100) {
      await db.collection("booksegments").bulkWrite(segments.slice(offset, offset + 100).map((segment) => ({ updateOne: { filter: { bookId, segmentIndex: segment.segmentIndex }, update: { $set: { ...segment, clerkId: owner, updatedAt: now }, $setOnInsert: { createdAt: now } }, upsert: true } })));
    }
    await db.collection("booksegments").deleteMany({ bookId, clerkId: owner, segmentIndex: { $gte: segments.length } });
    await db.collection("books").updateOne({ _id: bookId }, { $set: { totalSegments: segments.length } });
    console.log(`${demo.title}: ${pages} PDF pages, ${segments.length} searchable passages, cover and source license included.`);
  }
  await db.collection("booksegments").createIndex({ bookId: 1, content: "text" });
  console.log("Both public demo books are ready. Personal uploads were preserved.");
} catch (error) {
  console.error("Demo import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally { await client.close(); }
