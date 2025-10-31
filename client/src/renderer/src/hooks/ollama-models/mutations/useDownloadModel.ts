/**
 * 下载模型 Mutation Hook
 *
 * 使用 useMutation + React State 管理流式下载进度
 *
 * 特性：
 * - 实时进度更新（NDJSON 流）
 * - 支持取消下载（AbortController）
 * - 下载速度和剩余时间计算
 * - 并发控制（通过 p-queue，最多 2 个）
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useCallback } from 'react'
import PQueue from 'p-queue'
import {
  pullOllamaModel,
  type OllamaDownloadProgress,
  getInstalledModels,
} from '@/lib/ollama-client'
import { ollamaModelKeys } from '@/lib/queryKeys'
import { useDiskSpace } from '@/hooks/mode/useDiskSpace'

/**
 * 下载任务状态
 */
export type DownloadStatus =
  | 'idle' // 未开始
  | 'queued' // 队列中等待
  | 'downloading' // 下载中
  | 'paused' // 已暂停（实际上是已取消，UI 显示为暂停）
  | 'completed' // 已完成
  | 'error' // 错误
  | 'cancelled' // 已取消

/**
 * 下载任务
 */
export interface DownloadTask {
  /** 模型 ID（如 'llama3:8b'） */
  modelId: string

  /** 模型显示名称 */
  modelName: string

  /** 任务状态 */
  status: DownloadStatus

  /** 下载进度（如果正在下载） */
  progress: OllamaDownloadProgress | null

  /** 错误消息（如果失败） */
  error?: string

  /** 队列位置（如果在队列中） */
  queuePosition?: number

  /** 下载速度（bytes/s，内部计算用于预估时间） */
  speed?: number

  /** 预计剩余时间（秒，UI 显示用） */
  estimatedTimeRemaining?: number

  /** 任务创建时间 */
  createdAt: Date

  /** 最后更新时间 */
  updatedAt: Date
}

/**
 * Global download queue (limit concurrency to 2)
 */
const downloadQueue = new PQueue({ concurrency: 2 })
const normalizeModelName = (name: string): string => name.replace(/:latest$/, '')

/**
 * Speed calculation sample
 */
interface SpeedSample {
  timestamp: number
  downloadedBytes: number
}

/**
 * Hook for downloading Ollama models with progress tracking
 *
 * Features:
 * - Real-time progress tracking (percentage only)
 * - Estimated time remaining
 * - Concurrent download limit (2 models max)
 * - Disk space check before download
 * - Pause/resume support (with Ollama resumable downloads)
 *
 * Note: Speed calculation is done internally for time estimation only
 */
