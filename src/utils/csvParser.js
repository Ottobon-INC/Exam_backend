import Papa from 'papaparse'

/**
 * Normalizes header string:
 * - Strip UTF-8 BOM (\uFEFF)
 * - Trim whitespace
 * - Lowercase
 * - Normalize hyphens/spaces to underscores
 */
export const normalizeHeader = (header) => {
  if (!header) return ''
  return String(header)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
}

/**
 * Aliases map for column headers
 */
export const COLUMN_ALIASES = {
  statement: ['statement', 'question', 'question_statement', 'q', 'stmt', 'question_text'],
  type: ['type', 'question_type', 'kind'],
  option1: ['option1', 'option_1', 'option_a', 'optiona', 'opt1', 'opt_1', 'opt_a', 'opta', 'a', '1'],
  option2: ['option2', 'option_2', 'option_b', 'optionb', 'opt2', 'opt_2', 'opt_b', 'optb', 'b', '2'],
  option3: ['option3', 'option_3', 'option_c', 'optionc', 'opt3', 'opt_3', 'opt_c', 'optc', 'c', '3'],
  option4: ['option4', 'option_4', 'option_d', 'optiond', 'opt4', 'opt_4', 'opt_d', 'optd', 'd', '4'],
  correct_answer: ['correct_answer', 'correctanswer', 'answer', 'correct_option', 'ans', 'key', 'correct'],
  points: ['points', 'marks', 'mark', 'pts', 'score'],
  difficulty: ['difficulty', 'difficulty_level', 'diff', 'level'],
  topic: ['topic', 'category', 'subtopic', 'subject', 'tag'],
}

/**
 * Finds column index from headers for a target field using strict alias lookup and dynamic offset calculation.
 */
export const findHeaderIndex = (headers, targetField) => {
  const normHeaders = headers.map(normalizeHeader)
  const aliases = COLUMN_ALIASES[targetField] || [targetField]

  // 1. Exact match against aliases
  const exactIdx = normHeaders.findIndex(h => aliases.includes(h))
  if (exactIdx >= 0) return exactIdx

  // 2. Partial substring match against multi-letter aliases
  for (const alias of aliases) {
    if (alias.length <= 2) continue
    const subIdx = normHeaders.findIndex(h => h.includes(alias))
    if (subIdx >= 0) return subIdx
  }

  // 3. Dynamic Positional Fallback based on whether first column is index/id
  const firstHeader = normHeaders[0] || ''
  const hasIndexCol = ['index', 'id', 'sno', 's_no', 'sl_no', 'number', 'num', '#'].includes(firstHeader)
  const offset = hasIndexCol ? 1 : 0

  if (targetField === 'statement') return offset + 0
  if (targetField === 'type') {
    const typeIdx = normHeaders.findIndex(h => h.includes('type') || h.includes('kind'))
    return typeIdx >= 0 ? typeIdx : -1
  }
  if (targetField === 'option1') return offset + 1
  if (targetField === 'option2') return offset + 2
  if (targetField === 'option3') return offset + 3
  if (targetField === 'option4') return offset + 4
  if (targetField === 'correct_answer') return offset + 5
  if (targetField === 'points') return offset + 6
  if (targetField === 'difficulty') return offset + 7
  if (targetField === 'topic') return offset + 8

  return -1
}

/**
 * Normalizes correct answer values (e.g. 'A', 'option_a', 'option1', '1', or full option text) to the canonical option text.
 */
export const normalizeCorrectAnswer = (rawAns, options) => {
  if (rawAns === null || rawAns === undefined) return options[0] || ''
  const trimmed = String(rawAns).trim()
  const upper = trimmed.toUpperCase().replace(/[^A-Z0-9_]/g, '')

  if (['A', 'OPTION_A', 'OPTIONA', 'OPTION1', 'OPT1', '1'].includes(upper)) {
    return options[0] !== undefined ? options[0] : 'A'
  }
  if (['B', 'OPTION_B', 'OPTIONB', 'OPTION2', 'OPT2', '2'].includes(upper)) {
    return options[1] !== undefined ? options[1] : 'B'
  }
  if (['C', 'OPTION_C', 'OPTIONC', 'OPTION3', 'OPT3', '3'].includes(upper)) {
    return options[2] !== undefined ? options[2] : 'C'
  }
  if (['D', 'OPTION_D', 'OPTIOND', 'OPTION4', 'OPT4', '4'].includes(upper)) {
    return options[3] !== undefined ? options[3] : 'D'
  }

  // Exact option text match
  const matchedOpt = options.find(opt => String(opt).trim().toLowerCase() === trimmed.toLowerCase())
  if (matchedOpt !== undefined) return matchedOpt

  return trimmed
}

/**
 * Parses CSV/TSV/Pipe/JSON string with support for multiple file formats.
 */
