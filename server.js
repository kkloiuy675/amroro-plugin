const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Enables communication with Roblox Studio

// Vercel securely injects these environment variables at runtime. 
// No keys are stored in your code or plugin!
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

app.post('/api/chat', async (req, res) => {
    try {
        const { message, ai_model } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, error: "Message is required." });
        }

        let responseText = "";

        if (ai_model === "Gemini") {
            if (!GEMINI_KEY) throw new Error("Gemini processing failed (Check API Key).");
            
            // Example fetch request to Gemini API endpoint
            const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] })
            });
            const data = await apiRes.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

        } else if (ai_model === "Groq") {
            if (!GROQ_KEY) throw new Error("Groq processing failed (Check API Key).");
            
            // Example fetch request to Groq API endpoint
            const apiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: message }]
                })
            });
            const data = await apiRes.json();
            responseText = data.choices?.[0]?.message?.content || "No response generated.";

        } else if (ai_model === "OpenRouter") {
            if (!OPENROUTER_KEY) throw new Error("OpenRouter processing failed (Check API Key).");
            
            // Example fetch request to OpenRouter API endpoint
            const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENROUTER_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek/deepseek-chat",
                    messages: [{ role: "user", content: message }]
                })
            });
            const data = await apiRes.json();
            responseText = data.choices?.[0]?.message?.content || "No response generated.";

        } else {
            return res.status(400).json({ success: false, error: "Invalid AI model selected." });
        }

        res.json({ success: true, text: responseText });

    } catch (error) {
        console.error("Backend Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Required so Vercel can export and run the serverless function properly
module.exports = app;