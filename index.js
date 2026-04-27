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
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
    // 💡 This line checks both Vapi's structure and direct Postman tests
    const question = req.body.message?.toolCalls?.[0]?.function?.arguments?.question 
                  || req.body.question;

    if (!question) {
      console.log("No question found in request body:", req.body);
      return res.json({ result: "I didn't receive a question. Please try again." });
    }

    const results = await search(question);
    
    // Fallback if no context found
    const context = results.length > 0 
      ? results.map(r => r.text).join("\n") 
      : "No specific info found.";

    const prompt = `You are a voice assistant for Isigma Silutions.
Answer in 1 sentence based on context: ${context}
User: ${question}`;

    const result = await chatModel.generateContent(prompt);
    const text = result.response.text();

    res.json({ result: text.trim() });

  } catch (err) {
    // 🔍 This log in Railway will tell you EXACTLY why it failed
    console.error("CRITICAL ERROR IN /ASK:", err.message);
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
