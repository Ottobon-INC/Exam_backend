import { Router } from 'express'
import { getExamResults, togglePublishResults } from '../controllers/resultController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.get('/:examId', getExamResults)
router.post('/:examId/publish', requireRoles('SUPER_ADMIN', 'EXAMINER'), togglePublishResults)

export default router