export function useDownloadModel() {
  const queryClient = useQueryClient()
  const { data: diskSpace } = useDiskSpace()

  // Download state
  const [downloadTask, setDownloadTask] = useState<DownloadTask | null>(null)

  // AbortController for canceling download
  const abortControllerRef = useRef<AbortController | null>(null)

  // Speed calculation state (sliding window of 10 samples)
  const speedSamplesRef = useRef<SpeedSample[]>([])
  const lastSpeedUpdateRef = useRef<number>(0)

  /**
   * Calculate download speed and estimated time remaining
   */
  const updateSpeed = useCallback((downloadedBytes: number, totalBytes?: number) => {
    const now = Date.now()
    const timeSinceLastUpdate = now - lastSpeedUpdateRef.current

    // Update speed every 500ms
    if (timeSinceLastUpdate < 500) return

    lastSpeedUpdateRef.current = now

    // Add new sample
    speedSamplesRef.current.push({ timestamp: now, downloadedBytes })

    // Keep only last 10 samples
    if (speedSamplesRef.current.length > 10) {
      speedSamplesRef.current.shift()
    }

    // Calculate speed (bytes per second)
    if (speedSamplesRef.current.length >= 2) {
      const firstSample = speedSamplesRef.current[0]
      const lastSample = speedSamplesRef.current[speedSamplesRef.current.length - 1]

      const bytesDownloaded = lastSample.downloadedBytes - firstSample.downloadedBytes
      const timeElapsed = (lastSample.timestamp - firstSample.timestamp) / 1000 // seconds

      const speed = timeElapsed > 0 ? bytesDownloaded / timeElapsed : 0

      // Calculate estimated time remaining
      let estimatedTimeRemaining: number | undefined
      if (totalBytes && speed > 0) {
        const bytesRemaining = totalBytes - downloadedBytes
        estimatedTimeRemaining = bytesRemaining / speed // seconds
      }

      setDownloadTask((prev) => prev ? {
        ...prev,
        speed,
        estimatedTimeRemaining,
        updatedAt: new Date(),
      } : null)
    }
  }, [])

  /**
   * Progress callback handler
   */
  const handleProgress = useCallback(
    (progress: OllamaDownloadProgress) => {
      setDownloadTask((prev) => {
        if (!prev) return null

        const nextStatus: DownloadStatus =
          progress.status === 'error'
            ? 'error'
            : progress.status === 'success'
              ? 'completed'
              : 'downloading'

        return {
          ...prev,
          status: nextStatus,
          progress,
          error:
            progress.status === 'error'
              ? progress.error || prev.error
              : progress.status === 'success'
                ? undefined
                : prev.error,
          updatedAt: new Date(),
        }
      })

      // Reset speed calculation if error occurs
      if (progress.status === 'error') {
        speedSamplesRef.current = []
        return
      }

      // Update speed if we have download data
      if (progress.completed && progress.total) {
        updateSpeed(progress.completed, progress.total)
      }
    },
    [updateSpeed]
  )

  /**
   * Download mutation
   */
  const mutation = useMutation({
    mutationFn: async ({
      modelId,
      modelName,
      modelSizeGB
    }: {
      modelId: string
      modelName: string
      modelSizeGB: number
    }) => {
      // Check disk space before download (add 20% buffer)
      const requiredSpace = modelSizeGB * 1.2 * 1024 * 1024 * 1024 // Convert to bytes
      const freeSpace = diskSpace?.free ?? 0

      if (freeSpace < requiredSpace) {
        throw new Error(
          `Insufficient disk space. Required: ${(requiredSpace / 1024 / 1024 / 1024).toFixed(1)} GB, Available: ${(freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB`
        )
      }

      // Reset state
      const now = new Date()
      setDownloadTask({
        modelId,
        modelName,
        status: 'downloading',
        progress: null,
        createdAt: now,
        updatedAt: now,
      })
      speedSamplesRef.current = []
      lastSpeedUpdateRef.current = Date.now()

      // Create new AbortController
      abortControllerRef.current = new AbortController()

      // Add to download queue
      try {
        await downloadQueue.add(async () => {
          await pullOllamaModel(modelId, handleProgress, abortControllerRef.current!.signal)

          // Ollama 的 /api/pull 在成功返回后，仍需要一点时间写入索引。
          // 轮询 /api/tags，确认模型确实被注册，否则视为失败。
          const timeoutMs = 30_000
          const intervalMs = 1_000
          const deadline = Date.now() + timeoutMs
          const targetName = normalizeModelName(modelId)
          let lastError: unknown

          while (Date.now() <= deadline) {
            try {
              const models = await getInstalledModels()
              const exists = models.some(
                (model) => normalizeModelName(model.name) === targetName
              )

              if (exists) {
                return
              }
            } catch (error) {
              lastError = error
            }

            await new Promise((resolve) => setTimeout(resolve, intervalMs))
          }

          const lastErrorMessage =
            lastError instanceof Error ? ` Last error: ${lastError.message}` : ''

          throw new Error(
            `Model download finished but Ollama did not report "${modelId}" as installed within ${Math.round(
              timeoutMs / 1000
            )}s.${lastErrorMessage}`
          )
        })

        // Mark as completed
        setDownloadTask((prev) => {
          if (!prev) return null

          const prevProgress = prev.progress ?? {
            status: 'success' as OllamaDownloadProgress['status'],
            percent: 100,
          }

          return {
            ...prev,
            status: 'completed',
            progress: { ...prevProgress, status: 'success', percent: 100 },
            updatedAt: new Date(),
          }
        })

        return { modelId, modelName, completed: true }
      } catch (error) {
        // If it's an AbortError (user paused), don't treat it as an error
        if (error instanceof Error && error.name === 'AbortError') {
          // Download was paused by user, keep the paused state
          // Don't trigger onSuccess (by returning a special flag)
          return { modelId, modelName, completed: false }
        }
        // Re-throw other errors
        throw error
      }
    },
    onSuccess: (data) => {
      // Only clear state and invalidate queries if download truly completed
      // (not paused by user)
      if (data.completed) {
        // Invalidate queries to refresh model lists
        queryClient.invalidateQueries({ queryKey: ollamaModelKeys.installed() })
        queryClient.invalidateQueries({ queryKey: ollamaModelKeys.available() })
        queryClient.invalidateQueries({ queryKey: ['disk-space', 'ollama'] })

        // Clear download task state after a short delay to show completion animation
        setTimeout(() => {
          setDownloadTask(null)
        }, 1500) // 1.5 seconds delay to let user see "100% completed"
      }
      // If completed === false, it means user paused, keep the downloadTask state
    },
    onError: (error: Error) => {
      // Don't show error for AbortError (user paused)
      if (error.name === 'AbortError') {
        return
      }

      setDownloadTask((prev) => prev ? {
        ...prev,
        status: 'error',
        error: error.message,
        updatedAt: new Date(),
      } : null)
    },
  })

  /**
   * Pause download
   *
   * Note: Ollama supports resumable downloads, so pausing will preserve progress.
   * The download will resume from where it left off when resume() is called.
   */
  const pause = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setDownloadTask((prev) => prev ? {
      ...prev,
      status: 'paused',
      updatedAt: new Date(),
    } : null)

    speedSamplesRef.current = []
  }, [])

  /**
   * Resume download
   *
   * Note: Ollama will automatically resume from where it left off,
   * so we just need to restart the download process.
   */
  const resume = useCallback(
    (modelId: string, modelName: string, modelSizeGB: number) => {
      mutation.mutate({ modelId, modelName, modelSizeGB })
    },
    [mutation]
  )

  return {
    downloadTask,
    isDownloading: mutation.isPending,
    download: mutation.mutate,
    pause,
    resume,
  }
}
