import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../config/db.js'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '../../data_store.json')

export const memorySlots = new Map()       // examId -> Array of slots
export const memoryRegistrations = new Map() // `${candidateId}_${examId}` -> registration object
export const memoryUsers = new Map()
export const memoryExamSettings = new Map() // examId -> { slotBookingEnabled: boolean }

// Load persisted state from disk on startup
const loadStateFromDisk = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const data = JSON.parse(raw)

      if (data.slots) {
        Object.entries(data.slots).forEach(([k, val]) => memorySlots.set(k, val))
      }
      if (data.registrations) {
        Object.entries(data.registrations).forEach(([k, val]) => memoryRegistrations.set(k, val))
      }
      if (data.users) {
        Object.entries(data.users).forEach(([k, val]) => memoryUsers.set(k, val))
      }
      if (data.examSettings) {
        Object.entries(data.examSettings).forEach(([k, val]) => memoryExamSettings.set(k, val))
      }
      console.log(`✅ Restored local data store from disk: ${memorySlots.size} slot groups, ${memoryRegistrations.size} registrations, ${memoryExamSettings.size} exam settings.`)
    }
  } catch (err) {
    console.error('Failed to load local data store from disk:', err)
  }
}

export const saveStateToDisk = () => {
  try {
    const slotsObj = {}
    memorySlots.forEach((v, k) => (slotsObj[k] = v))

    const regsObj = {}
    memoryRegistrations.forEach((v, k) => (regsObj[k] = v))

    const usersObj = {}
    memoryUsers.forEach((v, k) => (usersObj[k] = v))

    const settingsObj = {}
    memoryExamSettings.forEach((v, k) => (settingsObj[k] = v))

    fs.writeFileSync(DATA_FILE, JSON.stringify({ slots: slotsObj, registrations: regsObj, users: usersObj, examSettings: settingsObj }, null, 2))
  } catch (err) {
    console.error('Failed to save data store to disk:', err)
  }
}

export const setExamSlotBookingSetting = (examId, enabled) => {
  if (!examId) return
  memoryExamSettings.set(String(examId), { slotBookingEnabled: Boolean(enabled) })
  saveStateToDisk()
}

loadStateFromDisk()

/**
 * GET /api/slots/exams/:examId/slots
 * Fetches all available time slots for an exam from DB and calculates booked & remaining seats.
 */
export const getExamSlots = async (req, res) => {
  try {
    const { examId } = req.params

    // 1. Fetch DB slots
    const { data: dbSlots, error: slotError } = await supabase
      .from('ex_exam_slots')
      .select('*')
      .eq('exam_id', examId)
      .order('start_time', { ascending: true })

    const slotMap = new Map()

    // Load memory fallbacks if present
    for (const [k, arr] of memorySlots.entries()) {
      if (String(k).toLowerCase() === String(examId).toLowerCase()) {
        (arr || []).forEach((s) => {
          slotMap.set(s.id, {
            id: s.id,
            examId: s.exam_id || s.examId || examId,
            startTime: s.start_time || s.startTime,
            endTime: s.end_time || s.endTime,
            capacity: Number(s.capacity) || 30,
          })
        })
      }
    }

    // Prioritize DB slots
    if (!slotError && dbSlots) {
      dbSlots.forEach((s) => {
        slotMap.set(s.id, {
          id: s.id,
          examId: s.exam_id || examId,
          startTime: s.start_time || s.startTime,
          endTime: s.end_time || s.endTime,
          capacity: Number(s.capacity) || 30,
        })
      })
    }

    const combinedSlots = Array.from(slotMap.values())

    // 2. Fetch registrations to calculate booked counts
    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('slot_id')
      .eq('exam_id', examId)

    const formatted = combinedSlots.map((s) => {
      let bookedCount = 0
      if (dbRegs) {
        bookedCount += dbRegs.filter((r) => r.slot_id === s.id).length
      }
      for (const reg of memoryRegistrations.values()) {
        if (reg.slotId === s.id && reg.examId === examId && !dbRegs?.some(r => r.slot_id === s.id)) {
          bookedCount++
        }
      }

      const capacity = Number(s.capacity) || 30
      return {
        id: s.id,
        examId: s.examId,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity,
        bookedCount,
        remainingSeats: Math.max(0, capacity - bookedCount),
      }
    })

    res.json({ slots: formatted })
  } catch (err) {
    console.error('Error fetching slots:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch slots' })
  }
}

/**
 * POST /api/slots/exams/:examId/slots
 * Creates a new time slot in ex_exam_slots.
 */
