import { Router } from 'express'
import { startAttempt, saveAnswer, submitAttempt } from '../controllers/attemptController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.post('/start', startAttempt)
router.post('/answer', saveAnswer)
router.post('/submit', submitAttempt)

export default router
