import { Router } from 'express'
import { login, register, getMe } from '../controllers/authController.js'
import { authenticate } from '../middlewares/auth.js'

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.get('/me', authenticate, getMe)

export default router
