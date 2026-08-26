const normalizeType = (val) => {
  if (!val) return 'MCQ'
  const clean = String(val).trim().toUpperCase()
  if (['MCQ', 'SINGLE_CHOICE', 'NUMERICAL', 'SUBJECTIVE', 'ESSAY', 'TRUE_FALSE'].includes(clean)) {
    return clean
  }
  if (clean.includes('MULTIPLE') || clean.includes('CHOICE') || clean.includes('OPTION') || clean.includes('MCQ')) return 'MCQ'
  if (clean.includes('SUBJ') || clean.includes('TEXT') || clean.includes('ESSAY') || clean.includes('DESCRIPT')) return 'SUBJECTIVE'
  if (clean.includes('NUM') || clean.includes('INT') || clean.includes('MATH')) return 'NUMERICAL'
  return 'MCQ'
}

const normalizeDifficulty = (val) => {
  if (!val) return 'MEDIUM'
  const clean = String(val).trim().toUpperCase()
  if (['EASY', 'MEDIUM', 'HARD'].includes(clean)) return clean
  if (clean.startsWith('EA')) return 'EASY'
  if (clean.startsWith('HA')) return 'HARD'
  return 'MEDIUM'
}



import { supabase } from '../config/db.js'

// Helper: recalculate exam total_marks and pass_marks from all questions
export const syncExamMarks = async (examId) => {
  if (!examId) return
  try {
    const { data: questions } = await supabase
      .from('ex_questions')
      .select('points')
      .eq('exam_id', examId)

    const totalMarks = (questions || []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
    const passMarks = Math.round(totalMarks * 0.4)

    await supabase
      .from('ex_exams')
      .update({ total_marks: totalMarks, pass_marks: passMarks })
      .eq('id', examId)
  } catch (err) {
    console.error('Error syncing exam marks:', err)
  }
}

export const getAllQuestions = async (req, res) => {
  try {
    const { subject, type, difficulty, examId, sectionId } = req.query
    let query = supabase.from('ex_questions').select('*')

    if (subject && subject !== 'All') query = query.eq('subject', subject)
    if (type && type !== 'All') query = query.eq('type', type)
    if (difficulty && difficulty !== 'All') query = query.eq('difficulty', difficulty)
    if (examId) query = query.eq('exam_id', examId)
    if (sectionId) query = query.eq('section_id', sectionId)

    const { data: questions, error } = await query.order('created_at', { ascending: true })

    if (error) throw error

    const formatted = (questions || []).map((q) => ({
      id: q.id,
      examId: q.exam_id,
      sectionId: q.section_id,
      subject: q.subject,
      topic: q.topic,
      type: q.type,
      statement: q.statement,
      options: typeof q.options_json === 'string' ? JSON.parse(q.options_json) : (q.options_json || []),
      correctAnswer: q.correct_answer,
      points: q.points,
      difficulty: q.difficulty,
    }))

    res.json({ questions: formatted })
  } catch (error) {
    console.error('Error fetching questions:', error)
    res.status(500).json({ error: 'Failed to fetch questions' })
  }
}

export const createQuestion = async (req, res) => {
  try {
    const { examId, sectionId, subject, topic, type, statement, options, correctAnswer, points, difficulty } = req.body

    const { data: question, error } = await supabase
      .from('ex_questions')
      .insert({
        exam_id: examId || null,
        section_id: sectionId || null,
        subject: subject || 'General',
        topic: topic || 'General',
        type: normalizeType(type),
        statement,
        options_json: options ? JSON.stringify(options) : null,
        correct_answer: String(correctAnswer ?? '0'),
        points: Number(points) || 2,
        difficulty: normalizeDifficulty(difficulty),
      })
      .select()
      .single()

    if (error) throw error

    if (examId) await syncExamMarks(examId)

    res.status(201).json({ message: 'Question created successfully', question })
  } catch (error) {
    console.error('Error creating question:', error)
    res.status(500).json({ error: error.message || 'Failed to create question' })
  }
}

export const bulkCreateQuestions = async (req, res) => {
  try {
    // sectionId at top-level applies to all questions (can be overridden per-question)
    const { examId, sectionId, questions } = req.body

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Questions array is required' })
    }

    const payload = questions.map((q) => ({
      exam_id: examId || null,
      section_id: q.sectionId || sectionId || null,
      subject: q.subject || 'General',
      topic: q.topic || 'General',
      type: normalizeType(q.type),
      statement: q.statement,
      options_json: q.options ? JSON.stringify(q.options) : null,
      correct_answer: String(q.correctAnswer ?? '0'),
      points: Number(q.points) || 2,
      difficulty: normalizeDifficulty(q.difficulty),
    }))

    const { data, error } = await supabase
      .from('ex_questions')
      .insert(payload)
      .select()

    if (error) throw error

    if (examId) await syncExamMarks(examId)

    res.status(201).json({ message: `Successfully inserted ${data.length} questions`, questions: data })
  } catch (error) {
    console.error('Error in bulk question create:', error)
    res.status(500).json({ error: error.message || 'Failed to bulk create questions' })
  }
}

export const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params
    const { options, correctAnswer, points, sectionId, ...rest } = req.body

    const updateData = { ...rest }
    if (points !== undefined) updateData.points = Number(points)
    if (options !== undefined) updateData.options_json = JSON.stringify(options)
    if (correctAnswer !== undefined) updateData.correct_answer = String(correctAnswer)
    if (sectionId !== undefined) updateData.section_id = sectionId || null

    const { data: question, error } = await supabase
      .from('ex_questions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    if (question.exam_id) await syncExamMarks(question.exam_id)

    res.json({ message: 'Question updated successfully', question })
  } catch (error) {
    console.error('Error updating question:', error)
    res.status(500).json({ error: error.message || 'Failed to update question' })
  }
}

export const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params
    const { data: q } = await supabase.from('ex_questions').select('exam_id').eq('id', id).single()

    const { error } = await supabase.from('ex_questions').delete().eq('id', id)
    if (error) throw error

    if (q?.exam_id) await syncExamMarks(q.exam_id)

    res.json({ message: 'Question deleted successfully' })
  } catch (error) {
    console.error('Error deleting question:', error)
    res.status(500).json({ error: error.message || 'Failed to delete question' })
  }
}
