import { Router } from 'express'
import {
  getExamSlots,
  createExamSlot,
  bulkCreateSlots,
  deleteExamSlot,
  bulkAssignCandidates,
  getCandidateAssignedExams,
  bookSlot,
  getMyBooking,
  getAssignedStudents,
  removeAssignedCandidate,
} from '../controllers/slotController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

// Admin Slot & Roster Management Routes
router.get('/exams/:examId/slots', getExamSlots)
router.post('/exams/:examId/slots', requireRoles('SUPER_ADMIN', 'EXAMINER'), createExamSlot)
router.post('/exams/:examId/slots/bulk', requireRoles('SUPER_ADMIN', 'EXAMINER'), bulkCreateSlots)
router.delete('/exams/:examId/slots/:slotId', requireRoles('SUPER_ADMIN', 'EXAMINER'), deleteExamSlot)
router.post('/exams/:examId/assign-candidates', requireRoles('SUPER_ADMIN', 'EXAMINER'), bulkAssignCandidates)
router.get('/exams/:examId/assigned-students', requireRoles('SUPER_ADMIN', 'EXAMINER'), getAssignedStudents)
router.delete('/exams/:examId/assigned-students/:candidateId', requireRoles('SUPER_ADMIN', 'EXAMINER'), removeAssignedCandidate)

// Candidate Self-Service Routes
router.get('/candidate/assigned-exams', getCandidateAssignedExams)
router.post('/exams/:examId/book-slot', bookSlot)
router.get('/exams/:examId/my-booking', getMyBooking)

export default router
