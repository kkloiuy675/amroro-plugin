const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// ------------------------------------------------------------------
// ROUTE 1: SILENT MASSIVE BUILDER (/api/build)
// Used when the user presses "GENERATE MASSIVE SYSTEM"
// Outputs ONLY Luau Code, no conversational text.
// ------------------------------------------------------------------
app.post('/api/build', async (req, res) => {
    try {
        const { prompt, genre, style } = req.body;
        if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const systemInstruction = `
            You are AMRORO AI ENGINE. Your objective is to write incredibly comprehensive, massive Luau scripts for Roblox Studio.
            CRITICAL: Output raw Luau code ONLY. Do NOT wrap the code in markdown (no \`\`\`lua). Do NOT output conversational text. 
            Include deep implementation, UI generation via script, datastores, and detailed mechanics.
        `;

        const finalPrompt = `
            Build the following system: ${prompt}
            Target Genre: ${genre || "General"}
            Target Style: ${style || "Modern"}
            Ensure all GUI, Server Scripts, and Local Scripts are generated within this single massive executable script.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: finalPrompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2,
                maxOutputTokens: 8192
            }
        });

        return res.status(200).json({
            success: true,
            code: response.text
        });

    } catch (error) {
        console.error("Build Error:", error);
        return res.status(500).json({ error: error.message });
    }
});

// ------------------------------------------------------------------
// ROUTE 2: CONVERSATIONAL CHAT ENGINE (/api/chat)
// Used in the AI Chat Tab.
// Talks to the user, and wraps code inside ```lua ``` tags so the plugin can extract it and show an EXECUTE button.
// ------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
    try {
        const { history } = req.body;
        if (!history || !Array.isArray(history)) {
            return res.status(400).json({ error: "Missing or invalid chat history." });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemInstruction = `
            You are AMRORO AI, an expert Roblox developer assistant integrated directly into Roblox Studio.
            Talk to the user conversationally. If they ask you to create a script, build a model, or make UI, provide your explanation, and then provide the full, executable Luau script wrapped strictly in \`\`\`lua and \`\`\` tags. 
            The plugin front-end will automatically detect the \`\`\`lua block and create an "Execute in Studio" button for the user.
        `;

        // Format history for the GenAI SDK
        const formattedHistory = history.map(msg => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }]
        }));

        // Initialize Chat session
        const chatSession = await ai.chats.create({
            model: "gemini-2.5-pro",
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6,
                maxOutputTokens: 8192
            },
            history: formattedHistory.slice(0, -1) // All but the last message
        });

        // Send the latest message
        const latestMessage = history[history.length - 1].content;
        const response = await chatSession.sendMessage({ message: latestMessage });

        return res.status(200).json({
            success: true,
            reply: response.text
        });

    } catch (error) {
        console.error("Chat Error:", error);
        return res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get('/api/health', (req, res) => res.status(200).send("AMRORO Engine Backend Online."));

// Export for Vercel
module.exports = app;