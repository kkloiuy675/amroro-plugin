export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, response: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        response: 'Server Error: GEMINI_API_KEY is not configured in Vercel Environment Variables.' 
      });
    }

    if (!prompt) {
      return res.status(400).json({ success: false, response: 'Error: Prompt is missing.' });
    }

    const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "You are AMRORO AI, an expert Roblox Studio Luau scripting and building assistant. Provide clear, direct, and accurate code and instructions." },
              { text: prompt }
            ]
          }
        ]
      })
    });

    const data = await apiResponse.json();

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const aiText = data.candidates[0].content.parts[0].text;
      return res.status(200).json({ success: true, response: aiText });
    } else {
      return res.status(500).json({ success: false, response: 'Error: Invalid response structure from AI API.' });
    }

  } catch (error) {
    return res.status(500).json({ success: false, response: 'Server Exception: ' + error.message });
  }
}