export const createExamSlot = async (req, res) => {
  try {
    const { examId } = req.params
    const { startTime, endTime, capacity } = req.body

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and End time are required' })
    }

    const slotId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const slotCapacity = Number(capacity) || 30

    // Store in Supabase DB
    const { data, error } = await supabase
      .from('ex_exam_slots')
      .insert({
        id: slotId,
        exam_id: examId,
        start_time: startTime,
        end_time: endTime,
        capacity: slotCapacity,
      })
      .select()
      .maybeSingle()

    if (error) {
      console.warn('Supabase slot insert warning:', error.message)
    }

    const slotObj = {
      id: data?.id || slotId,
      examId,
      exam_id: examId,
      startTime: data?.start_time || startTime,
      start_time: data?.start_time || startTime,
      endTime: data?.end_time || endTime,
      end_time: data?.end_time || endTime,
      capacity: data?.capacity || slotCapacity,
    }

    // Update memory backup
    const key = String(examId)
    if (!memorySlots.has(key)) memorySlots.set(key, [])
    memorySlots.get(key).push(slotObj)
    saveStateToDisk()

    res.status(201).json({ message: 'Slot created successfully', slot: slotObj })
  } catch (err) {
    console.error('Error creating slot:', err)
    res.status(500).json({ error: err.message || 'Failed to create slot' })
  }
}

/**
 * POST /api/slots/exams/:examId/slots/bulk
 * Bulk creates multiple time slots in a single database operation.
 */
export const bulkCreateSlots = async (req, res) => {
  try {
    const { examId } = req.params
    const { slots } = req.body

    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'No slots provided for bulk creation' })
    }

    const slotsToInsert = slots.map((s, idx) => ({
      id: `slot_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      exam_id: examId,
      start_time: s.startTime || s.start_time,
      end_time: s.endTime || s.end_time,
      capacity: Number(s.capacity) || 30,
    }))

    const { data, error } = await supabase
      .from('ex_exam_slots')
      .insert(slotsToInsert)
      .select()

    if (error) {
      console.warn('Supabase bulk slot insert warning:', error.message)
    }

    const createdSlots = data || slotsToInsert
    const key = String(examId)
    if (!memorySlots.has(key)) memorySlots.set(key, [])
    memorySlots.get(key).push(...createdSlots)
    saveStateToDisk()

    res.status(201).json({
      message: `Successfully created ${createdSlots.length} slots`,
      count: createdSlots.length,
      slots: createdSlots,
    })
  } catch (err) {
    console.error('Error bulk creating slots:', err)
    res.status(500).json({ error: err.message || 'Failed to bulk create slots' })
  }
}

/**
 * DELETE /api/slots/exams/:examId/slots/:slotId
 * Deletes a time slot from ex_exam_slots.
 */
export const deleteExamSlot = async (req, res) => {
  try {
    const { examId, slotId } = req.params

    await supabase.from('ex_exam_slots').delete().eq('id', slotId)

    if (memorySlots.has(examId)) {
      const list = memorySlots.get(examId).filter((s) => s.id !== slotId)
      memorySlots.set(examId, list)
      saveStateToDisk()
    }

    res.json({ message: 'Slot deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete slot' })
  }
}

/**
 * POST /api/slots/exams/:examId/assign-candidates
 * Bulk assigns candidates to an exam. Upserts users in ex_users and registers them in ex_exam_registrations.
 */
export const bulkAssignCandidates = async (req, res) => {
  try {
    const { examId } = req.params
    const { candidates } = req.body

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'No candidates provided for assignment' })
    }

    let assignedCount = 0
    const assignedList = []

    for (const c of candidates) {
      const email = c.email?.trim().toLowerCase()
      const rollNumber = c.roll_number || c.rollNumber || `STU-${Math.floor(1000 + Math.random() * 9000)}`
      const password = c.password || `Pass@${Math.floor(1000 + Math.random() * 9000)}`
      const name = c.name || 'Student Candidate'

      if (!email) continue

      const hashedPassword = await bcrypt.hash(password, 10)
      let candidateUser = null

      // Check existing user
      const { data: existing } = await supabase
        .from('ex_users')
        .select('*')
        .or(`email.eq.${email},roll_number.eq.${rollNumber}`)
        .maybeSingle()

      if (existing) {
        const { data: updatedUser } = await supabase
          .from('ex_users')
          .update({
            password_hash: hashedPassword,
            raw_password: password,
            name,
            roll_number: rollNumber,
          })
          .eq('id', existing.id)
          .select()
          .single()

        candidateUser = updatedUser || { ...existing, password_hash: hashedPassword, raw_password: password }
      } else {
        const { data: newUser, error: createErr } = await supabase
          .from('ex_users')
          .insert({
            name,
            email,
            roll_number: rollNumber,
            password_hash: hashedPassword,
            raw_password: password,
            role: 'CANDIDATE',
          })
          .select()
          .single()

        if (!createErr && newUser) {
          candidateUser = newUser
        } else {
          candidateUser = {
            id: `cand_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name,
            email,
            password_hash: hashedPassword,
            raw_password: password,
            role: 'CANDIDATE',
            roll_number: rollNumber,
          }
        }
      }

      if (candidateUser) {
        // Upsert into ex_exam_registrations in Supabase DB
        const { error: regErr } = await supabase
          .from('ex_exam_registrations')
          .upsert({
            exam_id: examId,
            candidate_id: candidateUser.id,
            assigned_at: new Date().toISOString(),
          }, { onConflict: 'exam_id,candidate_id' })

        if (regErr) {
          console.warn('Registration DB upsert notice:', regErr.message)
        }

        // Memory fallback mirror
        const key = `${candidateUser.id}_${examId}`
        const existingMem = memoryRegistrations.get(key)
        memoryRegistrations.set(key, {
          candidateId: candidateUser.id,
          name,
          email,
          rollNumber,
          examId,
          slotId: existingMem?.slotId || null,
          assignedAt: existingMem?.assignedAt || new Date().toISOString(),
          emailSent: existingMem?.emailSent || false,
          emailSentAt: existingMem?.emailSentAt || null,
        })

        memoryUsers.set(email, candidateUser)

        assignedCount++
        assignedList.push({
          name,
          email,
          rollNumber,
          password,
        })
      }
    }

    saveStateToDisk()
    res.json({ message: `Successfully assigned ${assignedCount} students to exam`, assignedCount, assignedStudents: assignedList })
  } catch (err) {
    console.error('Error bulk assigning candidates:', err)
    res.status(500).json({ error: err.message || 'Failed to assign candidates' })
  }
}

