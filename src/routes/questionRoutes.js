import express from 'express'
import {
  getAllQuestions,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
  batchUpdateQuestionMarks,
} from '../controllers/questionController.js'
import { authenticate } from '../middlewares/auth.js'

const router = express.Router()

router.use(authenticate)

router.get('/', getAllQuestions)
router.post('/', createQuestion)
router.post('/bulk', bulkCreateQuestions)
router.post('/batch-marks', batchUpdateQuestionMarks)
router.put('/:id', updateQuestion)
router.delete('/:id', deleteQuestion)

export default router

