
import { GoogleGenAI } from "@google/genai";

export const getBirdWisdom = async (score: number): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `The player just scored ${score} points in a Flappy Bird clone. Provide a very short, humorous, one-sentence "Bird Wisdom" or "Excuse" for why they failed, or a small praise if the score is high. Keep it under 15 words.`,
      config: {
        temperature: 0.8,
        topP: 0.95,
      },
    });
    return response.text || "Keep flapping, little bird!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return score > 10 ? "Impressive wingspan!" : "Gravity is a harsh mistress.";
  }
};