/**
 * GET /api/slots/candidate/assigned-exams
 * Fetches exams assigned to the logged-in candidate with booking & attempt metadata.
 */
export const getCandidateAssignedExams = async (req, res) => {
  try {
    const candidateId = req.user.id
    const assignedExamIds = new Set()

    // Fetch DB registrations
    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('exam_id, slot_id, slot_start_time, slot_end_time')
      .eq('candidate_id', candidateId)

    if (dbRegs && dbRegs.length > 0) {
      dbRegs.forEach((r) => assignedExamIds.add(r.exam_id))
    }

    // Memory fallback check
    for (const reg of memoryRegistrations.values()) {
      if (reg.candidateId === candidateId) assignedExamIds.add(reg.examId)
    }

    const { data: exams, error } = await supabase
      .from('ex_exams')
      .select('*, ex_questions(id), ex_exam_sections(id)')
      .in('status', ['SCHEDULED', 'LIVE', 'COMPLETED'])
      .order('created_at', { ascending: false })

    if (error) throw error

    const filtered = (exams || []).filter((e) => {
      if (assignedExamIds.size > 0) return assignedExamIds.has(e.id)
      return true
    })

    const { data: dbAttempts } = await supabase
      .from('ex_attempts')
      .select('exam_id, status, submitted_at, total_score')
      .eq('candidate_id', candidateId)

    const formatted = filtered.map((e) => {
      const regKey = `${candidateId}_${e.id}`
      const memReg = memoryRegistrations.get(regKey)
      const dbReg = dbRegs?.find((r) => r.exam_id === e.id)

      let bookedSlot = null
      if (dbReg && dbReg.slot_id) {
        bookedSlot = {
          slotId: dbReg.slot_id,
          startTime: dbReg.slot_start_time,
          endTime: dbReg.slot_end_time,
        }
      } else if (memReg && memReg.slotId) {
        bookedSlot = {
          slotId: memReg.slotId,
          startTime: memReg.startTime,
          endTime: memReg.endTime,
        }
      }

      const myAtt = dbAttempts?.find((att) => att.exam_id === e.id)
      const userAttempt = myAtt ? {
        status: myAtt.status,
        submittedAt: myAtt.submitted_at,
        totalScore: myAtt.total_score,
      } : null

      const localSetting = memoryExamSettings.get(String(e.id))
      let slotBookingEnabled = true
      if (localSetting && localSetting.slotBookingEnabled !== undefined) {
        slotBookingEnabled = localSetting.slotBookingEnabled
      } else if (e.slot_booking_enabled !== undefined && e.slot_booking_enabled !== null) {
        slotBookingEnabled = Boolean(e.slot_booking_enabled)
      }

      return {
        id: e.id,
        code: e.code,
        title: e.title,
        description: e.description,
        durationMinutes: e.duration_minutes,
        totalMarks: e.total_marks,
        passMarks: e.pass_marks,
        status: e.status,
        proctoringEnabled: e.proctoring_enabled,
        slotBookingEnabled,
        publishedResults: Boolean(e.published_results),
        userAttempt,
        bookedSlot,
        _count: { questions: e.ex_questions?.length || 0 },
      }
    })

    res.json({ exams: formatted })
  } catch (err) {
    console.error('Error fetching candidate exams:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch candidate exams' })
  }
}

