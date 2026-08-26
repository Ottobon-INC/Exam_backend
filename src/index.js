import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

import authRoutes from './routes/authRoutes.js'
import examRoutes from './routes/examRoutes.js'
import questionRoutes from './routes/questionRoutes.js'
import attemptRoutes from './routes/attemptRoutes.js'
import evaluationRoutes from './routes/evaluationRoutes.js'
import resultRoutes from './routes/resultRoutes.js'
import sectionRoutes from './routes/sectionRoutes.js'
import slotRoutes from './routes/slotRoutes.js'
import { setupProctorSocket } from './sockets/proctorSocket.js'

dotenv.config()

const app = express()
const server = http.createServer(app)

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:5175').split(',')

// WebSocket Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// Middleware
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '10mb' }))

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Examination & Proctoring Platform Backend',
    timestamp: new Date().toISOString(),
  })
})

// Route Handlers
app.use('/api/auth', authRoutes)
app.use('/api/exams', examRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/attempts', attemptRoutes)
app.use('/api/evaluation', evaluationRoutes)
app.use('/api/results', resultRoutes)
app.use('/api/sections', sectionRoutes)
app.use('/api/slots', slotRoutes)

// Setup Socket.IO for Live Proctoring
setupProctorSocket(io)

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err)
  res.status(500).json({ error: err.message || 'Internal Server Error' })
})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
  console.log(`=======================================================`)
  console.log(`🚀 Exam Platform Backend running on http://localhost:${PORT}`)
  console.log(`📡 WebSocket Proctoring Hub ready on ws://localhost:${PORT}/proctoring`)
  console.log(`=======================================================`)
})
