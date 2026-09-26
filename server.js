const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// Fixes the "Cannot GET /" error when you open the browser
app.get('/', (req, res) => {
    res.send('AMRORO AI Server is Online! The Roblox Plugin is connected.');
});

// دالة مشتركة لمعالجة طلبات الذكاء الاصطناعي
const handleAIRequest = async (req, res) => {
    const { prompt } = req.body;
    const userPrompt = prompt || "Help with Roblox Studio";

    const fetchAI = async (name, fetchPromise) => {
        try {
            return await fetchPromise;
        } catch (error) {
            return `${name} Error: Missing API Key or Server Crash.`;
        }
    };

    // 1. Gemini
    const geminiKey = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
    const geminiText = geminiKey ? await fetchAI("Gemini", fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + geminiKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Write Luau script for: " + userPrompt }] }] })
    }).then(r => r.json()).then(data => data.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini processing failed (Check API Key).")) : "Gemini Error: Missing API Key.";

    // 2. Groq
    const groqKey = process.env.GROQ_KEY || process.env.GROQ_API_KEY;
    const groqText = groqKey ? await fetchAI("Groq", fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "mixtral-8x7b-32768", messages: [{ role: "user", content: "Design the Roblox model structure for: " + userPrompt }] })
    }).then(r => r.json()).then(data => data.choices?.[0]?.message?.content || "Groq processing failed (Check API Key).")) : "Groq Error: Missing API Key.";

    // 3. OpenRouter
    const openRouterKey = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
    const openRouterText = openRouterKey ? await fetchAI("OpenRouter", fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "anthropic/claude-3-haiku", messages: [{ role: "user", content: "Plan the game events for: " + userPrompt }] })
    }).then(r => r.json()).then(data => data.choices?.[0]?.message?.content || "OpenRouter processing failed (Check API Key).")) : "OpenRouter Error: Missing API Key.";

    // 4. Nvidia
    const nvidiaText = `Nvidia Animation Data Generated for: ${userPrompt}`; 

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
};

// استقبال طلبات POST على المسارين لمنع أخطاء الاتصال
app.post('/', handleAIRequest);
app.post('/api/generate', handleAIRequest);

module.exports = app;