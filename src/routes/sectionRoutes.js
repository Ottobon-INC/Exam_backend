import { Router } from 'express'
import {
  getSectionsByExam,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
} from '../controllers/sectionController.js'
import { authenticate, requireRoles } from '../middlewares/auth.js'

const router = Router()

router.use(authenticate)

router.get('/', getSectionsByExam)                                               // GET  /api/sections?examId=
router.post('/', requireRoles('SUPER_ADMIN', 'EXAMINER'), createSection)         // POST /api/sections
router.put('/reorder', requireRoles('SUPER_ADMIN', 'EXAMINER'), reorderSections) // PUT  /api/sections/reorder
router.put('/:id', requireRoles('SUPER_ADMIN', 'EXAMINER'), updateSection)       // PUT  /api/sections/:id
router.delete('/:id', requireRoles('SUPER_ADMIN', 'EXAMINER'), deleteSection)    // DELETE /api/sections/:id

export default router
