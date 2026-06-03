import { GoogleGenAI } from '@google/genai';
import { CGS_SYSTEM_PROMPT } from '../data/knowledgeBase';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Send a message using the Google GenAI SDK.
 * @param {Array<{role: string, content: string}>} history - Previous messages
 * @param {string} userMessage - The latest user message
 * @returns {Promise<string>} - The assistant's response text
 */
export async function sendMessage(history, userMessage) {
  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    throw new Error('VITE_GEMINI_API_KEY is not set in your .env file');
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Build contents array: history + new user message
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      systemInstruction: CGS_SYSTEM_PROMPT,
      maxOutputTokens: 512,
      temperature: 0.7,
    },
  });

  return response.text;
}
