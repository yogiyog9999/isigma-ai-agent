const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * 2026 MODEL SELECTION
 * Using the latest stable IDs as of April 2026
 */
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
const chatModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

const AUTH_TOKEN = process.env.AUTH_TOKEN;

// In-memory DB (Important: Data resets on Railway restart)
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
function chunk(text, size = 500) {
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
    db = []; // Clear old data for fresh sync

    for (let page of pages) {
      const chunks = chunk(page.content);

      for (let c of chunks) {
        // 2026 Format: Add task instruction inside the text part
        const result = await embeddingModel.embedContent({
          content: { parts: [{ text: `task: retrieval_document | text: ${c}` }] }
        });

        db.push({
          text: c,
          vector: result.embedding.values,
          url: page.url,
          title: page.title
        });
      }
    }

    console.log(`✅ Synced: ${db.length} chunks using Gemini Embedding 2`);
    res.json({ status: "synced", chunks: db.length });

  } catch (err) {
    console.error("Sync Error:", err);
    res.status(500).json({ error: "Sync failed - check model availability" });
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
/**
 * 🔎 Search (2026 Optimized)
 */
async function search(query) {
  try {
    // Wrap text in the required 2026 object structure
    const qEmbed = await embeddingModel.embedContent({
      content: { parts: [{ text: `task: retrieval_query | query: ${query}` }] }
    });
    
    const queryVector = qEmbed.embedding.values;

    if (!db || db.length === 0) return [];

    return db
      .map(item => ({
        ...item,
        score: similarity(queryVector, item.vector)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } catch (err) {
    console.error("Search failed:", err);
    return [];
  }
}

/**
 * 🎤 ASK (Fixed for Vapi 2026 Payload)
 */
app.post("/ask", async (req, res) => {
  try {
    // Vapi sends the query inside message.toolCalls[0].function.arguments.question
    // This helper handles both Postman (direct) and Vapi (nested) requests
    const question = req.body.message?.toolCall?.function?.arguments?.question || req.body.question;

    if (!question) {
      return res.json({ result: "I didn't catch the question. Could you repeat that?" });
    }

    if (db.length === 0) {
      return res.json({ result: "I'm still learning the website content. Please ask me again in a minute." });
    }

    const results = await search(question);
    
    if (results.length === 0) {
       return res.json({ result: "I couldn't find that specific information on the website." });
    }

    const context = results.map(r => r.text).join("\n");

    const prompt = `You are a voice assistant for CIPR Communications.
Rules: Answer ONLY from context. Keep it under 15 words.
Context: ${context}
Question: ${question}`;

    const result = await chatModel.generateContent(prompt);
    const text = result.response.text();

    // 🚨 IMPORTANT: Vapi 2026 specifically looks for the "result" key
    res.json({
      result: text.trim()
    });

  } catch (err) {
    console.error("Critical Ask Error:", err);
    res.json({ result: "I'm having a technical glitch. How else can I help?" });
  }
});

/**
 * ❤️ Health Check
 */
app.get("/", (req, res) => {
  res.send("CIPR AI Backend 2026 is Online 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