export const parseAndValidateQuestionsCsv = (content, fileName = '') => {
  let cleanStr = String(content || '').replace(/^\uFEFF/, '').trim()

  // 1. JSON FILE OR JSON STRING SUPPORT
  if (fileName.endsWith('.json') || cleanStr.startsWith('[') || cleanStr.startsWith('{')) {
    try {
      let rawData = JSON.parse(cleanStr)
      if (!Array.isArray(rawData) && rawData.questions) rawData = rawData.questions
      if (Array.isArray(rawData)) {
        const questions = []
        const validationErrors = []
        rawData.forEach((item, idx) => {
          const rowNum = idx + 1
          const stmt = String(item.statement || item.question || item.question_statement || item.stmt || '').trim()
          const opt1 = String(item.option_a || item.option1 || item.opt_a || item.a || (item.options && item.options[0]) || '').trim()
          const opt2 = String(item.option_b || item.option2 || item.opt_b || item.b || (item.options && item.options[1]) || '').trim()
          const opt3 = String(item.option_c || item.option3 || item.opt_c || item.c || (item.options && item.options[2]) || '').trim()
          const opt4 = String(item.option_d || item.option4 || item.opt_d || item.d || (item.options && item.options[3]) || '').trim()
          const rawAns = item.correct_answer || item.correctAnswer || item.answer || item.key || 'A'

          if (!stmt) {
            validationErrors.push(`Item ${rowNum}: Question statement is empty.`)
            return
          }
          if (!opt1 || !opt2 || !opt3 || !opt4) {
            validationErrors.push(`Item ${rowNum}: Missing one or more options.`)
            return
          }

          const options = [opt1, opt2, opt3, opt4]
          const correctAnswer = normalizeCorrectAnswer(rawAns, options)

          questions.push({
            statement: stmt,
            type: String(item.type || 'MCQ').toUpperCase(),
            options,
            correctAnswer,
            points: Number(item.points) > 0 ? Number(item.points) : 1,
            difficulty: String(item.difficulty || 'MEDIUM').toUpperCase(),
            topic: item.topic || undefined,
            rowNumber: rowNum,
          })
        })
        return {
          questions,
          errors: validationErrors,
          valid: validationErrors.length === 0 && questions.length > 0,
        }
      }
    } catch (jErr) {
      console.warn('JSON parse attempt failed, falling back to CSV parser:', jErr.message)
    }
  }

  // 2. CSV / TSV / PIPE PARSING (Auto-detect Delimiter)
  const parsed = Papa.parse(cleanStr, {
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  })

  const rows = parsed.data || []
  if (rows.length <= 1) {
    return {
      questions: [],
      errors: ['File is empty or contains only a header row.'],
      valid: false,
    }
  }

  const headers = rows[0].map(h => String(h || '').trim())
  const stmtIdx = findHeaderIndex(headers, 'statement')
  const typeIdx = findHeaderIndex(headers, 'type')
  const opt1Idx = findHeaderIndex(headers, 'option1')
  const opt2Idx = findHeaderIndex(headers, 'option2')
  const opt3Idx = findHeaderIndex(headers, 'option3')
  const opt4Idx = findHeaderIndex(headers, 'option4')
  const ansIdx = findHeaderIndex(headers, 'correct_answer')
  const ptsIdx = findHeaderIndex(headers, 'points')
  const diffIdx = findHeaderIndex(headers, 'difficulty')
  const topicIdx = findHeaderIndex(headers, 'topic')

  const questions = []
  const validationErrors = []

  for (let i = 1; i < rows.length; i++) {
    const rowNum = i + 1
    const cols = rows[i].map(c => String(c || '').trim())

    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue

    const getValue = (idx) => {
      if (idx >= 0 && cols[idx] !== undefined && cols[idx] !== '') return cols[idx]
      return ''
    }

    const statement = getValue(stmtIdx)
    const rawType = getValue(typeIdx)
    const opt1 = getValue(opt1Idx)
    const opt2 = getValue(opt2Idx)
    const opt3 = getValue(opt3Idx)
    const opt4 = getValue(opt4Idx)
    const rawAns = getValue(ansIdx)
    const rawPts = getValue(ptsIdx)
    const rawDiff = getValue(diffIdx)
    const topic = getValue(topicIdx)

    // Row-level validation
    if (!statement) {
      validationErrors.push(`Row ${rowNum}: Question statement is empty.`)
      continue
    }

    if (!opt1 || !opt2 || !opt3 || !opt4) {
      const missingOpts = []
      if (!opt1) missingOpts.push('option1 (A)')
      if (!opt2) missingOpts.push('option2 (B)')
      if (!opt3) missingOpts.push('option3 (C)')
      if (!opt4) missingOpts.push('option4 (D)')
      validationErrors.push(`Row ${rowNum}: Missing required option(s): ${missingOpts.join(', ')}.`)
      continue
    }

    const options = [opt1, opt2, opt3, opt4]

    if (!rawAns) {
      validationErrors.push(`Row ${rowNum}: Correct answer field is empty. Expected A, B, C, D or matching option text.`)
      continue
    }

    const correctAnswer = normalizeCorrectAnswer(rawAns, options)

    let type = String(rawType || 'MCQ').trim().toUpperCase()
    if (!['MCQ', 'SINGLE_CHOICE', 'NUMERICAL', 'SUBJECTIVE', 'TRUE_FALSE', 'MULTIPLE_CHOICE'].includes(type)) {
      type = 'MCQ'
    }

    let difficulty = String(rawDiff || 'MEDIUM').trim().toUpperCase()
    if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) {
      difficulty = 'MEDIUM'
    }

    const points = Number(rawPts) > 0 ? Number(rawPts) : 1

    questions.push({
      statement,
      type,
      options,
      correctAnswer,
      points,
      difficulty,
      topic: topic || undefined,
      rowNumber: rowNum,
    })
  }

  return {
    questions,
    errors: validationErrors,
    valid: validationErrors.length === 0 && questions.length > 0,
  }
}
