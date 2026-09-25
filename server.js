require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Universal AI Caller (Tries OpenRouter first, falls back to direct Gemini API)
async function callAI(systemPrompt, userPrompt) {
  if (OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-lite-001",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      });
      const data = await response.json();
      if (data?.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
    } catch (e) {
      console.warn("OpenRouter API failed, falling back to direct Gemini API...", e.message);
    }
  }

  if (GEMINI_API_KEY) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nUser Request: ${userPrompt}` }]
        }]
      })
    });
    const data = await response.json();
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    if (data?.error) {
      throw new Error(`Gemini API Error: ${data.error.message}`);
    }
  }

  throw new Error("No valid API Key configured on Vercel environment variables.");
}

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: "OK", message: "AMRORO AI Backend is live on Vercel!" });
});

// Build generation endpoint
app.post('/generate', async (req, res) => {
  try {
    const { prompt, gameContext, guiStyle } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const systemPrompt = `You are AMRORO AI, an expert Roblox Studio Luau developer.
Rules:
1. Return strictly executable Luau code inside markdown blocks (\`\`\`lua ... \`\`\`).
2. Explicitly parent created instances directly to 'workspace' or 'game.StarterGui' (e.g. local p = Instance.new("Part"); p.Parent = workspace). Never rely on 'script.Parent'.
3. Do not include introductory text outside code blocks.`;

    const userPrompt = `Build Request: "${prompt}"\nContext: "${gameContext || 'None'}"\nGUI Style: "${guiStyle || 'Modern Glossy Neon'}"`;
    const replyText = await callAI(systemPrompt, userPrompt);

    res.json({
      code: replyText,
      summary: `Successfully generated system for: "${prompt.substring(0, 45)}..."`
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to process build request." });
  }
});

// Interactive chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { prompt, history, style } = req.body;

    const systemPrompt = `You are AMRORO AI Assistant inside Roblox Studio.
Help the user code, debug, and build assets.
Style Context: ${style || "Modern Glossy Neon"}
When writing Luau code, wrap it inside \`\`\`lua ... \`\`\` and make sure all 3D parts set 'part.Parent = workspace'.`;

    let fullHistoryPrompt = "";
    if (history && Array.isArray(history)) {
      fullHistoryPrompt = history.map(h => `${h.role === 'model' ? 'AI' : 'User'}: ${h.content}`).join('\n');
    }
    fullHistoryPrompt += `\nUser: ${prompt}`;

    const replyText = await callAI(systemPrompt, fullHistoryPrompt);

    res.json({ reply: replyText });
  } catch (error) {
    res.status(500).json({ error: error.message || "Chat request failed." });
  }
});

// Auto-fix endpoint
app.post('/auto-fix', async (req, res) => {
  try {
    const { fullOutputLog } = req.body;

    const systemPrompt = `You are AMRORO Code Repair Engine for Roblox Studio.
Fix broken Luau code based on error log. Ensure all instances set 'Parent = workspace'. Return ONLY corrected code inside \`\`\`lua ... \`\`\`.`;

    const replyText = await callAI(systemPrompt, `Error Log & Broken Code:\n${fullOutputLog}`);

    res.json({
      code: replyText,
      summary: "Auto-fix applied successfully!"
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Auto-fix failed." });
  }
});

module.exports = app;
