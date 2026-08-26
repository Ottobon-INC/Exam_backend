import { supabase } from '../config/db.js'

// GET /api/sections?examId=:id
export const getSectionsByExam = async (req, res) => {
  try {
    const { examId } = req.query
    if (!examId) return res.status(400).json({ error: 'examId is required' })

    const { data: sections, error } = await supabase
      .from('ex_exam_sections')
      .select('*')
      .eq('exam_id', examId)
      .order('order_index', { ascending: true })

    if (error) throw error

    // Get question counts + total marks per section
    const sectionIds = (sections || []).map((s) => s.id)

    let questionStats = []
    if (sectionIds.length > 0) {
      const { data: questions } = await supabase
        .from('ex_questions')
        .select('section_id, points')
        .in('section_id', sectionIds)

      questionStats = questions || []
    }

    const formatted = (sections || []).map((s) => {
      const sectionQs = questionStats.filter((q) => q.section_id === s.id)
      return {
        id: s.id,
        examId: s.exam_id,
        name: s.name,
        description: s.description,
        orderIndex: s.order_index,
        cutoffMarks: s.cutoff_marks,
        maxQuestionsLimit: s.max_questions_limit,
        questionCount: sectionQs.length,
        totalMarks: sectionQs.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
        createdAt: s.created_at,
      }
    })

    res.json({ sections: formatted })
  } catch (error) {
    console.error('Error fetching sections:', error)
    res.status(500).json({ error: error.message || 'Failed to fetch sections' })
  }
}

// POST /api/sections
export const createSection = async (req, res) => {
  try {
    const { examId, name, description, cutoffMarks, orderIndex, maxQuestionsLimit } = req.body

    if (!examId || !name) {
      return res.status(400).json({ error: 'examId and name are required' })
    }

    // Auto-assign order_index if not provided (append to end)
    let resolvedOrder = orderIndex
    if (resolvedOrder === undefined || resolvedOrder === null) {
      const { count } = await supabase
        .from('ex_exam_sections')
        .select('*', { count: 'exact', head: true })
        .eq('exam_id', examId)
      resolvedOrder = count || 0
    }

    const { data: section, error } = await supabase
      .from('ex_exam_sections')
      .insert({
        exam_id: examId,
        name: name.trim(),
        description: description || null,
        order_index: resolvedOrder,
        cutoff_marks: Number(cutoffMarks) || 0,
        max_questions_limit: maxQuestionsLimit ? parseInt(maxQuestionsLimit, 10) : null,
      })
      .select()
      .single()

    if (error) throw error

    res.status(201).json({
      message: 'Section created successfully',
      section: {
        id: section.id,
        examId: section.exam_id,
        name: section.name,
        description: section.description,
        orderIndex: section.order_index,
        cutoffMarks: section.cutoff_marks,
        maxQuestionsLimit: section.max_questions_limit,
        questionCount: 0,
        totalMarks: 0,
      },
    })
  } catch (error) {
    console.error('Error creating section:', error)
    res.status(500).json({ error: error.message || 'Failed to create section' })
  }
}

// PUT /api/sections/:id
export const updateSection = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = {}

    if (req.body.name !== undefined) updateData.name = req.body.name.trim()
    if (req.body.description !== undefined) updateData.description = req.body.description
    if (req.body.cutoffMarks !== undefined) updateData.cutoff_marks = Number(req.body.cutoffMarks)
    if (req.body.orderIndex !== undefined) updateData.order_index = Number(req.body.orderIndex)
    if (req.body.maxQuestionsLimit !== undefined) updateData.max_questions_limit = req.body.maxQuestionsLimit ? parseInt(req.body.maxQuestionsLimit, 10) : null
    updateData.updated_at = new Date().toISOString()

    const { data: section, error } = await supabase
      .from('ex_exam_sections')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    res.json({
      message: 'Section updated successfully',
      section: {
        id: section.id,
        examId: section.exam_id,
        name: section.name,
        description: section.description,
        orderIndex: section.order_index,
        cutoffMarks: section.cutoff_marks,
        maxQuestionsLimit: section.max_questions_limit,
      },
    })
  } catch (error) {
    console.error('Error updating section:', error)
    res.status(500).json({ error: error.message || 'Failed to update section' })
  }
}

// DELETE /api/sections/:id
export const deleteSection = async (req, res) => {
  try {
    const { id } = req.params

    // Questions will have section_id set to NULL (ON DELETE SET NULL)
    const { error } = await supabase
      .from('ex_exam_sections')
      .delete()
      .eq('id', id)

    if (error) throw error

    res.json({ message: 'Section deleted. Questions moved to unsectioned pool.' })
  } catch (error) {
    console.error('Error deleting section:', error)
    res.status(500).json({ error: error.message || 'Failed to delete section' })
  }
}

// PUT /api/sections/reorder
export const reorderSections = async (req, res) => {
  try {
    const { sections } = req.body

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: 'sections array is required' })
    }

    const updates = sections.map(({ id, orderIndex }) =>
      supabase
        .from('ex_exam_sections')
        .update({ order_index: Number(orderIndex), updated_at: new Date().toISOString() })
        .eq('id', id)
    )

    await Promise.all(updates)

    res.json({ message: 'Sections reordered successfully' })
  } catch (error) {
    console.error('Error reordering sections:', error)
    res.status(500).json({ error: error.message || 'Failed to reorder sections' })
  }
}
