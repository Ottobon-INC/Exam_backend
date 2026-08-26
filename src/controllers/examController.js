import { supabase } from '../config/db.js'

export const getAllExams = async (req, res) => {
  try {
    const { status } = req.query
    let query = supabase.from('ex_exams').select('*, ex_questions(id, section_id), ex_exam_sections(id, max_questions_limit, name), ex_attempts(count)')

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
        expectedQuestionsCount,
        _count: {
          questions: questions.length,
          attempts: e.ex_attempts?.[0]?.count || 0,
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
      passMarks,
      status,
      proctoringEnabled,
      blockTabSwitch,
      shuffleQuestions,
      shuffleOptions,
      showImmediateResults,
    } = req.body

    const { data: exam, error } = await supabase
      .from('ex_exams')
      .insert({
        code: code.trim().toUpperCase(),
        title,
        description,
        duration_minutes: durationMinutes || 60,
        total_marks: totalMarks || 0,
        pass_marks: passMarks || 0,
        status: status || 'DRAFT',
        proctoring_enabled: proctoringEnabled ?? true,
        block_tab_switch: blockTabSwitch ?? true,
        shuffle_questions: shuffleQuestions ?? true,
        shuffle_options: shuffleOptions ?? true,
        published_results: showImmediateResults ?? false,
      })
      .select()
      .single()

    if (error) throw error

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
    if (req.body.passMarks !== undefined) updateData.pass_marks = req.body.passMarks
    if (req.body.status) updateData.status = req.body.status
    if (req.body.proctoringEnabled !== undefined) updateData.proctoring_enabled = req.body.proctoringEnabled
    if (req.body.shuffleQuestions !== undefined) updateData.shuffle_questions = req.body.shuffleQuestions
    if (req.body.showImmediateResults !== undefined) updateData.published_results = req.body.showImmediateResults
    if (req.body.publishedResults !== undefined) updateData.published_results = req.body.publishedResults

    const { data: exam, error } = await supabase
      .from('ex_exams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({ message: 'Exam updated successfully', exam })
  } catch (error) {
    console.error('Error updating exam:', error)
    res.status(500).json({ error: error.message || 'Failed to update exam' })
  }
}
