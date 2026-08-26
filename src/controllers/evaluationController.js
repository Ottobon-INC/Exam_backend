import { supabase } from '../config/db.js'
import { computeSectionScores } from './attemptController.js'

export const getPendingEvaluations = async (req, res) => {
  try {
    const { data: attempts, error } = await supabase
      .from('ex_attempts')
      .select('*, ex_users(id, name, roll_number, email), ex_exams(id, title, code, total_marks, pass_marks, published_results, ex_exam_sections(*)), ex_answers(*, ex_questions(*)), ex_proctor_logs(*)')
      .in('status', ['SUBMITTED', 'EVALUATED'])
      .order('created_at', { ascending: false })

    if (error) throw error

    const formattedAttempts = (attempts || []).map((att) => {
      const answers = (att.ex_answers || []).map((ans) => ({
        id: ans.id,
        attemptId: ans.attempt_id,
        questionId: ans.question_id,
        selectedOption: ans.selected_option,
        textAnswer: ans.text_answer,
        scoreAwarded: ans.score_awarded,
        evaluatorRemarks: ans.evaluator_remarks,
        question: ans.ex_questions
          ? {
              id: ans.ex_questions.id,
              statement: ans.ex_questions.statement,
              subject: ans.ex_questions.subject,
              topic: ans.ex_questions.topic,
              type: ans.ex_questions.type,
              points: ans.ex_questions.points,
              sectionId: ans.ex_questions.section_id,
              correctAnswer: ans.ex_questions.correct_answer,
              options:
                typeof ans.ex_questions.options_json === 'string'
                  ? JSON.parse(ans.ex_questions.options_json)
                  : (ans.ex_questions.options_json || []),
            }
          : null,
      }))

      const violations = (att.ex_proctor_logs || []).map((log) => ({
        id: log.id,
        eventType: log.event_type,
        severity: log.severity,
        details: log.details,
        createdAt: log.created_at,
      }))

      return {
        id: att.id,
        candidateId: att.candidate_id,
        examId: att.exam_id,
        status: att.status,
        totalScore: att.total_score || 0,
        percentage: att.percentage || 0,
        sectionalPass: att.sectional_pass,
        violationsCount: att.violations || violations.length || 0,
        submittedAt: att.submitted_at || att.updated_at,
        candidate: att.ex_users,
        exam: att.ex_exams,
        answers,
        violations,
      }
    })

    res.json({ attempts: formattedAttempts })
  } catch (error) {
    console.error('Error fetching evaluation candidates:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch evaluation queue' })
  }
}

export const submitEvaluation = async (req, res) => {
  try {
    const { answerId, scoreAwarded, remarks } = req.body

    const { data: answer, error } = await supabase
      .from('ex_answers')
      .update({
        score_awarded: parseFloat(scoreAwarded),
        evaluator_remarks: remarks,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', answerId)
      .select('*, ex_attempts(*, ex_answers(*), ex_exams(*, ex_questions(*), ex_exam_sections(*)))')
      .single()

    if (error) throw error

    const attemptId = answer.attempt_id

    // Recalculate total score
    const { data: allAnswers } = await supabase
      .from('ex_answers')
      .select('question_id, score_awarded')
      .eq('attempt_id', attemptId)

    const finalScore = (allAnswers || []).reduce((sum, a) => sum + (Number(a.score_awarded) || 0), 0)
    const questions = answer.ex_attempts?.ex_exams?.ex_questions || []
    const sections = (answer.ex_attempts?.ex_exams?.ex_exam_sections || []).sort((a, b) => a.order_index - b.order_index)
    const totalPossible = questions.reduce((sum, q) => sum + q.points, 0)
    const percentage = totalPossible > 0 ? (finalScore / totalPossible) * 100 : 0

    // Recompute sectional pass
    let sectionalPass = null
    if (sections.length > 0) {
      const sectionBreakdown = computeSectionScores(sections, questions, allAnswers || [])
      sectionalPass = sectionBreakdown.every((s) => s.cutoffMet)
    }

    await supabase
      .from('ex_attempts')
      .update({
        status: 'EVALUATED',
        total_score: finalScore,
        percentage: parseFloat(percentage.toFixed(2)),
        sectional_pass: sectionalPass,
      })
      .eq('id', attemptId)

    res.json({ message: 'Evaluation saved and attempt score updated', answer, finalScore, sectionalPass })
  } catch (error) {
    console.error('Error saving evaluation:', error)
    res.status(500).json({ error: error.message || 'Failed to save evaluation score' })
  }
}

export const releaseCandidateResult = async (req, res) => {
  try {
    const { attemptId } = req.params

    const { data: attempt, error } = await supabase
      .from('ex_attempts')
      .update({ status: 'EVALUATED' })
      .eq('id', attemptId)
      .select('*, ex_exams(*), ex_users(*)')
      .single()

    if (error) throw error

    res.json({
      message: `Result successfully released to candidate ${attempt.ex_users?.name || ''}!`,
      attempt,
    })
  } catch (error) {
    console.error('Error releasing candidate result:', error)
    res.status(500).json({ error: error.message || 'Failed to release candidate result' })
  }
}
