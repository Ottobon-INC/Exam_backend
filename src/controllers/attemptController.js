import { supabase } from '../config/db.js'

export const computeSectionScores = (sections, allQuestions, attemptAnswers) => {
  return sections.map((sec) => {
    const secQs = allQuestions.filter((q) => q.section_id === sec.id)
    const secQIds = secQs.map((q) => q.id)
    const secAnswers = attemptAnswers.filter((a) => secQIds.includes(a.question_id))
    const score = secAnswers.reduce((sum, a) => sum + (Number(a.score_awarded) || 0), 0)
    return {
      id: sec.id,
      name: sec.name,
      score,
      cutoffMarks: sec.cutoff_marks,
      cutoffMet: score >= (sec.cutoff_marks || 0),
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

      // Subset questions based on section rules
      const selectedQuestions = []
      if (sections.length > 0) {
        sections.forEach((sec) => {
          let secQs = allQuestions.filter((q) => q.section_id === sec.id)
          if (shuffle) secQs = shuffleArray(secQs)
          const limit = sec.max_questions_limit
          const count = limit && limit > 0 ? Math.min(secQs.length, limit) : secQs.length
          selectedQuestions.push(...secQs.slice(0, count))
        })
        let unsectioned = allQuestions.filter((q) => !q.section_id)
        if (shuffle) unsectioned = shuffleArray(unsectioned)
        selectedQuestions.push(...unsectioned)
      } else {
        let qs = [...allQuestions]
        if (shuffle) qs = shuffleArray(qs)
        selectedQuestions.push(...qs)
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

    const formatQuestion = (q) => ({
      id: q.id,
      sectionId: q.section_id,
      subject: q.subject,
      topic: q.topic,
      type: q.type,
      statement: q.statement,
      options: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : (q.options_json || []),
      points: q.points,
      difficulty: q.difficulty,
    })

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
      totalMaxScore += q.points
      const ans = answers.find((a) => a.question_id === q.id)

      if (q.type === 'MCQ' || q.type === 'SINGLE_CHOICE' || q.type === 'NUMERICAL') {
        if (ans && String(ans.selected_option) === String(q.correct_answer)) {
          totalScore += q.points
          await supabase.from('ex_answers').update({ score_awarded: q.points }).eq('id', ans.id)
        } else if (ans) {
          await supabase.from('ex_answers').update({ score_awarded: 0 }).eq('id', ans.id)
        }
      } else {
        requiresManual = true
      }
    }

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
