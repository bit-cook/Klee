import { ollamaModels } from '@/constants/models'
import supabase from '@/lib/supabase'
import { OllamaModelsResponse, OllamaModel, OllamaModelSearch } from '@/types'

// Get from environment variables
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'

export async function fetchOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
  if (!response.ok) {
    throw new Error('Failed to get Ollama model list')
  }
  const data: OllamaModelsResponse = await response.json()
  console.log(`Retrieved Ollama model data: ${JSON.stringify(data)}`)
  return data.models.map((model) => ({
    ...model,
    id: model.name,
  }))
}

export async function fetchOllamaModelsSearch(): Promise<OllamaModelSearch[]> {
  if (!supabase) {
    console.log('No supabase client found, using local models')
    return ollamaModels
  }
  const { data, error } = await supabase.from('ollama_models').select('*')
  if (error) {
    // throw new Error('Failed to get Ollama model list')
    console.error(`Failed to get Ollama model list: ${error}`)
    return ollamaModels
  }
  return data
}
