export const memoryUsers = new Map()
import { supabase } from '../config/db.js'
import bcrypt from 'bcryptjs'

// In-memory fallback stores
const memorySlots = new Map()       // examId -> Array of slots
const memoryRegistrations = new Map() // `${candidateId}_${examId}` -> registration object

export const getExamSlots = async (req, res) => {
  try {
    const { examId } = req.params

    let dbSlots = []
    const { data, error } = await supabase
      .from('ex_exam_slots')
      .select('*')
      .eq('exam_id', examId)

    if (!error && data) {
      dbSlots = data
    }

    const memSlots = memorySlots.get(String(examId)) || []
    const slotMap = new Map()

    // Add memory slots first
    memSlots.forEach((s) => {
      slotMap.set(s.id, {
        id: s.id,
        examId: s.exam_id || s.examId || examId,
        startTime: s.start_time || s.startTime,
        endTime: s.end_time || s.endTime,
        capacity: Number(s.capacity) || 30,
      })
    })

    // Override / include database slots
    dbSlots.forEach((s) => {
      slotMap.set(s.id, {
        id: s.id,
        examId: s.exam_id || examId,
        startTime: s.start_time || s.startTime,
        endTime: s.end_time || s.endTime,
        capacity: Number(s.capacity) || 30,
      })
    })

    const combinedSlots = Array.from(slotMap.values())

    // Calculate booked counts
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
        if (reg.slotId === s.id && reg.examId === examId) bookedCount++
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

export const createExamSlot = async (req, res) => {
  try {
    const { examId } = req.params
    const { startTime, endTime, capacity } = req.body

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and End time are required' })
    }

    const slotId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const slotObj = {
      id: slotId,
      examId,
      exam_id: examId,
      startTime,
      start_time: startTime,
      endTime,
      end_time: endTime,
      capacity: Number(capacity) || 30,
    }

    // Always store in memory fallback
    const key = String(examId)
    if (!memorySlots.has(key)) memorySlots.set(key, [])
    memorySlots.get(key).push(slotObj)

    // Store in Supabase if available
    const { data, error } = await supabase
      .from('ex_exam_slots')
      .insert({
        id: slotId,
        exam_id: examId,
        start_time: startTime,
        end_time: endTime,
        capacity: Number(capacity) || 30,
      })
      .select()
      .maybeSingle()

    if (error) {
      console.warn('Supabase slot insert warning (using memory fallback):', error.message)
    }

    res.status(201).json({ message: 'Slot created successfully', slot: slotObj })
  } catch (err) {
    console.error('Error creating slot:', err)
    res.status(500).json({ error: err.message || 'Failed to create slot' })
  }
}

export const deleteExamSlot = async (req, res) => {
  try {
    const { examId, slotId } = req.params

    await supabase.from('ex_exam_slots').delete().eq('id', slotId)

    if (memorySlots.has(examId)) {
      const list = memorySlots.get(examId).filter((s) => s.id !== slotId)
      memorySlots.set(examId, list)
    }

    res.json({ message: 'Slot deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete slot' })
  }
}

export const bulkAssignCandidates = async (req, res) => {
  try {
    const { examId } = req.params
    const { candidates } = req.body

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'No candidates provided for assignment' })
    }

    let assignedCount = 0

    for (const c of candidates) {
      const email = c.email?.trim().toLowerCase()
      const rollNumber = c.roll_number || c.rollNumber || `STU-${Math.floor(1000 + Math.random() * 9000)}`
      const password = c.password || 'Student@123'
      const name = c.name || 'Student Candidate'

      if (!email) continue

      const hashedPassword = await bcrypt.hash(password, 10)
      let candidateUser = null

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
            name,
            roll_number: rollNumber,
          })
          .eq('id', existing.id)
          .select()
          .single()

        candidateUser = updatedUser || { ...existing, password_hash: hashedPassword }
      } else {
        const { data: newUser, error: createErr } = await supabase
          .from('ex_users')
          .insert({
            name,
            email,
            roll_number: rollNumber,
            password_hash: hashedPassword,
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
            role: 'CANDIDATE',
            roll_number: rollNumber,
          }
        }
      }

      if (candidateUser) {
        const key = `${candidateUser.id}_${examId}`
        memoryRegistrations.set(key, {
          candidateId: candidateUser.id,
          name,
          email,
          rollNumber,
          examId,
          slotId: null,
          assignedAt: new Date().toISOString(),
        })

        memoryUsers.set(email, candidateUser)

        await supabase.from('ex_exam_registrations').upsert({
          exam_id: examId,
          candidate_id: candidateUser.id,
        })
        assignedCount++
      }
    }

    res.json({ message: `Successfully assigned ${assignedCount} students to exam`, assignedCount })
  } catch (err) {
    console.error('Error bulk assigning candidates:', err)
    res.status(500).json({ error: err.message || 'Failed to assign candidates' })
  }
}

