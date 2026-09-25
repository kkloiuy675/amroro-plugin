require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Health Check Endpoint (GET /)
app.get('/', (req, res) => {
    res.json({ status: "OK", message: "AMRORO AI Backend is live on Vercel!" });
});

// Universal AI Caller (Tries OpenRouter first, falls back to direct Gemini API)
async function callAI(systemPrompt, userPrompt) {
    // 1. Try OpenRouter First
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
                        { role: "system", content: systemPrompt || "You are AMRORO AI, an expert Roblox Studio Luau developer." },
                        { role: "user", content: userPrompt }
                    ]
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data?.choices?.[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
            } else {
                const errText = await response.text();
                console.warn("OpenRouter API returned error status:", response.status, errText);
            }
        } catch (e) {
            console.warn("OpenRouter API call failed, falling back to Gemini API...", e.message);
        }
    }

    // 2. Fallback to direct Gemini API
    if (GEMINI_API_KEY) {
        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${systemPrompt || 'You are AMRORO AI, an expert Roblox Studio Luau developer.'}\n\nUser Request: ${userPrompt}` }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            } else {
                const errText = await response.text();
                console.error("Gemini Direct API error status:", response.status, errText);
            }
        } catch (e) {
            console.error("Direct Gemini API call failed:", e.message);
        }
    }

    throw new Error("AI request failed. Please check your OPENROUTER_API_KEY or GEMINI_API_KEY in Vercel Environment Variables.");
}

// Request Handler
async function handleAIRequest(req, res) {
    try {
        const { systemPrompt, userPrompt, prompt, message } = req.body;
        const finalUserPrompt = userPrompt || prompt || message;
        const finalSystemPrompt = systemPrompt || "You are AMRORO AI, an expert Roblox Studio Luau script generator.";

        if (!finalUserPrompt) {
            return res.status(400).json({ error: "Missing prompt or userPrompt in request body" });
        }

        const aiResponse = await callAI(finalSystemPrompt, finalUserPrompt);
        
        // Return multiple common key names to support various plugin UI requirements
        return res.json({ 
            result: aiResponse, 
            answer: aiResponse, 
            response: aiResponse,
            content: aiResponse 
        });
    } catch (error) {
        console.error("Server Error:", error.message);
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
}

// Support all common endpoint paths used by Roblox plugins
app.post('/api/chat', handleAIRequest);
app.post('/chat', handleAIRequest);
app.post('/api/generate', handleAIRequest);
app.post('/generate', handleAIRequest);
app.post('/api/deep-build', handleAIRequest);
app.post('/deep-build', handleAIRequest);

// Required for Vercel deployment
module.exports = app;

// Local testing listener
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`AMRORO AI server running on port ${PORT}`));
}