/**
 * POST /api/slots/exams/:examId/book-slot
 * Candidate books a specific time slot for an exam.
 */
export const bookSlot = async (req, res) => {
  try {
    const { examId } = req.params
    const { slotId } = req.body
    const candidateId = req.user.id

    if (!slotId) return res.status(400).json({ error: 'Slot ID is required' })

    // Fetch slot details from DB
    let targetSlot = null
    const { data: dbSlot } = await supabase
      .from('ex_exam_slots')
      .select('*')
      .eq('id', slotId)
      .maybeSingle()

    if (dbSlot) {
      targetSlot = dbSlot
    } else {
      for (const [k, arr] of memorySlots.entries()) {
        if (String(k).toLowerCase() === String(examId).toLowerCase()) {
          targetSlot = (arr || []).find((s) => s.id === slotId)
          if (targetSlot) break
        }
      }
    }

    if (!targetSlot) return res.status(404).json({ error: 'Slot not found' })

    const regKey = `${candidateId}_${examId}`
    const startTime = targetSlot.start_time || targetSlot.startTime
    const endTime = targetSlot.end_time || targetSlot.endTime
    const nowIso = new Date().toISOString()

    // 1. Ensure target slot exists in ex_exam_slots DB (satisfies Foreign Key)
    try {
      await supabase.from('ex_exam_slots').upsert({
        id: String(targetSlot.id),
        exam_id: examId,
        start_time: startTime,
        end_time: endTime,
        capacity: targetSlot.capacity || 30,
      })
    } catch (sErr) {
      console.warn('Slot DB sync notice:', sErr.message)
    }

    // 2. Upsert registration in Supabase ex_exam_registrations DB
    const { data: updatedReg, error: dbErr } = await supabase
      .from('ex_exam_registrations')
      .upsert({
        exam_id: examId,
        candidate_id: candidateId,
        slot_id: String(targetSlot.id),
        slot_start_time: startTime,
        slot_end_time: endTime,
        booked_at: nowIso,
      }, { onConflict: 'exam_id,candidate_id' })
      .select()
      .maybeSingle()

    if (dbErr) {
      console.error('❌ Booking DB upsert notice:', dbErr.message || dbErr)
    } else {
      console.log(`✅ Successfully persisted slot booking for candidate ${candidateId} in ex_exam_registrations!`)
    }

    const booking = {
      candidateId,
      examId,
      slotId: targetSlot.id,
      startTime,
      endTime,
      bookedAt: nowIso,
    }

    memoryRegistrations.set(regKey, booking)
    saveStateToDisk()

    res.json({ message: 'Slot booked successfully', booking })
  } catch (err) {
    console.error('Error booking slot:', err)
    res.status(500).json({ error: err.message || 'Failed to book slot' })
  }
}

/**
 * GET /api/slots/exams/:examId/my-booking
 * Fetches the logged-in candidate's booked slot for an exam.
 */
