import type { AppModule } from '../_shared/app-types'
import { createMindMirrorActions } from './main'

export const app: AppModule = {
  id: 'mindmirror',
  name: 'MindMirror',
  pageTitle: 'MindMirror',
  connectLabel: 'Connect G2',
  actionLabel: 'Start / Stop',
  initialStatus: 'MindMirror ready',
  createActions: createMindMirrorActions,
}

export default app
