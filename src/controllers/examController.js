import { supabase } from '../config/db.js'
import { memorySlots, memoryRegistrations, memoryExamSettings, setExamSlotBookingSetting, saveStateToDisk } from './slotController.js'

export const getAllExams = async (req, res) => {
  try {
    const { status } = req.query
    let query = supabase.from('ex_exams').select('*, ex_questions(id, section_id), ex_exam_sections(id, max_questions_limit, name), ex_attempts(count), ex_exam_slots(id), ex_exam_registrations(id)')

    if (status) {
      query = query.eq('status', status.toUpperCase())
    } else if (req.user.role === 'CANDIDATE') {
      query = query.in('status', ['SCHEDULED', 'LIVE', 'COMPLETED'])
    }

    const { data: exams, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    const formatted = (exams || []).map((e) => {
      let expectedQuestionsCount = 0
      const sections = e.ex_exam_sections || []
      const questions = e.ex_questions || []

      if (sections.length > 0) {
        sections.forEach(sec => {
          const secQs = questions.filter(q => q.section_id === sec.id)
          const limit = sec.max_questions_limit
          const count = limit && limit > 0 ? Math.min(secQs.length, limit) : secQs.length
          expectedQuestionsCount += count
        })
        const unsecQs = questions.filter(q => !q.section_id)
        expectedQuestionsCount += unsecQs.length
      } else {
        expectedQuestionsCount = questions.length
      }

      const dbSlotCount = (e.ex_exam_slots || []).length
      const totalSlots = dbSlotCount

      const dbStudentCount = (e.ex_exam_registrations || []).length
      const totalStudents = dbStudentCount

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
        blockTabSwitch: e.block_tab_switch,
        shuffleQuestions: e.shuffle_questions,
        shuffleOptions: e.shuffle_options,
        showImmediateResults: e.published_results ?? false,
        publishedResults: e.published_results,
        slotBookingEnabled: (memoryExamSettings.get(String(e.id))?.slotBookingEnabled !== undefined) ? memoryExamSettings.get(String(e.id)).slotBookingEnabled : (e.slot_booking_enabled !== false),
        expectedQuestionsCount,
        _count: {
          questions: questions.length,
          attempts: e.ex_attempts?.[0]?.count || 0,
          slots: totalSlots,
          students: totalStudents,
        },
      }
    })


    res.json({ exams: formatted })
  } catch (error) {
    console.error('Error fetching exams:', error)
    res.status(500).json({ error: 'Failed to fetch exams' })
  }
}

export const getExamById = async (req, res) => {
  try {
    const { id } = req.params
    const isCandidate = req.user.role === 'CANDIDATE'

    const { data: exam, error } = await supabase
      .from('ex_exams')
      .select('*, ex_questions(*), ex_exam_sections(*)')
      .eq('id', id)
      .single()

    if (error || !exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    const formattedQuestions = (exam.ex_questions || []).map((q) => ({
      id: q.id,
      sectionId: q.section_id,
      subject: q.subject,
      topic: q.topic,
      type: q.type,
      statement: q.statement,
      options: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : (q.options_json || []),
      points: q.points,
      difficulty: q.difficulty,
      correctAnswer: !isCandidate ? q.correct_answer : undefined,
    }))

    let expectedQuestionsCount = 0
    const sections = exam.ex_exam_sections || []
    if (sections.length > 0) {
      sections.forEach(sec => {
        const secQs = formattedQuestions.filter(q => q.sectionId === sec.id)
        const limit = sec.max_questions_limit
        const count = limit && limit > 0 ? Math.min(secQs.length, limit) : secQs.length
        expectedQuestionsCount += count
      })
      const unsecQs = formattedQuestions.filter(q => !q.sectionId)
      expectedQuestionsCount += unsecQs.length
    } else {
      expectedQuestionsCount = formattedQuestions.length
    }

    res.json({
      exam: {
        id: exam.id,
        code: exam.code,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.duration_minutes,
        totalMarks: exam.total_marks,
        passMarks: exam.pass_marks,
        status: exam.status,
        proctoringEnabled: exam.proctoring_enabled,
        shuffleQuestions: exam.shuffle_questions,
        showImmediateResults: exam.published_results ?? false,
        publishedResults: exam.published_results,
        slotBookingEnabled: (memoryExamSettings.get(String(exam.id))?.slotBookingEnabled !== undefined) ? memoryExamSettings.get(String(exam.id)).slotBookingEnabled : (exam.slot_booking_enabled !== false),
        expectedQuestionsCount,
        questions: formattedQuestions,
      },
    })
  } catch (error) {
    console.error('Error fetching exam:', error)
    res.status(500).json({ error: 'Failed to fetch exam details' })
  }
}

export const createExam = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      durationMinutes,
      totalMarks,
      // Support both field name variants from the frontend form
      passMarks,
      passingMarks,
      status,
      proctoringEnabled,
      blockTabSwitch,
      shuffleQuestions,
      shuffleOptions,
      showImmediateResults,
    } = req.body

    // Resolve pass marks: admin-set value takes priority; fallback to 0 (never auto-set)
    const resolvedPassMarks = Number(passMarks ?? passingMarks ?? 0)

    const insertPayload = {
      code: code.trim().toUpperCase(),
      title,
      description,
      duration_minutes: durationMinutes || 60,
      total_marks: totalMarks || 0,
      pass_marks: resolvedPassMarks,
      status: status || 'DRAFT',
      proctoring_enabled: proctoringEnabled ?? true,
      block_tab_switch: blockTabSwitch ?? true,
      shuffle_questions: shuffleQuestions ?? true,
      shuffle_options: shuffleOptions ?? true,
      published_results: showImmediateResults ?? false,
      slot_booking_enabled: req.body.slotBookingEnabled ?? req.body.slot_booking_enabled ?? true,
    }

    let { data: exam, error } = await supabase
      .from('ex_exams')
      .insert(insertPayload)
      .select()
      .single()

    if (error && (error.code === 'PGRST204' || String(error.message).includes('slot_booking_enabled'))) {
      console.warn('⚠️ Supabase DB missing slot_booking_enabled column. Retrying insert without column...')
      delete insertPayload.slot_booking_enabled
      const retry = await supabase
        .from('ex_exams')
        .insert(insertPayload)
        .select()
        .single()
      exam = retry.data
      error = retry.error
    }

    if (error) throw error

    const slotSettingVal = req.body.slotBookingEnabled ?? req.body.slot_booking_enabled ?? true
    if (exam && exam.id) {
      setExamSlotBookingSetting(exam.id, slotSettingVal)
    }

    res.status(201).json({ message: 'Exam created successfully', exam })
  } catch (error) {
    console.error('Error creating exam:', error)
    res.status(500).json({ error: error.message || 'Failed to create exam' })
  }
}