export const getMyBooking = async (req, res) => {
  try {
    const { examId } = req.params
    const candidateId = req.user.id

    let booking = null

    // Check if exam has slot booking disabled (Direct Access Mode)
    const localSetting = memoryExamSettings.get(String(examId))
    const { data: examData } = await supabase
      .from('ex_exams')
      .select('slot_booking_enabled')
      .eq('id', examId)
      .maybeSingle()

    const isSlotBookingDisabled = (localSetting && localSetting.slotBookingEnabled === false) || (examData && examData.slot_booking_enabled === false)

    if (isSlotBookingDisabled) {
      return res.json({
        booking: {
          slotId: 'DIRECT_ACCESS',
          examId,
          candidateId,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 864000000).toISOString(),
          bookedAt: new Date().toISOString(),
          isDirectAccess: true,
        }
      })
    }

    // Query Supabase DB ex_exam_registrations
    const { data } = await supabase
      .from('ex_exam_registrations')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('exam_id', examId)
      .maybeSingle()

    if (data && data.slot_id) {
      booking = {
        slotId: data.slot_id,
        examId: data.exam_id,
        candidateId: data.candidate_id,
        startTime: data.slot_start_time,
        endTime: data.slot_end_time,
        bookedAt: data.booked_at,
      }
    } else {
      const regKey = `${candidateId}_${examId}`
      const memReg = memoryRegistrations.get(regKey)
      if (memReg && memReg.slotId) {
        booking = memReg
        // Auto-heal / sync missing memory booking directly into Supabase DB
        try {
          await supabase.from('ex_exam_slots').upsert({
            id: String(memReg.slotId),
            exam_id: examId,
            start_time: memReg.startTime,
            end_time: memReg.endTime,
            capacity: 30,
          })
          await supabase.from('ex_exam_registrations').upsert({
            exam_id: examId,
            candidate_id: candidateId,
            slot_id: String(memReg.slotId),
            slot_start_time: memReg.startTime,
            slot_end_time: memReg.endTime,
            booked_at: memReg.bookedAt || new Date().toISOString(),
          }, { onConflict: 'exam_id,candidate_id' })
          console.log(`✅ Auto-synced missing memory booking for ${candidateId} to ex_exam_registrations Supabase DB!`)
        } catch (syncErr) {
          console.warn('Auto-sync memory booking notice:', syncErr.message)
        }
      }
    }

    res.json({ booking: booking || null })
  } catch (err) {
    console.error('Error fetching booking:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch booking' })
  }
}

/**
 * GET /api/slots/exams/:examId/assigned-students
 * Fetches all assigned candidates for an exam and their booked slot details.
 */
export const getAssignedStudents = async (req, res) => {
  try {
    const { examId } = req.params
    const candidatesMap = new Map()

    // 1. Fetch DB registrations
    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('*')
      .eq('exam_id', examId)

    if (dbRegs && dbRegs.length > 0) {
      const candidateIds = dbRegs.map((r) => r.candidate_id).filter(Boolean)
      let users = []
      if (candidateIds.length > 0) {
        const { data: userList } = await supabase
          .from('ex_users')
          .select('id, name, email, roll_number')
          .in('id', candidateIds)
        users = userList || []
      }

      const userMap = new Map(users.map((u) => [u.id, u]))

      dbRegs.forEach((r) => {
        const u = userMap.get(r.candidate_id)
        candidatesMap.set(r.candidate_id, {
          candidateId: r.candidate_id,
          name: u?.name || 'Student Candidate',
          email: u?.email || '',
          rollNumber: u?.roll_number || '',
          slotId: r.slot_id,
          slotStartTime: r.slot_start_time,
          slotEndTime: r.slot_end_time,
          assignedAt: r.assigned_at,
          bookedAt: r.booked_at,
          emailSent: r.email_sent || false,
          emailSentAt: r.email_sent_at || null,
        })
      })
    }

    // 2. Memory fallback merge
    for (const [key, reg] of memoryRegistrations.entries()) {
      if (reg.examId === examId) {
        const existing = candidatesMap.get(reg.candidateId)
        if (!existing) {
          candidatesMap.set(reg.candidateId, {
            candidateId: reg.candidateId,
            name: reg.name || 'Student Candidate',
            email: reg.email || '',
            rollNumber: reg.rollNumber || '',
            slotId: reg.slotId || null,
            slotStartTime: reg.startTime || null,
            slotEndTime: reg.endTime || null,
            assignedAt: reg.assignedAt || new Date().toISOString(),
            emailSent: reg.emailSent || false,
            emailSentAt: reg.emailSentAt || null,
          })
        } else {
          if (reg.emailSent) {
            existing.emailSent = true
            existing.emailSentAt = reg.emailSentAt
          }
        }
      }
    }

    const students = Array.from(candidatesMap.values())
    res.json({ students })
  } catch (err) {
    console.error('Error fetching assigned students:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch assigned students' })
  }
}

/**
 * DELETE /api/slots/exams/:examId/assigned-students/:candidateId
 * Removes a candidate assignment from an exam in ex_exam_registrations.
 */
export const removeAssignedCandidate = async (req, res) => {
  try {
    const { examId, candidateId } = req.params

    await supabase
      .from('ex_exam_registrations')
      .delete()
      .eq('exam_id', examId)
      .eq('candidate_id', candidateId)

    const key = `${candidateId}_${examId}`
    memoryRegistrations.delete(key)
    saveStateToDisk()

    res.json({ message: 'Candidate removed from exam successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove candidate' })
  }
}
