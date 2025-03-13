import { localRequest } from '@/lib/request'

export function getHeartbeat() {
  return localRequest.get('base/status').json<{ status: 'OK' }>()
}

export function syncFiles() {
  return
  // return localRequest.post('base/sync-files').json<{ status: 'OK' }>()
}

export function getSyncFilesStatus() {
  return
  // return localRequest.get('base/sync-files-status').json<{ status: 'OK' }>()
}
