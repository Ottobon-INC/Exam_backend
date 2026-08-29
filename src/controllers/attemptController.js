import { supabase } from '../config/db.js'
import { memoryRegistrations } from './slotController.js'

export const computeSectionScores = (sections, allQuestions, attemptAnswers) => {
  const answeredQIds = new Set((attemptAnswers || []).map((a) => a.question_id))
  const servedQuestions = (attemptAnswers || []).length > 0
    ? allQuestions.filter((q) => answeredQIds.has(q.id))
    : allQuestions

  return sections.map((sec) => {
    const secQs = servedQuestions.filter((q) => q.section_id === sec.id)
    const secQIds = secQs.map((q) => q.id)
    const secAnswers = (attemptAnswers || []).filter((a) => secQIds.includes(a.question_id))
    const score = secAnswers.reduce((sum, a) => sum + (Number(a.score_awarded) || 0), 0)
    const totalSecMarks = secQs.reduce((sum, q) => sum + (Number(q.points) || 1), 0)

    // Treat cutoff_marks as a percentage (%) of served section total points
    const cutoffPercentage = Number(sec.cutoff_marks) || 0
    const requiredScore = totalSecMarks > 0 ? (cutoffPercentage / 100) * totalSecMarks : 0
    const cutoffMet = score >= requiredScore

    return {
      id: sec.id,
      name: sec.name,
      score,
      totalSecMarks,
      cutoffPercentage,
      requiredScore,
      cutoffMet,
    }
  })
}

