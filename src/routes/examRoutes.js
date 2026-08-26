import { Router } from 'express'
import { getAllExams, getExamById, createExam, updateExam } from '../controllers/examController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.get('/', getAllExams)
router.get('/:id', getExamById)
router.post('/', requireRoles('SUPER_ADMIN', 'EXAMINER'), createExam)
router.put('/:id', requireRoles('SUPER_ADMIN', 'EXAMINER'), updateExam)

export default router
