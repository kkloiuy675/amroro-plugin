const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// System prompt instructing AI to output executable Luau code for Roblox Studio
const SYSTEM_PROMPT = `You are AMRORO AI Engine Pro, an expert Roblox Luau script generator.
When asked to generate builds or scripts, respond strictly with executable Luau code inside standard Markdown code blocks:
\`\`\`luau
-- Your Luau Code Here
\`\`\`
Do not include extra chat preamble before or after code blocks when generating builds.`;

// 1. Root / Status Endpoint
app.get('/', (req, res) => {
    res.json({
        status: "Active & Operational",
        hasOpenRouter: !!process.env.OPENROUTER_API_KEY,
        hasGemini: !!process.env.GEMINI_API_KEY,
        hasGroq: !!process.env.GROQ_API_KEY,
        hasNvidia: !!process.env.NVIDIA_API_KEY
    });
});

// Helper Function: Call AI API directly with fallback handling
async function callAiProvider(prompt, isBuildMode = false) {
    // Attempt 1: OpenRouter (Primary)
    if (process.env.OPENROUTER_API_KEY) {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "google/gemini-2.0-flash-001",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: prompt }
                    ]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.choices?.[0]?.message?.content || "";
                if (text) return text;
            }
        } catch (e) {
            console.error("OpenRouter Error:", e);
        }
    }

    // Attempt 2: Direct Gemini REST API (Fallback)
    if (process.env.GEMINI_API_KEY) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Request:${prompt}` }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text) return text;
            }
        } catch (e) {
            console.error("Gemini Error:", e);
        }
    }

    // Default Luau fallback block if API keys fail or are unset
    if (isBuildMode) {
        return `\`\`\`luau
local part = Instance.new("Part")
part.Size = Vector3.new(4, 4, 4)
part.Position = Vector3.new(0, 10, 0)
part.Anchored = true
part.Material = Enum.Material.Neon
part.BrickColor = BrickColor.new("Electric blue")
part.Name = "AMRORO_Generated_Part"
part.Parent = workspace
\`\`\``;
    }

    return "AMRORO AI: Unable to reach AI providers. Please ensure OPENROUTER_API_KEY or GEMINI_API_KEY is configured in Vercel settings.";
}

// 2. Deep Build Endpoint (/deep-build)
app.post('/deep-build', async (req, res) => {
    try {
        const userPrompt = req.body.userPrompt || req.body.prompt || req.body.message || "MAKE A PART";
        const assetReference = req.body.assetReference || "";

        const combinedPrompt = assetReference 
            ? `Create Luau code for: ${userPrompt}. Reference Asset/ID: ${assetReference}`
            : `Create Luau code for: ${userPrompt}`;

        const resultText = await callAiProvider(combinedPrompt, true);

        res.json({
            status: "success",
            code: resultText,
            luauCode: resultText,
            answer: resultText
        });
    } catch (error) {
        console.error("Deep Build Endpoint Exception:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

// 3. AI Chat Endpoint (/chat)
app.post('/chat', async (req, res) => {
    try {
        const userPrompt = req.body.userPrompt || req.body.prompt || req.body.message || "Hello";

        const resultText = await callAiProvider(userPrompt, false);

        res.json({
            status: "success",
            answer: resultText,
            response: resultText,
            result: resultText
        });
    } catch (error) {
        console.error("Chat Endpoint Exception:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

// 4. Pipeline / Auto-Fix Endpoint (/pipeline)
app.post('/pipeline', async (req, res) => {
    try {
        const userPrompt = req.body.userPrompt || req.body.prompt || "Auto repair workspace";
        const resultText = await callAiProvider(`Fix and optimize Luau code for: ${userPrompt}`, true);

        res.json({
            status: "success",
            code: resultText,
            luauCode: resultText
        });
    } catch (error) {
        console.error("Pipeline Endpoint Exception:", error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

// Export Express App for Vercel Serverless Platform
module.exports = app;

// Local Development Port Listener
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`AMRORO Server running on port ${PORT}`));
}
