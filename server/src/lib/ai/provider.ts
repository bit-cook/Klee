import { createOpenAI } from "@ai-sdk/openai"

// 创建自定义 OpenAI-compatible provider (Rafa API)
export const rafa = createOpenAI({
  baseURL: `https://${process.env.RAFA_BASE_URL}`,
  apiKey: process.env.RAFA_API_KEY ?? "",
  name: "rafa",
})

// 获取模型实例的辅助函数
// 使用 .chat() 方法来调用标准的 chat completions endpoint
export function getRafaModel(modelName: string) {
  return rafa.chat(modelName)
}