export const startAttempt = async (req, res) => {
  try {
    const { examId } = req.body
    const candidateId = req.user.id

    // Check candidate time slot booking guard from combined ex_exam_registrations table
    const { data: dbRegistration } = await supabase
      .from('ex_exam_registrations')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('exam_id', examId)
      .maybeSingle()

    if (dbRegistration && dbRegistration.slot_start_time) {
      const now = new Date()
      const slotStart = new Date(dbRegistration.slot_start_time)
      const slotEnd = new Date(dbRegistration.slot_end_time)

      if (now < slotStart) {
        return res.status(400).json({
          error: `Your time slot has not started yet. Scheduled slot: ${slotStart.toLocaleString()}`
        })
      }
      if (now > slotEnd) {
        return res.status(400).json({
          error: `Your scheduled time slot expired at ${slotEnd.toLocaleString()}.`
        })
      }
    }

    // Check if active attempt exists
    const { data: existingAttempt } = await supabase
      .from('ex_attempts')
      .select('*, ex_answers(*)')
      .eq('exam_id', examId)
      .eq('candidate_id', candidateId)
      .eq('status', 'IN_PROGRESS')
      .maybeSingle()

    // Fetch exam structure
    const { data: examData, error: examError } = await supabase
      .from('ex_exams')
      .select('*, ex_questions(*), ex_exam_sections(*)')
      .eq('id', examId)
      .single()

    if (examError || !examData) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    const allQuestions = examData.ex_questions || []
    const sections = (examData.ex_exam_sections || []).sort((a, b) => a.order_index - b.order_index)
    const shuffle = examData.shuffle_questions

    const shuffleArray = (arr) => {
      const copy = [...arr]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }

    let attempt
    if (existingAttempt) {
      attempt = existingAttempt
    } else {
      const { data: newAttempt, error: attemptErr } = await supabase
        .from('ex_attempts')
        .insert({
          exam_id: examId,
          candidate_id: candidateId,
          status: 'IN_PROGRESS',
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (attemptErr) throw attemptErr
      attempt = newAttempt

      // Subset questions based on section rules & question limits (randomly samples 15 out of 100)
      const selectedQuestions = []
      if (sections.length > 0) {
        sections.forEach((sec) => {
          let secQs = allQuestions.filter((q) => q.section_id === sec.id)
          // Always shuffle pool so candidate receives a true random subset
          secQs = shuffleArray(secQs)
          const limit = sec.max_questions_limit || sec.maxQuestionsLimit
          const count = limit && Number(limit) > 0 ? Math.min(secQs.length, Number(limit)) : secQs.length
          selectedQuestions.push(...secQs.slice(0, count))
        })

        let unsectioned = allQuestions.filter((q) => !q.section_id)
        if (unsectioned.length > 0) {
          unsectioned = shuffleArray(unsectioned)
          const unSecLimit = examData.expected_questions_count || examData.max_questions_limit || examData.question_limit
          const count = unSecLimit && Number(unSecLimit) > 0 ? Math.min(unsectioned.length, Number(unSecLimit)) : unsectioned.length
          selectedQuestions.push(...unsectioned.slice(0, count))
        }
      } else {
        // Unsectioned exam — shuffle 100 questions pool and pick random subset of 15
        let qs = shuffleArray(allQuestions)
        const limit = examData.expected_questions_count || examData.max_questions_limit || examData.question_limit
        const count = limit && Number(limit) > 0 ? Math.min(qs.length, Number(limit)) : qs.length
        selectedQuestions.push(...qs.slice(0, count))
      }

      // Pre-insert answers to lock this subset to the attempt
      const answerInserts = selectedQuestions.map((q) => ({
        id: `${attempt.id}_${q.id}`,
        attempt_id: attempt.id,
        question_id: q.id,
      }))

      if (answerInserts.length > 0) {
        const { error: ansError } = await supabase.from('ex_answers').insert(answerInserts)
        if (ansError) console.error('Failed to pre-insert answers:', ansError)
        attempt.ex_answers = answerInserts
      }
    }

    // Now build response
    const assignedQuestionIds = new Set((attempt.ex_answers || []).map((a) => a.question_id))
    const assignedQuestions = allQuestions.filter((q) => assignedQuestionIds.has(q.id))

    const formatQuestion = (q) => {
      let opts = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : (q.options_json || [])
      // Dual Randomization: Shuffle options for every student
      if (Array.isArray(opts)) {
        opts = shuffleArray(opts)
      }
      return {
        id: q.id,
        sectionId: q.section_id,
        subject: q.subject,
        topic: q.topic,
        type: q.type,
        statement: q.statement,
        options: opts,
        points: q.points,
        difficulty: q.difficulty,
      }
    }

    let formattedSections
    let unsectionedQuestions

    if (sections.length > 0) {
      formattedSections = sections.map((section) => {
        let sectionQs = assignedQuestions.filter((q) => q.section_id === section.id)
        if (shuffle) sectionQs = shuffleArray(sectionQs)
        return {
          id: section.id,
          name: section.name,
          cutoffMarks: section.cutoff_marks,
          orderIndex: section.order_index,
          questions: sectionQs.map(formatQuestion),
        }
      })
      let unsectioned = assignedQuestions.filter((q) => !q.section_id)
      if (shuffle) unsectioned = shuffleArray(unsectioned)
      unsectionedQuestions = unsectioned.map(formatQuestion)
    } else {
      formattedSections = []
      let qs = [...assignedQuestions]
      if (shuffle) qs = shuffleArray(qs)
      unsectionedQuestions = qs.map(formatQuestion)
    }

    const allFormattedQs = [
      ...formattedSections.flatMap((s) => s.questions),
      ...(unsectionedQuestions || []),
    ]
    const dynamicTotalMarks = allFormattedQs.reduce((sum, q) => sum + (Number(q.points) || 0), 0)

    res.json({
      attemptId: attempt.id,
      startedAt: attempt.started_at,
      status: attempt.status,
      savedAnswers: (attempt.ex_answers || []).map((a) => ({
        questionId: a.question_id,
        selectedOption: a.selected_option,
        textAnswer: a.text_answer,
      })),
      exam: {
        id: examData.id,
        code: examData.code,
        title: examData.title,
        durationMinutes: examData.duration_minutes,
        totalMarks: dynamicTotalMarks || examData.total_marks,
        passMarks: examData.pass_marks,
        shuffleOptions: examData.shuffle_options,
        sections: formattedSections,
        unsectionedQuestions,
      },
    })
  } catch (error) {
    console.error('Error starting attempt:', error)
    res.status(500).json({ error: error.message || 'Failed to initialize exam attempt' })
  }
}

export const saveAnswer = async (req, res) => {
  try {
    const { attemptId, questionId, selectedOption, textAnswer } = req.body

    const id = `${attemptId}_${questionId}`
    const { data: answer, error } = await supabase
      .from('ex_answers')
      .upsert({
        id,
        attempt_id: attemptId,
        question_id: questionId,
        selected_option: selectedOption !== undefined ? String(selectedOption) : null,
        text_answer: textAnswer !== undefined ? textAnswer : null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    res.json({ message: 'Answer auto-saved', answer })
  } catch (error) {
    console.error('Error saving answer:', error)
    res.status(500).json({ error: error.message || 'Failed to auto-save answer' })
  }
}

export const isAnswerCorrect = (q, rawSelectedOption) => {
  if (!q || rawSelectedOption === null || rawSelectedOption === undefined) return false
  const selectedStr = String(rawSelectedOption).trim()
  if (!selectedStr) return false

  const correctStr = String(q.correct_answer ?? '').trim()
  if (!correctStr) return false

  // 1. Direct string match (case-insensitive)
  if (selectedStr.toLowerCase() === correctStr.toLowerCase()) return true

  // Parse original options array
  const origOptions = typeof q.options_json === 'string'
    ? JSON.parse(q.options_json)
    : (q.options_json || [])

  if (Array.isArray(origOptions) && origOptions.length > 0) {
    // 2. If correct_answer is an index (e.g. "0", "1", "2", "3")
    const correctAsIdx = parseInt(correctStr, 10)
    if (!isNaN(correctAsIdx) && correctAsIdx >= 0 && correctAsIdx < origOptions.length) {
      const targetOptionText = String(origOptions[correctAsIdx]).trim()
      if (selectedStr.toLowerCase() === targetOptionText.toLowerCase()) return true
      if (selectedStr === String(correctAsIdx)) return true
    }

    // 3. If correct_answer is a letter (e.g. "A", "B", "C", "D")
    const letterMap = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }
    const letterIdx = letterMap[correctStr.toUpperCase()]
    if (letterIdx !== undefined && letterIdx < origOptions.length) {
      const targetOptionText = String(origOptions[letterIdx]).trim()
      if (selectedStr.toLowerCase() === targetOptionText.toLowerCase()) return true
      if (selectedStr === String(letterIdx)) return true
    }

    // 4. If selectedStr is an index (e.g. "0", "1") and correctStr matches original option at that index
    const selectedAsIdx = parseInt(selectedStr, 10)
    if (!isNaN(selectedAsIdx) && selectedAsIdx >= 0 && selectedAsIdx < origOptions.length) {
      const chosenOptionText = String(origOptions[selectedAsIdx]).trim()
      if (chosenOptionText.toLowerCase() === correctStr.toLowerCase()) return true
    }
  }

  // 5. Numerical matching
  if (q.type === 'NUMERICAL') {
    const selNum = parseFloat(selectedStr)
    const corNum = parseFloat(correctStr)
    if (!isNaN(selNum) && !isNaN(corNum)) {
      return Math.abs(selNum - corNum) < 0.0001
    }
  }

  return false
}

export const submitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.body

    const { data: attempt, error } = await supabase
      .from('ex_attempts')
      .select('*, ex_exams(*, ex_exam_sections(*), ex_questions(*)), ex_answers(*)')
      .eq('id', attemptId)
      .single()

    if (error || !attempt) {
      return res.status(404).json({ error: 'Attempt not found' })
    }

    const exam = attempt.ex_exams
    const allQuestions = exam?.ex_questions || []
    const sections = (exam?.ex_exam_sections || []).sort((a, b) => a.order_index - b.order_index)
    const answers = attempt.ex_answers || []

    const assignedQuestionIds = new Set(answers.map((a) => a.question_id))
    const assignedQuestions = allQuestions.filter((q) => assignedQuestionIds.has(q.id))

    let totalScore = 0
    let totalMaxScore = 0
    let requiresManual = false

    for (const q of assignedQuestions) {
      const qPoints = Number(q.points) || 1
      totalMaxScore += qPoints
      const ans = answers.find((a) => a.question_id === q.id)
      const negPenalty = Number(q.negative_points) || 0

      if (q.type === 'MCQ' || q.type === 'SINGLE_CHOICE' || q.type === 'NUMERICAL') {
        const hasAnswer = ans && ans.selected_option !== null && ans.selected_option !== undefined && String(ans.selected_option).trim() !== ''
        if (hasAnswer && isAnswerCorrect(q, ans.selected_option)) {
          // Correct answer → full marks (1 pt)
          totalScore += qPoints
          await supabase.from('ex_answers').update({ score_awarded: qPoints }).eq('id', ans.id)
        } else if (hasAnswer && negPenalty > 0) {
          // Wrong answer with negative marking → deduct penalty
          totalScore -= negPenalty
          await supabase.from('ex_answers').update({ score_awarded: -negPenalty }).eq('id', ans.id)
        } else if (ans) {
          // Wrong answer with no negative marking OR unattempted → 0
          await supabase.from('ex_answers').update({ score_awarded: 0 }).eq('id', ans.id)
        }
      } else {
        // Subjective / Essay — requires manual evaluation
        requiresManual = true
      }
    }

    // Ensure total score never goes below 0
    totalScore = Math.max(0, totalScore)
    const percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0

    let sectionalPass = null
    if (sections.length > 0) {
      const { data: freshAnswers } = await supabase
        .from('ex_answers')
        .select('question_id, score_awarded')
        .eq('attempt_id', attemptId)

      const sectionBreakdown = computeSectionScores(sections, assignedQuestions, freshAnswers || [])
      sectionalPass = sectionBreakdown.every((s) => s.cutoffMet)
    }

    const { data: updatedAttempt, error: updateErr } = await supabase
      .from('ex_attempts')
      .update({
        status: (requiresManual || !exam?.published_results) ? 'SUBMITTED' : 'EVALUATED',
        submitted_at: new Date().toISOString(),
        total_score: totalScore,
        percentage: parseFloat(percentage.toFixed(2)),
        sectional_pass: sectionalPass,
      })
      .eq('id', attemptId)
      .select()
      .single()

    if (updateErr) throw updateErr

    let sectionBreakdown = []
    if (sections.length > 0) {
      const { data: freshAnswers } = await supabase
        .from('ex_answers')
        .select('question_id, score_awarded')
        .eq('attempt_id', attemptId)
      sectionBreakdown = computeSectionScores(sections, assignedQuestions, freshAnswers || [])
    }

    res.json({
      message: 'Exam submitted successfully',
      attempt: updatedAttempt,
      score: totalScore,
      totalMaxScore,
      percentage: parseFloat(percentage.toFixed(2)),
      sectionalPass,
      sectionBreakdown,
    })
  } catch (error) {
    console.error('Error submitting exam:', error)
    res.status(500).json({ error: error.message || 'Failed to submit exam attempt' })
  }
}

export const getExamLeaderboard = async (req, res) => {
  try {
    const examId = req.params.id || req.params.examId

    if (!examId || examId === 'undefined') {
      return res.status(400).json({ error: 'Valid exam ID is required' })
    }

    const { data: exam } = await supabase
      .from('ex_exams')
      .select('id, title, code, total_marks, pass_marks, ex_questions(id, section_id, points), ex_exam_sections(id, max_questions_limit)')
      .eq('id', examId)
      .single()

    const { data: attempts, error } = await supabase
      .from('ex_attempts')
      .select('*, ex_answers(question_id, score_awarded)')
      .eq('exam_id', examId)
      .in('status', ['SUBMITTED', 'EVALUATED', 'COMPLETED'])

    if (error) throw error

    const qMap = new Map((exam?.ex_questions || []).map((q) => [q.id, Number(q.points) || 1]))

    let defaultMaxScore = Number(exam?.total_marks) || 0
    if (!defaultMaxScore && exam?.ex_exam_sections?.length) {
      (exam.ex_exam_sections || []).forEach((sec) => {
        const secQs = (exam.ex_questions || []).filter((q) => q.section_id === sec.id)
        secQs.sort((a, b) => (Number(b.points) || 1) - (Number(a.points) || 1))
        const limit = Number(sec.max_questions_limit)
        const count = limit && limit > 0 ? Math.min(secQs.length, limit) : secQs.length
        defaultMaxScore += secQs.slice(0, count).reduce((s, q) => s + (Number(q.points) || 1), 0)
      })
    }
    if (!defaultMaxScore) {
      defaultMaxScore = (exam?.ex_questions || []).reduce((s, q) => s + (Number(q.points) || 1), 0) || 100
    }

    const candidateIds = Array.from(new Set((attempts || []).map((a) => a.candidate_id).filter(Boolean)))
    let users = []
    if (candidateIds.length > 0) {
      const { data: fetchedUsers } = await supabase
        .from('ex_users')
        .select('id, name, email, roll_number')
        .in('id', candidateIds)
      users = fetchedUsers || []
    }

    const userMap = new Map(users.map((u) => [u.id, u]))

    for (const reg of memoryRegistrations.values()) {
      if (reg.candidateId && !userMap.has(reg.candidateId)) {
        userMap.set(reg.candidateId, {
          id: reg.candidateId,
          name: reg.name || 'Candidate',
          email: reg.email || '',
          roll_number: reg.rollNumber || '',
        })
      }
    }

    const formatted = (attempts || []).map((a) => {
      const u = userMap.get(a.candidate_id)
      const start = a.started_at ? new Date(a.started_at) : null
      const end = a.submitted_at ? new Date(a.submitted_at) : null
      const durationSeconds = (start && end) ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000)) : 0

      const totalScore = Number(a.total_score) || 0

      // Compute attempt-specific served max score
      const servedAns = a.ex_answers || []
      let attemptMaxScore = 0
      if (servedAns.length > 0) {
        attemptMaxScore = servedAns.reduce((sum, ans) => sum + (qMap.get(ans.question_id) || 1), 0)
      }
      const maxScore = attemptMaxScore || defaultMaxScore

      const passCutoff = Number(exam?.pass_marks) || 0
      const percentage = Number(a.percentage) || (maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0)
      const overallCutoffPassed = totalScore >= passCutoff
      const sectionalCutoffsPassed = a.sectional_pass !== false
      const passed = overallCutoffPassed && sectionalCutoffsPassed

      return {
        attemptId: a.id,
        candidateId: a.candidate_id,
        candidateName: u?.name || 'Candidate',
        candidateEmail: u?.email || 'student@exam.com',
        rollNumber: u?.roll_number || 'STU-1001',
        totalScore,
        maxScore,
        percentage,
        passed,
        durationSeconds,
        durationFormatted: `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`,
        submittedAt: a.submitted_at || a.created_at,
        proctoringFlags: a.tab_switch_count || 0,
      }
    })

    formatted.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      return a.durationSeconds - b.durationSeconds
    })

    const ranked = formatted.map((item, index) => ({
      rank: index + 1,
      ...item,
    }))

    res.json({
      exam: {
        id: exam?.id,
        title: exam?.title,
        code: exam?.code,
        totalMarks: exam?.total_marks,
        passMarks: exam?.pass_marks,
      },
      leaderboard: ranked,
      metrics: {
        totalAttempts: ranked.length,
        highestScore: ranked[0]?.totalScore || 0,
        averageScore: ranked.length > 0 ? Number((ranked.reduce((s, r) => s + r.totalScore, 0) / ranked.length).toFixed(2)) : 0,
        passCount: ranked.filter((r) => r.passed).length,
        passRate: ranked.length > 0 ? Number(((ranked.filter((r) => r.passed).length / ranked.length) * 100).toFixed(1)) : 0,
      },
    })
  } catch (error) {
    console.error('Error generating leaderboard:', error)
    res.status(500).json({ error: error.message || 'Failed to generate leaderboard' })
  }
}

