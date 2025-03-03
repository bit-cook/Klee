import { localRequest } from '@/lib/request'

export function getHeartbeat() {
  return localRequest.get('base/status').json<{ status: 'OK' }>()
}
