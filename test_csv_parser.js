import { parseAndValidateQuestionsCsv } from './src/utils/csvParser.js'

console.log('🧪 RUNNING COMPREHENSIVE CSV PARSER TEST SUITE...\n')

let passed = 0
let total = 0

const assert = (condition, testName) => {
  total++
  if (condition) {
    console.log(`✅ [PASS] Case ${total}: ${testName}`)
    passed++
  } else {
    console.error(`❌ [FAIL] Case ${total}: ${testName}`)
  }
}

// CASE 1: Question containing several commas
const case1Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"Alpha, Beta, and Gamma are evaluated, which one passes?",MCQ,OptA,OptB,OptC,OptD,A,1`
const res1 = parseAndValidateQuestionsCsv(case1Csv)
assert(
  res1.valid &&
    res1.questions[0].statement === 'Alpha, Beta, and Gamma are evaluated, which one passes?' &&
    res1.questions[0].options.length === 4,
  'Question containing several commas is preserved as 1 single field'
)

// CASE 2: Every option contains commas
const case2Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"Select correct statement:",MCQ,"A, B, and C","D, E, and F","G, H, and I","J, K, and L",A,1`
const res2 = parseAndValidateQuestionsCsv(case2Csv)
assert(
  res2.valid &&
    res2.questions[0].options[0] === 'A, B, and C' &&
    res2.questions[0].options[3] === 'J, K, and L',
  'Every option containing commas is parsed correctly without column shifting'
)

// CASE 3: Question contains quotation marks
const case3Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"The manager said ""retry the operation"" before escalating.",MCQ,OptA,OptB,OptC,OptD,A,1`
const res3 = parseAndValidateQuestionsCsv(case3Csv)
assert(
  res3.valid &&
    res3.questions[0].statement === 'The manager said "retry the operation" before escalating.',
  'Escaped quotation marks inside fields are unescaped properly'
)

// CASE 4: Question contains both quotes and commas
const case4Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"The note states, ""Alpha, Beta, and Gamma qualified"", which team won?",MCQ,Alpha,Beta,Gamma,None,A,1`
const res4 = parseAndValidateQuestionsCsv(case4Csv)
assert(
  res4.valid &&
    res4.questions[0].statement === 'The note states, "Alpha, Beta, and Gamma qualified", which team won?',
  'Question with both quotes and commas parses cleanly'
)

// CASE 5: Question contains a properly quoted newline
const case5Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"Line 1 of question statement.
Line 2 of question statement.",MCQ,OptA,OptB,OptC,OptD,A,1`
const res5 = parseAndValidateQuestionsCsv(case5Csv)
assert(
  res5.valid &&
    res5.questions.length === 1 &&
    res5.questions[0].statement.includes('Line 1') &&
    res5.questions[0].statement.includes('Line 2'),
  'Quoted line breaks remain inside 1 single question object'
)

// CASE 6: CSV has Windows CRLF line endings
const case6Csv = `statement,type,option1,option2,option3,option4,correct_answer,points\r\n"Question 1?",MCQ,OptA,OptB,OptC,OptD,A,1\r\n"Question 2?",MCQ,OptA,OptB,OptC,OptD,B,1`
const res6 = parseAndValidateQuestionsCsv(case6Csv)
assert(
  res6.valid && res6.questions.length === 2,
  'CSV with Windows CRLF line endings parses correctly'
)

// CASE 7: CSV begins with UTF-8 BOM (\uFEFF)
const case7Csv = `\uFEFFstatement,type,option1,option2,option3,option4,correct_answer,points\n"Question 1?",MCQ,OptA,OptB,OptC,OptD,A,1`
const res7 = parseAndValidateQuestionsCsv(case7Csv)
assert(
  res7.valid && res7.questions[0].statement === 'Question 1?',
  'UTF-8 BOM is cleanly removed from header row'
)