export const getAttemptItemizedDetails = async (req, res) => {
  try {
    const { attemptId } = req.params

    const { data: attempt, error } = await supabase
      .from('ex_attempts')
      .select('*, ex_exams(*), ex_answers(*)')
      .eq('id', attemptId)
      .single()

    if (error || !attempt) return res.status(404).json({ error: 'Attempt not found' })

    const { data: candidateUser } = await supabase
      .from('ex_users')
      .select('name, email, roll_number')
      .eq('id', attempt.candidate_id)
      .maybeSingle()

    const examId = attempt.exam_id
    const { data: questions } = await supabase
      .from('ex_questions')
      .select('*, ex_exam_sections(name)')
      .eq('exam_id', examId)

    const answers = attempt.ex_answers || []
    const qMap = new Map((questions || []).map((q) => [q.id, q]))

    const itemized = answers.map((ans) => {
      const q = qMap.get(ans.question_id)
      const options = typeof q?.options_json === 'string' ? JSON.parse(q.options_json) : (q?.options_json || [])
      const isCorrect = isAnswerCorrect(q, ans.selected_option)
      const score = Number(ans.score_awarded) || 0

      return {
        questionId: q?.id,
        statement: q?.statement || 'Question statement',
        type: q?.type || 'MCQ',
        sectionName: q?.ex_exam_sections?.name || 'General',
        points: q?.points || 1,
        negativePoints: Number(q?.negative_points) || 0,
        options,
        selectedOption: ans.selected_option || '(Not Answered)',
        correctAnswer: q?.correct_answer || 'N/A',
        scoreAwarded: score,
        isCorrect,
      }
    })

    res.json({
      attemptId,
      candidate: {
        id: attempt.candidate_id,
        name: candidateUser?.name || 'Candidate',
        email: candidateUser?.email || '',
        rollNumber: candidateUser?.roll_number || '',
      },
      examTitle: attempt.ex_exams?.title,
      totalScore: attempt.total_score,
      percentage: attempt.percentage,
      submittedAt: attempt.submitted_at,
      responses: itemized,
    })
  } catch (error) {
    console.error('Error fetching attempt details:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch attempt details' })
  }
}

