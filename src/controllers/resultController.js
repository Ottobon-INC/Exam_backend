import { supabase } from '../config/db.js'
import { computeSectionScores } from './attemptController.js'

export const getExamResults = async (req, res) => {
  try {
    const { examId } = req.params
    const candidateId = req.user.id
    const isCandidate = req.user.role === 'CANDIDATE'

    const { data: exam, error: examErr } = await supabase
      .from('ex_exams')
      .select('*, ex_exam_sections(*)')
      .eq('id', examId)
      .single()

    if (examErr || !exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    const sections = (exam.ex_exam_sections || []).sort((a, b) => a.order_index - b.order_index)

    // Candidate's own attempt
    let candidateAttempt = null
    if (isCandidate) {
      const { data: myAtt } = await supabase
        .from('ex_attempts')
        .select('*, ex_answers(*)')
        .eq('exam_id', examId)
        .eq('candidate_id', candidateId)
        .maybeSingle()
      candidateAttempt = myAtt
    }

    const isPublished = Boolean(exam.published_results)

    if (isCandidate && !isPublished) {
      return res.json({
        isPendingEvaluation: true,
        message: 'Your examination has been completed! We will evaluate your submission and reach out to you soon with your score report.',
        exam: { id: exam.id, title: exam.title, code: exam.code, durationMinutes: exam.duration_minutes },
        attempt: {
          id: candidateAttempt?.id,
          submittedAt: candidateAttempt?.submitted_at || candidateAttempt?.updated_at || new Date().toISOString(),
          status: 'SUBMITTED',
        },
      })
    }

    // Fetch cohort attempts for leaderboard
    const { data: attempts, error: attErr } = await supabase
      .from('ex_attempts')
      .select('*, ex_users(id, name, roll_number, email)')
      .eq('exam_id', examId)
      .in('status', ['SUBMITTED', 'EVALUATED'])
      .order('total_score', { ascending: false })

    if (attErr) throw attErr

    const totalTakers = (attempts || []).length
    const rankedAttempts = (attempts || []).map((att, index) => {
      const rank = index + 1
      const percentile = totalTakers > 1 ? ((totalTakers - rank) / totalTakers) * 100 : 100
      // Candidate passes only if both overall and sectional cutoffs are met
      const overallPassed = (att.total_score || 0) >= exam.pass_marks
      const passed = overallPassed && (att.sectional_pass !== false)
      return {
        id: att.id,
        candidateId: att.candidate_id,
        totalScore: att.total_score,
        percentage: att.percentage,
        violations: att.violations,
        sectionalPass: att.sectional_pass,
        passed,
        candidate: att.ex_users,
        rank,
        percentile: parseFloat(percentile.toFixed(1)),
      }
    })

    const scores = (attempts || []).map((a) => a.total_score || 0)
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const maxScore = scores.length ? Math.max(...scores) : 0
    // Pass requires overall score AND sectional cutoffs
    const passCount = (attempts || []).filter(
      (a) => (a.total_score || 0) >= exam.pass_marks && a.sectional_pass !== false
    ).length

    // Build sectional breakdown for candidate's own attempt
    let sectionBreakdown = []
    if (candidateAttempt && sections.length > 0) {
      // Fetch questions to map section → questions
      const { data: questions } = await supabase
        .from('ex_questions')
        .select('id, section_id, points')
        .eq('exam_id', examId)

      sectionBreakdown = computeSectionScores(sections, questions || [], candidateAttempt.ex_answers || [])
    }

    res.json({
      isPendingEvaluation: false,
      exam: {
        id: exam.id,
        title: exam.title,
        code: exam.code,
        totalMarks: exam.total_marks,
        passMarks: exam.pass_marks,
        publishedResults: exam.published_results,
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          cutoffMarks: s.cutoff_marks,
        })),
      },
      candidateAttempt: candidateAttempt
        ? {
            id: candidateAttempt.id,
            totalScore: candidateAttempt.total_score,
            percentage: candidateAttempt.percentage,
            status: candidateAttempt.status,
            submittedAt: candidateAttempt.submitted_at,
            sectionalPass: candidateAttempt.sectional_pass,
            sectionBreakdown,
          }
        : null,
      analytics: {
        totalTakers,
        avgScore: parseFloat(avgScore.toFixed(1)),
        maxScore,
        passRate: totalTakers ? parseFloat(((passCount / totalTakers) * 100).toFixed(1)) : 0,
      },
      leaderboard: rankedAttempts,
    })
  } catch (error) {
    console.error('Error fetching exam results:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch results and analytics' })
  }
}

export const togglePublishResults = async (req, res) => {
  try {
    const { examId } = req.params
    const { publish } = req.body

    const { data: exam, error } = await supabase
      .from('ex_exams')
      .update({ published_results: Boolean(publish) })
      .eq('id', examId)
      .select()
      .single()

    if (error) throw error

    res.json({
      message: `Results ${exam.published_results ? 'published to candidates' : 'hidden from candidates'}`,
      exam,
    })
  } catch (error) {
    console.error('Error publishing results:', error)
    res.status(500).json({ error: error.message || 'Failed to update result publication status' })
  }
}