// CASE 8: Headers use option_a/option_b/option_c/option_d
const case8Csv = `index,statement,option_a,option_b,option_c,option_d,correct_answer,points,difficulty,topic
1,"Question 1?",OptA,OptB,OptC,OptD,A,1,HARD,Testing`
const res8 = parseAndValidateQuestionsCsv(case8Csv)
assert(
  res8.valid &&
    res8.questions[0].options[0] === 'OptA' &&
    res8.questions[0].options[3] === 'OptD' &&
    res8.questions[0].correctAnswer === 'OptA',
  'Headers using option_a/b/c/d map correctly and resolve correct answer key A -> OptA'
)

// CASE 9: Headers use option1/option2/option3/option4
const case9Csv = `statement,type,option1,option2,option3,option4,correct_answer,points,difficulty,topic
"Question 1?",MCQ,Opt1,Opt2,Opt3,Opt4,B,1,MEDIUM,General`
const res9 = parseAndValidateQuestionsCsv(case9Csv)
assert(
  res9.valid &&
    res9.questions[0].options[0] === 'Opt1' &&
    res9.questions[0].correctAnswer === 'Opt2',
  'Headers using option1/2/3/4 map correctly and resolve correct answer key B -> Opt2'
)

// CASE 10: One required option is missing
const case10Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"Broken question",MCQ,OptA,OptB,,OptD,A,1`
const res10 = parseAndValidateQuestionsCsv(case10Csv)
assert(
  !res10.valid &&
    res10.errors.length > 0 &&
    res10.errors[0].includes('Row 2: Missing required option'),
  'Missing required option produces clear row-level validation error'
)

// CASE 11: Correct answer field is empty
const case11Csv = `statement,type,option1,option2,option3,option4,correct_answer,points
"Question without answer",MCQ,OptA,OptB,OptC,OptD,,1`
const res11 = parseAndValidateQuestionsCsv(case11Csv)
assert(
  !res11.valid &&
    res11.errors.length > 0 &&
    res11.errors[0].includes('Correct answer field is empty'),
  'Empty correct answer produces clear row-level validation error'
)

// CASE 12: 100-question CSV imports exactly 100 questions
const generate100Csv = () => {
  const rows = ['index,statement,option_a,option_b,option_c,option_d,correct_answer,points,difficulty,topic']
  for (let i = 1; i <= 100; i++) {
    rows.push(`${i},"Question statement #${i} with, extra, commas?","Opt A #${i}","Opt B #${i}","Opt C #${i}","Opt D #${i}",A,1,MEDIUM,General`)
  }
  return rows.join('\n')
}
const res12 = parseAndValidateQuestionsCsv(generate100Csv())
assert(
  res12.valid && res12.questions.length === 100,
  '100-question CSV imports and creates exactly 100 questions'
)

// CASE 13: End-to-end check of #1, #50, #100
const q1 = res12.questions[0]
const q50 = res12.questions[49]
const q100 = res12.questions[99]

assert(
  q1.statement === 'Question statement #1 with, extra, commas?' &&
    q1.options[0] === 'Opt A #1' &&
    q50.statement === 'Question statement #50 with, extra, commas?' &&
    q50.options[1] === 'Opt B #50' &&
    q100.statement === 'Question statement #100 with, extra, commas?' &&
    q100.options[3] === 'Opt D #100',
  'Questions #1, #50, and #100 retain exact original statement and all 4 exact options'
)

// CASE 14: CSV without 'index' column header (statement is column 0, option_a is column 1)
const csvNoIndexCol = `statement,option_a,option_b,option_c,option_d,correct_answer\n"With the team allowed to change only one stage","workaround available","full outage no","a university research office has four simultaneous incidents affecting proposal review: Incident A: active data exposure yes","safety impact no",A`
const res14 = parseAndValidateQuestionsCsv(csvNoIndexCol)
assert(
  res14.valid &&
    res14.questions[0].statement === 'With the team allowed to change only one stage' &&
    res14.questions[0].options[0] === 'workaround available' &&
    res14.questions[0].options[1] === 'full outage no' &&
    res14.questions[0].options[2].includes('a university research office') &&
    res14.questions[0].options[3] === 'safety impact no',
  'CSV without index column parses statement and all 4 options accurately without skipping option_a'
)

console.log(`\n🎉 SUMMARY: ${passed}/${total} TESTS PASSED CLEANLY!`)
