import express from 'express'
import {
  getPendingEvaluations,
  submitEvaluation,
  releaseCandidateResult,
} from '../controllers/evaluationController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = express.Router()

router.use(authenticate)

router.get('/pending', requireRoles('SUPER_ADMIN', 'EXAMINER', 'EVALUATOR'), getPendingEvaluations)
router.post('/submit', requireRoles('SUPER_ADMIN', 'EXAMINER', 'EVALUATOR'), submitEvaluation)
router.post('/release/:attemptId', requireRoles('SUPER_ADMIN', 'EXAMINER', 'EVALUATOR'), releaseCandidateResult)

export default router
