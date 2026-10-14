import OpenAI from "openai";

export const llm = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL,
  timeout: 30000,
  maxRetries: 1,
});

export const model = process.env.LLM_MODEL;