export const getCandidateAssignedExams = async (req, res) => {
  try {
    const candidateId = req.user.id

    const assignedExamIds = new Set()
    for (const reg of memoryRegistrations.values()) {
      if (reg.candidateId === candidateId) assignedExamIds.add(reg.examId)
    }

    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('exam_id, slot_id, slot_start_time, slot_end_time')
      .eq('candidate_id', candidateId)

    if (dbRegs) {
      dbRegs.forEach((r) => assignedExamIds.add(r.exam_id))
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

export const bookSlot = async (req, res) => {
  try {
    const { examId } = req.params
    const { slotId } = req.body
    const candidateId = req.user.id

    if (!slotId) return res.status(400).json({ error: 'Slot ID is required' })

    let slots = memorySlots.get(examId) || []
    const { data: dbSlots } = await supabase.from('ex_exam_slots').select('*').eq('exam_id', examId)
    if (dbSlots && dbSlots.length > 0) {
      const slotMap = new Map()
      slots.forEach((s) => slotMap.set(s.id, s))
      dbSlots.forEach((s) => slotMap.set(s.id, s))
      slots = Array.from(slotMap.values())
    }

    const targetSlot = slots.find((s) => s.id === slotId)
    if (!targetSlot) return res.status(404).json({ error: 'Slot not found' })

    const regKey = `${candidateId}_${examId}`
    const startTime = targetSlot.start_time || targetSlot.startTime
    const endTime = targetSlot.end_time || targetSlot.endTime

    const booking = {
      candidateId,
      examId,
      slotId: targetSlot.id,
      startTime,
      endTime,
      bookedAt: new Date().toISOString(),
    }

    memoryRegistrations.set(regKey, booking)

    await supabase.from('ex_exam_registrations').upsert({
      exam_id: examId,
      candidate_id: candidateId,
      slot_id: targetSlot.id,
      slot_start_time: startTime,
      slot_end_time: endTime,
      booked_at: booking.bookedAt,
    })

    res.json({ message: 'Slot booked successfully', booking })
  } catch (err) {
    console.error('Error booking slot:', err)
    res.status(500).json({ error: err.message || 'Failed to book slot' })
  }
}

export const getMyBooking = async (req, res) => {
  try {
    const { examId } = req.params
    const candidateId = req.user.id
    const regKey = `${candidateId}_${examId}`

    let booking = memoryRegistrations.get(regKey)
    if (!booking) {
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
        }
      }
    }

    res.json({ booking: booking || null })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch booking' })
  }
}

export const getAssignedStudents = async (req, res) => {
  try {
    const { examId } = req.params

    const candidatesMap = new Map()

    // 1. Fetch from Database ex_exam_registrations
    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('candidate_id, slot_id, slot_start_time, slot_end_time, assigned_at, booked_at, ex_users(name, email, roll_number)')
      .eq('exam_id', examId)

    if (dbRegs) {
      dbRegs.forEach((r) => {
        candidatesMap.set(r.candidate_id, {
          candidateId: r.candidate_id,
          name: r.ex_users?.name || 'Student Candidate',
          email: r.ex_users?.email || '',
          rollNumber: r.ex_users?.roll_number || '',
          slotId: r.slot_id,
          slotStartTime: r.slot_start_time,
          slotEndTime: r.slot_end_time,
          assignedAt: r.assigned_at,
          bookedAt: r.booked_at,
        })
      })
    }

    // 2. Fetch memory fallbacks
    for (const [key, reg] of memoryRegistrations.entries()) {
      if (reg.examId === examId && !candidatesMap.has(reg.candidateId)) {
        candidatesMap.set(reg.candidateId, {
          candidateId: reg.candidateId,
          name: reg.name || 'Student Candidate',
          email: reg.email || '',
          rollNumber: reg.rollNumber || '',
          slotId: reg.slotId || null,
          slotStartTime: reg.startTime || null,
          slotEndTime: reg.endTime || null,
          assignedAt: reg.assignedAt || new Date().toISOString(),
        })
      }
    }

    const students = Array.from(candidatesMap.values())
    res.json({ students })
  } catch (err) {
    console.error('Error fetching assigned students:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch assigned students' })
  }
}

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

    res.json({ message: 'Candidate removed from exam successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to remove candidate' })
  }
}
