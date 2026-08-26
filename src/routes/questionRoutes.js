import express from 'express'
import {
  getAllQuestions,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
} from '../controllers/questionController.js'
import { authenticate } from '../middlewares/auth.js'

const router = express.Router()

router.use(authenticate)

router.get('/', getAllQuestions)
router.post('/', createQuestion)
router.post('/bulk', bulkCreateQuestions)
router.put('/:id', updateQuestion)
router.delete('/:id', deleteQuestion)

export default router
