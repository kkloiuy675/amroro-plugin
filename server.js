const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Load API Keys from Vercel Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const GROQ_API_KEY = process.env.GROQ_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_KEY;

app.post('/api/generate', async (req, res) => {
    const { prompt } = req.body;

    try {
        // 1. Gemini (Scripting Logic)
        const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + GEMINI_API_KEY, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Write Luau script for: " + prompt }] }] })
        }).then(r => r.json());

        // 2. Groq (Modeling & Architecture)
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "mixtral-8x7b-32768", messages: [{ role: "user", content: "Design the Roblox model structure for: " + prompt }] })
        }).then(r => r.json());

        // 3. OpenRouter (Events & Game Flow)
        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "anthropic/claude-3-haiku", messages: [{ role: "user", content: "Plan the game events for: " + prompt }] })
        }).then(r => r.json());

        // 4. Nvidia (Animations & Math) - Simulated endpoint structure
        const nvidiaRes = "Nvidia Animation Data Generated for: " + prompt; 

        // Stack the text responses
        const stackedResponse = `
[GEMINI - SCRIPTING]
${geminiRes.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini processing failed."}

[GROQ - MODELING]
${groqRes.choices?.[0]?.message?.content || "Groq processing failed."}

[NVIDIA - ANIMATION]
${nvidiaRes}

[OPENROUTER - EVENTS]
${openRouterRes.choices?.[0]?.message?.content || "OpenRouter processing failed."}
        `;

        res.json({ success: true, response: stackedResponse });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AMRORO AI Backend running on port ${PORT}`));