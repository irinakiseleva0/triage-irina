import OpenAI from "openai";

export const llm = new OpenAI({
    baseURL: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
});

export const model = process.env.LLM_MODEL;
