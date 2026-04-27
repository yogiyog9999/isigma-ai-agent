const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
        const embedding = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: c
        });

        db.push({
          text: c,
          vector: embedding.data[0].embedding,
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
 * 🔍 Similarity
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
  const qEmbed = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  });

  return db
    .map(item => ({
      ...item,
      score: similarity(qEmbed.data[0].embedding, item.vector)
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a voice assistant for CIPR Communications.

Rules:
- Answer ONLY from context
- Keep answers short (2-3 lines)
- Speak like human (not robotic)
- If not found say: I couldn't find that on the website
`
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion:${question}`
        }
      ]
    });

    res.json({
      answer: completion.choices[0].message.content,
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
  res.send("CIPR AI Backend Running 🚀");
});

/**
 * 🚀 Start server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
