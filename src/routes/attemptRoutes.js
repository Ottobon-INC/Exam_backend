import { Router } from 'express'
import {
  startAttempt,
  saveAnswer,
  submitAttempt,
  getAttemptItemizedDetails,
  sendScoreEmail,
  getActiveProctoringCandidates,
} from '../controllers/attemptController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.get('/live-active', getActiveProctoringCandidates)
router.post('/start', startAttempt)
router.post('/answer', saveAnswer)
router.post('/submit', submitAttempt)
router.get('/:attemptId/details', getAttemptItemizedDetails)
router.post('/:attemptId/send-email', sendScoreEmail)

export default router

