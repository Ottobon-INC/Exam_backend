import { Router } from 'express'
import { getAllExams, getExamById, createExam, updateExam, deleteExam, notifyCandidates } from '../controllers/examController.js'
import { getExamLeaderboard, exportItemizedResultsCSV } from '../controllers/attemptController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.get('/', getAllExams)
router.get('/:id', getExamById)
router.get('/:id/leaderboard', requireRoles('SUPER_ADMIN', 'EXAMINER'), getExamLeaderboard)
router.get('/:id/export-itemized-results', requireRoles('SUPER_ADMIN', 'EXAMINER'), exportItemizedResultsCSV)
router.post('/', requireRoles('SUPER_ADMIN', 'EXAMINER'), createExam)
router.post('/:id/notify-candidates', requireRoles('SUPER_ADMIN', 'EXAMINER'), notifyCandidates)
router.put('/:id', requireRoles('SUPER_ADMIN', 'EXAMINER'), updateExam)
router.delete('/:id', requireRoles('SUPER_ADMIN', 'EXAMINER'), deleteExam)

export default router

