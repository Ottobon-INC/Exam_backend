import { memoryUsers } from './slotController.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/db.js'

export const login = async (req, res) => {
  try {
    const { email, password, portal } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    let user = null
    const cleanEmail = email.toLowerCase().trim()

    const { data: dbUser } = await supabase
      .from('ex_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (dbUser) {
      user = dbUser
    } else if (memoryUsers.has(cleanEmail)) {
      user = memoryUsers.get(cleanEmail)
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Portal role guard
    if (portal === 'ADMIN' && user.role === 'CANDIDATE') {
      return res.status(403).json({ error: 'Access denied: Candidate accounts cannot access Admin Portal' })
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'enterprise_exam_super_secure_jwt_secret_key_2026',
      { expiresIn: '7d' }
    )

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rollNumber: user.roll_number,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error during login' })
  }
}

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' })
    }

    const validRoles = ['SUPER_ADMIN', 'EXAMINER', 'PROCTOR', 'EVALUATOR']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role provided for admin registration' })
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('ex_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const password_hash = await bcrypt.hash(password, salt)

    // Insert new user
    const { data: newUser, error: insertError } = await supabase
      .from('ex_users')
      .insert([
        {
          name,
          email: email.toLowerCase().trim(),
          password_hash,
          raw_password: password,
          role,
        }
      ])
      .select()
      .single()

    if (insertError || !newUser) {
      console.error('Registration insert error:', insertError)
      return res.status(500).json({ error: 'Failed to create user' })
    }

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET || 'enterprise_exam_super_secure_jwt_secret_key_2026',
      { expiresIn: '7d' }
    )

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error during registration' })
  }
}

export const getMe = async (req, res) => {
  res.json({ user: req.user })
}
