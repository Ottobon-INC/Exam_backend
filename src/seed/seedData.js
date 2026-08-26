import bcrypt from 'bcryptjs'
import prisma from '../config/db.js'

async function main() {
  console.log('🌱 Seeding database with realistic exam data...')

  // Clear existing records
  await prisma.proctorLog.deleteMany()
  await prisma.answer.deleteMany()
  await prisma.attempt.deleteMany()
  await prisma.question.deleteMany()
  await prisma.exam.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash('password123', 10)

  // 1. Create Staff & Admin Users
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Administrator',
      email: 'admin@enterprise.org',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  })

  const examiner = await prisma.user.create({
    data: {
      name: 'Dr. Vikram Seth (Lead Examiner)',
      email: 'examiner@enterprise.org',
      passwordHash,
      role: 'EXAMINER',
    },
  })

  const proctor = await prisma.user.create({
    data: {
      name: 'Capt. Ramesh Rao (Proctor)',
      email: 'proctor@enterprise.org',
      passwordHash,
      role: 'PROCTOR',
    },
  })

  const evaluator = await prisma.user.create({
    data: {
      name: 'Prof. Sunita Rao (Evaluator)',
      email: 'evaluator@enterprise.org',
      passwordHash,
      role: 'EVALUATOR',
    },
  })

  // 2. Create Sample Candidates
  const student1 = await prisma.user.create({
    data: {
      name: 'Rahul Verma',
      email: 'candidate@enterprise.org',
      passwordHash,
      role: 'CANDIDATE',
      rollNumber: 'CS21B045',
    },
  })

  const student2 = await prisma.user.create({
    data: {
      name: 'Ananya Sharma',
      email: 'ananya@enterprise.org',
      passwordHash,
      role: 'CANDIDATE',
      rollNumber: 'AI21B012',
    },
  })

  const student3 = await prisma.user.create({
    data: {
      name: 'David Miller',
      email: 'david@enterprise.org',
      passwordHash,
      role: 'CANDIDATE',
      rollNumber: 'SE21B088',
    },
  })

  // 3. Create Sample Exams
  const exam1 = await prisma.exam.create({
    data: {
      code: 'CS-402',
      title: 'Data Structures & Algorithms Final Examination',
      description: 'Comprehensive evaluation of Arrays, Trees, Dynamic Programming, and Graph Traversals.',
      durationMinutes: 120,
      totalMarks: 100,
      passMarks: 40,
      status: 'LIVE',
      proctoringEnabled: true,
      blockTabSwitch: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      publishedResults: true,
    },
  })

  const exam2 = await prisma.exam.create({
    data: {
      code: 'AI-301',
      title: 'Machine Learning & Artificial Intelligence Mid-Term',
      description: 'Linear Regression, Decision Trees, Neural Networks basics, and Model Validation.',
      durationMinutes: 90,
      totalMarks: 75,
      passMarks: 30,
      status: 'LIVE',
      proctoringEnabled: true,
      blockTabSwitch: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      publishedResults: false,
    },
  })

  // 4. Create Questions for CS-402
  await prisma.question.createMany({
    data: [
      {
        examId: exam1.id,
        subject: 'Computer Science',
        topic: 'Trees & BST',
        type: 'MCQ',
        statement: 'What is the worst-case time complexity of searching an element in an unbalanced Binary Search Tree?',
        optionsJson: JSON.stringify(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)']),
        correctAnswer: '2',
        points: 2,
        difficulty: 'EASY',
      },
      {
        examId: exam1.id,
        subject: 'Computer Science',
        topic: 'Dynamic Programming',
        type: 'MCQ',
        statement: 'Which algorithmic paradigm does the 0/1 Knapsack problem typically employ for optimal subproblems?',
        optionsJson: JSON.stringify(['Greedy Algorithm', 'Dynamic Programming', 'Divide & Conquer', 'Backtracking']),
        correctAnswer: '1',
        points: 3,
        difficulty: 'MEDIUM',
      },
      {
        examId: exam1.id,
        subject: 'Computer Science',
        topic: 'Distributed Systems',
        type: 'SUBJECTIVE',
        statement: 'Explain the CAP Theorem and discuss why distributed databases must choose between Consistency and Availability during network partitions.',
        optionsJson: null,
        correctAnswer: 'Model Rubric: Definition of Consistency, Availability, Partition tolerance (3 pts). Explanation of network partition reality (2 pts). CAP trade-off rationale (5 pts).',
        points: 10,
        difficulty: 'HARD',
      },
    ],
  })

  console.log('✅ Database seeded successfully!')
  console.log('-------------------------------------------------------')
  console.log('Demo Credentials for Login:')
  console.log('Super Admin:  admin@enterprise.org / password123')
  console.log('Examiner:     examiner@enterprise.org / password123')
  console.log('Proctor:      proctor@enterprise.org / password123')
  console.log('Evaluator:    evaluator@enterprise.org / password123')
  console.log('Candidate:    candidate@enterprise.org / password123')
  console.log('-------------------------------------------------------')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
