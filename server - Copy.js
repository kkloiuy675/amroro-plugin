require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Google Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// System Instructions for Luau Code Generation
const LUAU_SYSTEM_INSTRUCTION = `
You are AMRORO AI, an expert Roblox Studio Luau developer and UI builder.
Your task is to generate fully functional, robust, and clean Roblox Luau code.

RULES:
1. Always return code compatible with Roblox Studio Luau.
2. Use modern Roblox APIs (e.g., task.wait, Task.spawn, TweenService, UserInputService).
3. If building UI elements, apply dark/neon theme styling unless specified otherwise.
4. Ensure code is enclosed inside standard markdown blocks (\`\`\`lua ... \`\`\`).
5. Include brief inline comments explaining key logic.
`;

// ============================================================================
// 1. BUILD ENDPOINT (/api/build)
// Handles: Full Luau Generation, Auto-Fix Repair, Asset Import & Model Export
// ============================================================================
app.post('/api/build', async (req, res) => {
    try {
        const { prompt, referenceUrl, genre, style } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required.' });
        }

        const cleanPrompt = prompt.trim();
        const lowerPrompt = cleanPrompt.toLowerCase();

        // --- Intent Routing: Export Signal ---
        if (lowerPrompt.includes('export selected') || lowerPrompt.includes('export model') || lowerPrompt.includes('export selection')) {
            return res.json({
                actionType: 'EXPORT',
                summary: 'Export command recognized. Processing selected models in Explorer...'
            });
        }

        // --- Intent Routing: Pure Import / Asset ID Signal ---
        if ((referenceUrl && referenceUrl.trim().length > 0) && (lowerPrompt.includes('import asset') || lowerPrompt.includes('load model'))) {
            return res.json({
                actionType: 'IMPORT',
                summary: `Importing requested Roblox asset reference: ${referenceUrl}`
            });
        }

        // --- Intent Routing: Code Generation & Auto-Fix ---
        const buildContext = `
[SYSTEM CONTEXT]
Genre Context: ${genre || 'General Roblox Game'}
UI/Visual Style: ${style || 'Modern Glossy Neon'}
Asset Reference ID/URL: ${referenceUrl || 'None'}

[USER REQUEST / REPAIR PROMPT]
${cleanPrompt}
        `;

        const result = await aiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: buildContext }] }],
            systemInstruction: LUAU_SYSTEM_INSTRUCTION
        });

        const rawReply = result.response.text();

        // Extract code inside ```lua ... ``` or ``` ... ```
        const codeMatch = rawReply.match(/```(?:lua)?\s*([\s\S]*?)\s*```/i);
        const extractedCode = codeMatch ? codeMatch[1] : rawReply;

        // Generate summary snippet
        const isFixRequest = cleanPrompt.includes('FIX LUAU CODE ERROR');
        const summaryMsg = isFixRequest
            ? '⚡ AMRORO AI successfully repaired runtime/compilation code error!'
            : `⚡ Generated autonomous Luau system matching style: ${style || 'Modern Glossy Neon'}`;

        return res.json({
            code: extractedCode,
            summary: summaryMsg
        });

    } catch (err) {
        console.error('[AMRORO Server Error - /api/build]:', err);
        return res.status(500).json({
            error: err.message || 'Internal AI Generation Error. Please check server logs.'
        });
    }
});

// ============================================================================
// 2. CHAT ENDPOINT (/api/chat)
// Handles: Conversational AI Assistant & Code Snippet Suggestions
// ============================================================================
app.post('/api/chat', async (req, res) => {
    try {
        const { history, style } = req.body;

        if (!history || !Array.isArray(history) || history.length === 0) {
            return res.status(400).json({ error: 'Chat history array is required.' });
        }

        // Format historical messages for Gemini AI SDK
        const formattedHistory = history.map(item => ({
            role: item.role === 'model' ? 'model' : 'user',
            parts: [{ text: item.content }]
        }));

        const chatSession = aiModel.startChat({
            history: formattedHistory.slice(0, -1), // Previous history
            systemInstruction: `${LUAU_SYSTEM_INSTRUCTION}\nYou are chatting directly with the developer in Roblox Studio. Keep responses concise and practical. Preferred UI Style context: ${style || 'Modern Glossy Neon'}.`
        });

        const lastMessage = history[history.length - 1].content;
        const result = await chatSession.sendMessage(lastMessage);
        const replyText = result.response.text();

        return res.json({
            reply: replyText
        });

    } catch (err) {
        console.error('[AMRORO Server Error - /api/chat]:', err);
        return res.status(500).json({
            reply: '⚠️ AMRORO Backend Error: Unable to process chat request. Check server console.'
        });
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('⚡ AMRORO AI Engine Pro Server is online and active!');
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`⚡ AMRORO AI Engine Pro Backend Server Running!`);
    console.log(`📡 Local Endpoint: http://localhost:${PORT}`);
    console.log(`⚙️ Gemini API Key: ${GEMINI_API_KEY.substring(0, 8)}...`);
    console.log(`==================================================\n`);
});