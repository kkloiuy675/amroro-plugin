require('dotenv').config();

// BLOCK LOCAL CMD EXECUTION (Only runs on Vercel)
if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  console.error("❌ ERROR: Local CMD execution is disabled for AMRORO Engine Pro.");
  console.error("👉 Deployment is restricted strictly to Vercel Serverless Cloud & GitHub!");
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/genai');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Root Status Check
app.get('/', (req, res) => {
  res.status(200).send("AMRORO Roblox AI Backend Active & Running");
});

// Autonomous Build Generation Route
app.post('/generate', async (req, res) => {
  try {
    const { prompt, gameContext, guiStyle } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const aiPrompt = `You are AMRORO AI, an expert Luau Roblox developer. 
Create a complete, fully functional Luau script for Roblox Studio.
Prompt: "${prompt}"
Context: "${gameContext || 'None'}"
GUI Style: "${guiStyle || 'Modern Glossy Neon'}"

Return ONLY valid executable Luau code wrapped inside markdown code blocks (\`\`\`lua ... \`\`\`). Do not include preamble text.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY || GEMINI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [{ role: "user", content: aiPrompt }]
      })
    });

    const data = await response.json();
    const replyText = data?.choices?.[0]?.message?.content || "";

    res.json({
      code: replyText,
      summary: `Successfully generated system for: "${prompt.substring(0, 45)}..."`
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to process build request." });
  }
});

// AI Interactive Chat Route
app.post('/chat', async (req, res) => {
  try {
    const { prompt, history, style } = req.body;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY || GEMINI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          { role: "system", content: `You are AMRORO AI Assistant for Roblox Studio. Style context: ${style}` },
          ...(history || []).map(h => ({ role: h.role === "model" ? "assistant" : "user", content: h.content })),
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await response.json();
    const replyText = data?.choices?.[0]?.message?.content || "No response received.";

    res.json({ reply: replyText });
  } catch (error) {
    res.status(500).json({ error: error.message || "Chat request failed." });
  }
});

// Auto-Fix Engine Route
app.post('/auto-fix', async (req, res) => {
  try {
    const { fullOutputLog } = req.body;

    const fixPrompt = `Fix the following broken Luau script for Roblox Studio based on the error log provided:
${fullOutputLog}

Return ONLY the corrected Luau code wrapped inside \`\`\`lua ... \`\`\` code blocks.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY || GEMINI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [{ role: "user", content: fixPrompt }]
      })
    });

    const data = await response.json();
    const code = data?.choices?.[0]?.message?.content || "";

    res.json({
      code: code,
      summary: "Auto-fix applied successfully!"
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Auto-fix failed." });
  }
});

module.exports = app;
