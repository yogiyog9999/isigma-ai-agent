const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models
const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const AUTH_TOKEN = process.env.AUTH_TOKEN;

// In-memory DB (replace later with Supabase)
let db = [];

/**
 * 🔒 Middleware (Security)
 */
function checkAuth(req, res, next) {
  const token = req.headers.authorization;
  if (token !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * ✂️ Chunk text
 */
function chunk(text, size = 400) {
  let chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/**
 * 📥 SYNC (WordPress → Backend)
 */
app.post("/sync", checkAuth, async (req, res) => {
  try {
    const pages = req.body;

    db = [];

    for (let page of pages) {
      const chunks = chunk(page.content);

      for (let c of chunks) {
        const embedding = await embeddingModel.embedContent(c);

        db.push({
          text: c,
          vector: embedding.embedding.values,
          url: page.url,
          title: page.title
        });
      }
    }

    console.log("✅ Synced:", db.length, "chunks");

    res.json({ status: "synced", chunks: db.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sync failed" });
  }
});

/**
 * 🔍 Similarity (dot product)
 */
function similarity(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * 🔎 Search
 */
async function search(query) {
  const qEmbed = await embeddingModel.embedContent(query);
  const queryVector = qEmbed.embedding.values;

  return db
    .map(item => ({
      ...item,
      score: similarity(queryVector, item.vector)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * 🎤 ASK (Vapi)
 */
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!db.length) {
      return res.json({
        answer: "Knowledge base is not ready yet. Please try later."
      });
    }

    const results = await search(question);
    const context = results.map(r => r.text).join("\n");

    const prompt = `
You are a voice assistant for CIPR Communications.

Rules:
- Answer ONLY from context
- Keep answers short (2-3 lines)
- Speak like human (not robotic)
- If not found say: I couldn't find that on the website

Context:
${context}

Question:
${question}
`;

    const result = await chatModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      answer: text,
      source: results[0]?.url || null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ask failed" });
  }
});

/**
 * ❤️ Health check (Railway)
 */
app.get("/", (req, res) => {
  res.send("CIPR AI Backend Running 🚀 (Gemini)");
});

/**
 * 🚀 Start server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