export const updateExam = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = {}
    if (req.body.title) updateData.title = req.body.title
    if (req.body.code) updateData.code = req.body.code
    if (req.body.description !== undefined) updateData.description = req.body.description
    if (req.body.durationMinutes) updateData.duration_minutes = req.body.durationMinutes
    if (req.body.totalMarks !== undefined) updateData.total_marks = req.body.totalMarks
    if (req.body.passMarks !== undefined) updateData.pass_marks = Number(req.body.passMarks)
    if (req.body.passingMarks !== undefined) updateData.pass_marks = Number(req.body.passingMarks)
    if (req.body.status) updateData.status = req.body.status
    if (req.body.proctoringEnabled !== undefined) updateData.proctoring_enabled = req.body.proctoringEnabled
    if (req.body.shuffleQuestions !== undefined) updateData.shuffle_questions = req.body.shuffleQuestions
    if (req.body.showImmediateResults !== undefined) updateData.published_results = req.body.showImmediateResults
    if (req.body.publishedResults !== undefined) updateData.published_results = req.body.publishedResults
    if (req.body.slotBookingEnabled !== undefined) updateData.slot_booking_enabled = req.body.slotBookingEnabled
    if (req.body.slot_booking_enabled !== undefined) updateData.slot_booking_enabled = req.body.slot_booking_enabled

    let { data: exam, error } = await supabase
      .from('ex_exams')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error && (error.code === 'PGRST204' || String(error.message).includes('slot_booking_enabled'))) {
      console.warn('⚠️ Supabase DB missing slot_booking_enabled column. Retrying update without column...')
      delete updateData.slot_booking_enabled
      const retry = await supabase
        .from('ex_exams')
        .update(updateData)
        .eq('id', id)
        .select()
      exam = retry.data
      error = retry.error
    }

    if (error) throw error

    const slotSettingVal = req.body.slotBookingEnabled ?? req.body.slot_booking_enabled
    if (slotSettingVal !== undefined) {
      setExamSlotBookingSetting(id, slotSettingVal)
    }

    res.json({ message: 'Exam updated successfully', exam })
  } catch (error) {
    console.error('Error updating exam:', error)
    res.status(500).json({ error: error.message || 'Failed to update exam' })
  }
}

export const deleteExam = async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase
      .from('ex_exams')
      .delete()
      .eq('id', id)

    if (error) throw error

    res.json({ message: 'Exam deleted successfully' })
  } catch (error) {
    console.error('Error deleting exam:', error)
    res.status(500).json({ error: error.message || 'Failed to delete exam' })
  }
}

