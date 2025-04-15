// Filename: api/chat.js

const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");

// IMPORTANT: Set GEMINI_API_KEY in your Vercel project environment variables
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    // Ensure the API key is present, fail early if not
    console.error("FATAL ERROR: GEMINI_API_KEY environment variable not set.");
    // In a real app, you might want a more graceful handling,
    // but for serverless startup, exiting might be appropriate
    // or returning a specific error response immediately.
    // For Vercel, this function might just fail to initialize properly.
}

const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
    // Using a generally available model stable model for broader compatibility
    // You can switch back to "gemini-1.5-pro-preview-0409" if needed and available
    model: "gemini-1.5-flash", // Or try gemini-1.5-pro-latest
});

const generationConfig = {
    temperature: 0.9, // Slightly less random than 1 for more consistent chat
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192, // Adjusted based on common model limits, check your specific model
    responseMimeType: "text/plain",
};

// The initial context for the assistant
// const chatHistory = [
//     {
//         role: "user",
//         parts: [
//             {text: "You are an expert astronomy and telescope assistant. You help users understand how to use telescopes, choose the right equipment, align telescopes, find celestial objects, and answer questions about astronomy. Be friendly, clear, and concise. If the user asks for observation tips, explain based on their location, time, and sky conditions when possible."},
//         ],
//     },
//     {
//         role: "model",
//         parts: [
//             // Removed the long "thinking process" part for brevity in the API context
//             {text: "Hello there!\n\nI'm ready to be your expert guide for all things astronomy and telescopes. Consider me your friendly assistant for navigating the wonders of the night sky!\n\nWhether you're choosing equipment, setting up, finding objects, curious about concepts, or looking for observing tips, I'm here to help!\n\nMy goal is to provide friendly, clear, and concise answers.\n\nIf you need specific observation tips, please provide your approximate location, date/time, and sky conditions (clear, hazy, etc.), and I'll tailor the advice.\n\n**So, what's on your mind? How can I help you explore the cosmos today?**"},
//         ],
//     },
// ];
const chatHistory = [
    {
        role: "user",
        parts: [
            // --- MODIFIED PROMPT ---
            {text: `You are an expert astronomy and telescope assistant. You help users understand how to use telescopes, choose the right equipment, align telescopes, find celestial objects, and answer questions about astronomy. Be friendly, clear, and concise.
            When the user asks for observation tips or what is visible, **use the provided context (Time, Location - Lat/Lon) to make the best possible estimation based on your astronomical knowledge.** Calculate or estimate the approximate positions of prominent objects (Sun, Moon, visible planets, bright stars, major constellations) for that time and location.
            **Do NOT simply state you lack real-time data.** Instead, provide a helpful, estimated list of what might be visible (e.g., "Jupiter should be high in the west," "Orion constellation will be setting," "The Moon is nearly full and will be very bright"). Acknowledge that conditions like weather and light pollution affect visibility, and mention that apps provide higher precision, but **first provide your own estimated guidance.**
            The user's message might include context like [Context: Time: ... | Lat: ..., Lon: ...]. Use this information directly for your estimations.`
            },
            // --- END MODIFIED PROMPT ---
        ],
    },
    {
        role: "model",
        parts: [
             // You might also slightly adjust the initial greeting to reflect this capability:
             {text: "Hello there!\n\nI'm your expert guide for astronomy and telescopes... (rest of message) ...If you need observation tips, provide details or allow location access, and I'll use the context to estimate what might be visible in your sky. \n\n**So, what's on your mind? How can I help you explore the cosmos today?**"},
         ],
     },
    // ... rest of history
];

// ... rest of api/chat.js

// Vercel Serverless Function handler
module.exports = async (req, res) => {
    // Allow requests from any origin (adjust for production if needed)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!apiKey) {
        // Check again in case initialization allowed it but it's somehow still missing
         return res.status(500).json({ error: "Server configuration error: API key missing." });
    }

    try {
        // Extract the user's message from the request body
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'No message provided in the request body' });
        }

        // Start a *new* chat session for each request, including the history
        // Note: This makes the chat stateless from the API's perspective.
        // For true conversational memory, you'd need session management.
        const chatSession = model.startChat({
            generationConfig,
            history: chatHistory, // Use the predefined initial history
        });

        // Send the user's message to the model
        const result = await chatSession.sendMessage(message);

        // Check if the response was blocked
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
             console.warn("Response was blocked or empty.", result.response?.promptFeedback);
             // Determine block reason if available
             const blockReason = result.response?.promptFeedback?.blockReason;
             const safetyRatings = result.response?.promptFeedback?.safetyRatings;
             let errorMessage = "I couldn't generate a response for that request.";
             if (blockReason) {
                 errorMessage += ` Reason: ${blockReason}.`;
             }
             if (safetyRatings) {
                 errorMessage += ` Details: ${JSON.stringify(safetyRatings)}`;
             }
             return res.status(500).json({ error: errorMessage });
         }

        // Extract the text response
        // Sometimes content might be missing, handle defensively
        const responseText = result.response.text ? result.response.text() : "Sorry, I received an empty response.";

        // Send the response back to the client
        res.status(200).json({ reply: responseText });

    } catch (error) {
        console.error("Error processing chat request:", error);
        res.status(500).json({ error: 'An error occurred while processing your request.', details: error.message });
    }
};