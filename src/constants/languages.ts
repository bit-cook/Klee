export const LANGUAGES = [
  {
    id: 'en',
    name: 'English',
  },
  {
    id: 'zh',
    name: '中文',
  },
] as const

export const DEFAULT_MODEL_LANGUAGE = {
  id: 'auto',
  name: 'Auto',
} as const

export const MODEL_LANGUAGES = [
  {
    id: 'en',
    name: 'English',
  },
  {
    id: 'zh',
    name: '中文',
  },
  DEFAULT_MODEL_LANGUAGE,
] as const