export const sendScoreEmail = async (req, res) => {
  try {
    const { attemptId } = req.params

    const { data: attempt } = await supabase
      .from('ex_attempts')
      .select('*, ex_exams(title, total_marks)')
      .eq('id', attemptId)
      .single()

    if (!attempt) return res.status(404).json({ error: 'Attempt not found' })

    const { data: user } = await supabase
      .from('ex_users')
      .select('name, email')
      .eq('id', attempt.candidate_id)
      .maybeSingle()

    const candidateEmail = user?.email || req.body.email || 'student@example.com'
    const candidateName = user?.name || req.body.name || 'Candidate'

    console.log(`📧 [MOCK EMAIL DISPATCH] Sent score report for "${attempt.ex_exams?.title}" to ${candidateName} <${candidateEmail}>: Score ${attempt.total_score}/${attempt.ex_exams?.total_marks} (${attempt.percentage}%)`)

    res.json({
      message: `Score report email successfully queued for ${candidateName} (${candidateEmail})`,
      recipient: candidateEmail,
      score: attempt.total_score,
      percentage: attempt.percentage,
    })
  } catch (err) {
    console.error('Error sending score email:', err)
    res.status(500).json({ error: err.message || 'Failed to dispatch email' })
  }
}

/**
 * GET /api/exams/:id/export-itemized-results
 * Admin-only CSV export mapping every student's selected answer against the original question & correct answer key.
 */