export const notifyCandidates = async (req, res) => {
  try {
    const { id } = req.params
    const forceResend = req.body?.forceResend === true || req.query?.force === 'true'
    const targetCandidateId = req.body?.candidateId

    const { data: exam, error: examErr } = await supabase
      .from('ex_exams')
      .select('*')
      .eq('id', id)
      .single()

    if (examErr || !exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    const { data: dbRegs } = await supabase
      .from('ex_exam_registrations')
      .select('*')
      .eq('exam_id', id)

    const candidatesMap = new Map()

    if (dbRegs && dbRegs.length > 0) {
      const candidateIds = dbRegs.map((r) => r.candidate_id).filter(Boolean)
      if (candidateIds.length > 0) {
        const { data: userList } = await supabase
          .from('ex_users')
          .select('id, name, email, roll_number, raw_password')
          .in('id', candidateIds)

        const userMap = new Map((userList || []).map((u) => [u.id, u]))
        dbRegs.forEach((r) => {
          const u = userMap.get(r.candidate_id)
          if (u) {
            candidatesMap.set(u.id, {
              id: u.id,
              name: u.name || 'Student Candidate',
              email: u.email,
              roll_number: u.roll_number,
              raw_password: u.raw_password || 'Pass@1234',
              email_sent: r.email_sent || false,
              email_sent_at: r.email_sent_at || null,
            })
          }
        })
      }
    }

    for (const [regKey, reg] of memoryRegistrations.entries()) {
      if (reg.examId === id) {
        const existing = candidatesMap.get(reg.candidateId)
        if (!existing) {
          candidatesMap.set(reg.candidateId, {
            id: reg.candidateId,
            name: reg.name || 'Student Candidate',
            email: reg.email,
            roll_number: reg.rollNumber,
            raw_password: reg.password || 'Pass@1234',
            email_sent: reg.emailSent || false,
            email_sent_at: reg.emailSentAt || null,
          })
        } else {
          if (reg.emailSent) {
            existing.email_sent = true
            existing.email_sent_at = reg.emailSentAt
          }
        }
      }
    }

    const candidates = Array.from(candidatesMap.values())

    if (candidates.length === 0) {
      return res.status(400).json({ error: 'No assigned candidates found for this exam. Please upload a student roster first.' })
    }

    let candidatesToNotify = candidates
    if (targetCandidateId) {
      candidatesToNotify = candidates.filter((c) => String(c.id) === String(targetCandidateId))
    } else if (!forceResend) {
      candidatesToNotify = candidates.filter((c) => !c.email_sent)
    }

    const skippedCount = candidates.length - candidatesToNotify.length

    if (candidatesToNotify.length === 0) {
      return res.json({
        message: `All ${candidates.length} assigned candidate(s) have already received their invitation emails. No duplicate emails sent.`,
        sentCount: 0,
        skippedCount,
        totalCandidates: candidates.length,
        simulated: false,
      })
    }

    const { sendExamInvitationEmail } = await import('../services/emailService.js')
    let sentCount = 0
    let simulated = false
    const nowStr = new Date().toISOString()

    for (const c of candidatesToNotify) {
      if (!c.email) continue
      const result = await sendExamInvitationEmail({
        candidateName: c.name || 'Student',
        candidateEmail: c.email,
        rollNumber: c.roll_number || 'STU-GEN',
        rawPassword: c.raw_password || 'Pass@1234',
        examTitle: exam.title,
        examCode: exam.code,
        durationMinutes: exam.duration_minutes,
        totalMarks: exam.total_marks,
        slotBookingEnabled: exam.slot_booking_enabled !== false,
        candidatePortalUrl: `${process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5050'}/login`,
      })
      if (result.simulated) simulated = true
      sentCount++

      c.email_sent = true
      c.email_sent_at = nowStr

      try {
        await supabase
          .from('ex_exam_registrations')
          .update({
            email_sent: true,
            email_sent_at: nowStr,
          })
          .eq('exam_id', id)
          .eq('candidate_id', c.id)
      } catch (dbErr) {
        console.warn('Notice: Could not update email_sent status in DB schema:', dbErr.message)
      }

      for (const [mKey, mVal] of memoryRegistrations.entries()) {
        if (mVal.examId === id && mVal.candidateId === c.id) {
          mVal.emailSent = true
          mVal.emailSentAt = nowStr
        }
      }
    }

    saveStateToDisk()

    let message = `Successfully processed email invitations for ${sentCount} candidate(s)!`
    if (skippedCount > 0) {
      message += ` (${skippedCount} candidate(s) skipped as email was already sent previously)`
    }

    res.json({
      message,
      sentCount,
      skippedCount,
      totalCandidates: candidates.length,
      simulated,
    })
  } catch (error) {
    console.error('Error notifying candidates:', error)
    res.status(500).json({ error: error.message || 'Failed to dispatch email invitations' })
  }
}
