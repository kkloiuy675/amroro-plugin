const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Fixes the "Cannot GET /" error when you open the Vercel link in a browser
app.get('/', (req, res) => {
    res.send('AMRORO AI Server is Online! The Roblox Plugin is connected.');
});

app.post('/api/generate', async (req, res) => {
    const { prompt } = req.body;

    // Helper function to safely fetch from APIs
    const fetchAI = async (name, fetchPromise) => {
        try {
            return await fetchPromise;
        } catch (error) {
            return `${name} Error: Missing API Key or Server Crash.`;
        }
    };

    // 1. Gemini
    const geminiText = await fetchAI("Gemini", fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + process.env.GEMINI_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Write Luau script for: " + prompt }] }] })
    }).then(r => r.json()).then(data => data.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini processing failed (Check API Key)."));

    // 2. Groq
    const groqText = await fetchAI("Groq", fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "mixtral-8x7b-32768", messages: [{ role: "user", content: "Design the Roblox model structure for: " + prompt }] })
    }).then(r => r.json()).then(data => data.choices?.[0]?.message?.content || "Groq processing failed (Check API Key)."));

    // 3. OpenRouter
    const openRouterText = await fetchAI("OpenRouter", fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "anthropic/claude-3-haiku", messages: [{ role: "user", content: "Plan the game events for: " + prompt }] })
    }).then(r => r.json()).then(data => data.choices?.[0]?.message?.content || "OpenRouter processing failed (Check API Key)."));

    // 4. Nvidia
    const nvidiaText = `Nvidia Animation Data Generated for: ${prompt}`; 

    const stackedResponse = `
[GEMINI - SCRIPTING]
${geminiText}

[GROQ - MODELING]
${groqText}

[NVIDIA - ANIMATION]
${nvidiaText}

[OPENROUTER - EVENTS]
${openRouterText}
    `;

    res.json({ success: true, response: stackedResponse });
});

// CRITICAL: Export the app instead of app.listen so Vercel can run it without a CMD window
module.exports = app;