export const exportItemizedResultsCSV = async (req, res) => {
  try {
    const examId = req.params.id || req.params.examId
    if (!examId || examId === 'undefined') {
      return res.status(400).json({ error: 'Valid exam ID is required' })
    }

    // 1. Fetch Exam metadata & all questions
    const { data: exam, error: examErr } = await supabase
      .from('ex_exams')
      .select('id, title, code, total_marks, pass_marks, ex_questions(id, statement, type, options_json, correct_answer, points, section_id)')
      .eq('id', examId)
      .single()

    if (examErr || !exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    const questions = exam.ex_questions || []
    questions.sort((a, b) => (a.statement || '').localeCompare(b.statement || ''))

    // 2. Fetch all attempts with answers
    const { data: attempts, error: attErr } = await supabase
      .from('ex_attempts')
      .select('*, ex_answers(*)')
      .eq('exam_id', examId)

    if (attErr) throw attErr

    // 3. Fetch candidate user details
    const candidateIds = Array.from(new Set((attempts || []).map((a) => a.candidate_id).filter(Boolean)))
    let users = []
    if (candidateIds.length > 0) {
      const { data: userList } = await supabase
        .from('ex_users')
        .select('id, name, email, roll_number')
        .in('id', candidateIds)
      users = userList || []
    }
    const userMap = new Map(users.map((u) => [u.id, u]))

    // 4. Build CSV Headers
    const baseHeaders = [
      'Rank',
      'Roll Number',
      'Candidate Name',
      'Candidate Email',
      'Attempt Status',
      'Total Score Obtained',
      'Max Total Score',
      'Percentage (%)',
      'Pass Cutoff Met',
      'Violations Count',
      'Started At',
      'Submitted At',
    ]

    const questionHeaders = []
    questions.forEach((q, idx) => {
      const qNum = idx + 1
      questionHeaders.push(`Q${qNum} Statement`)
      questionHeaders.push(`Q${qNum} Candidate Selected Answer`)
      questionHeaders.push(`Q${qNum} Expected Correct Key`)
      questionHeaders.push(`Q${qNum} Score Awarded`)
      questionHeaders.push(`Q${qNum} Answer Status`)
    })

    const allHeaders = [...baseHeaders, ...questionHeaders]

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""'
      const stringified = String(str).replace(/"/g, '""')
      return `"${stringified}"`
    }

    const sortedAttempts = [...(attempts || [])].sort((a, b) => (Number(b.total_score) || 0) - (Number(a.total_score) || 0))

    const csvRows = [allHeaders.map(escapeCsv).join(',')]

    sortedAttempts.forEach((att, rankIdx) => {
      const u = userMap.get(att.candidate_id)
      const answersMap = new Map((att.ex_answers || []).map((ans) => [ans.question_id, ans]))

      const rowValues = [
        rankIdx + 1,
        u?.roll_number || '',
        u?.name || 'Candidate',
        u?.email || '',
        att.status,
        Number(att.total_score) || 0,
        exam.total_marks || 100,
        `${Number(att.percentage) || 0}%`,
        att.sectional_pass === false ? 'FAILED (Cutoff Not Met)' : (att.total_score >= (exam.pass_marks || 0) ? 'PASSED' : 'FAILED'),
        att.violations || 0,
        att.started_at || '',
        att.submitted_at || '',
      ]

      questions.forEach((q) => {
        const ans = answersMap.get(q.id)
        const selectedOpt = ans?.selected_option || ans?.text_answer || 'Unattempted'
        const correctKey = q.correct_answer || ''
        const scoreAwarded = ans ? (Number(ans.score_awarded) || 0) : 0

        let status = 'UNATTEMPTED'
        if (ans && (ans.selected_option || ans.text_answer)) {
          status = scoreAwarded > 0 ? 'CORRECT' : (scoreAwarded < 0 ? 'WRONG (PENALTY)' : 'INCORRECT')
        }

        rowValues.push(q.statement || '')
        rowValues.push(selectedOpt)
        rowValues.push(correctKey)
        rowValues.push(scoreAwarded)
        rowValues.push(status)
      })

      csvRows.push(rowValues.map(escapeCsv).join(','))
    })

    const csvContent = csvRows.join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${exam.code || 'exam'}_itemized_results_report.csv"`)
    res.send(csvContent)
  } catch (err) {
    console.error('Error exporting CSV itemized report:', err)
    res.status(500).json({ error: err.message || 'Failed to export itemized results CSV report' })
  }
}
