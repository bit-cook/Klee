import { IFileLLmStat, ILocalModel } from '@/types'
import fs from 'fs/promises'
import path from 'path'
import { dialog } from 'electron'
import { llmFolderPath } from './appPath'
import { getMainWindow } from './window'
import Logger from 'electron-log/main'
const logger = Logger.scope('[main] files')

export async function handleReadDirectory(_: unknown, dirPath: string) {
  try {
    const _files = await fs.readdir(dirPath, { withFileTypes: true })
    const files: ILocalModel[] = _files.map((file) => ({
      id: file.name,
      name: file.name,
      isDirectory: file.isDirectory(),
      path: path.join(dirPath, file.name),
    }))
    return files
  } catch (error) {
    logger.error('read directory failed', error)
    return []
  }
}

export async function handleFileOpen(_: unknown, filterName = 'Documents', multi = true, directory = false) {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: [
      // Allow selecting files
      'openFile',
      // Allow selecting folders
      ...(directory ? (['openDirectory'] as const) : []),
      // Allow multiple selection
      ...(multi ? (['multiSelections'] as const) : []),
    ],
    filters: [
      /**
       * 1. Text files:
       *    · CSV: Comma-separated values format
       *    · docx: Microsoft Word document
       *    · .epub: EPUB e-book format
       *    · hwp: Hangul Word Processor file
       *    · ipynb: Jupyter Notebook file
       *    · md: Markdown file
       *    · pdf: Portable Document Format
       *    · .ppt, .pptm, .pptx: Microsoft PowerPoint presentation
       *    · mbox: MBOX email archive
       * 2. Other formats:
       *    · txt: Plain text file
       */
      {
        name: 'Documents',
        extensions: [
          'csv',
          'docx',
          'epub',
          'hwp',
          'ipynb',
          'md',
          'pdf',
          // 'png',
          'ppt',
          'pptm',
          'pptx',
          // 'jpeg',
          // 'jpg',
          'mbox',
          // 'mp3',
          // 'mp4',
          'txt',
        ],
      },
      { name: 'All', extensions: ['*'] },
    ].filter((item) => item.name === filterName),
  })
  if (!canceled) {
    return filePaths
  }
  return []
}

export async function handleDirectoryOpen(_: unknown, defaultPath: string) {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
  })
  if (!canceled) {
    return filePaths
  }
  return []
}

export async function statFileLlm(filename: string): Promise<IFileLLmStat> {
  try {
    const filePath = path.join(llmFolderPath, filename)
    const stats = await fs.stat(filePath)
    return {
      status: 'completed',
      message: 'completed',
      data: {
        stats,
        path: filePath,
      },
    }
  } catch (error) {
    return {
      status: 'waiting',
      message: 'file not found',
      data: null,
    }
  }
}

export async function openUrl(url: string) {
  const mainWindow = getMainWindow()
  if (!mainWindow) return
  mainWindow.webContents.send('open-url', url)
  logger.log('[main]: open url', url)
}
