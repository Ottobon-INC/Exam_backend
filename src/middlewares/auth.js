import { memoryUsers } from '../controllers/slotController.js'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/db.js'

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'enterprise_exam_super_secure_jwt_secret_key_2026')

    let user = null
    const { data: dbUser } = await supabase
      .from('ex_users')
      .select('id, email, name, role, roll_number')
      .eq('id', decoded.userId)
      .maybeSingle()

    if (dbUser) {
      user = dbUser
    } else if (memoryUsers) {
      for (const u of memoryUsers.values()) {
        if (u.id === decoded.userId) {
          user = {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            roll_number: u.roll_number || u.rollNumber,
          }
          break
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' })
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      rollNumber: user.roll_number,
    }
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' })
  }
}

/**
 * Universal Role Middleware:
 * SUPER_ADMIN has unrestricted global bypass across all endpoints.
 */
export const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user session found' })
    }

    // SUPER_ADMIN has full system-wide permissions
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
      return next()
    }

    // Check specific role inclusion
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' })
    }

    next()
  }
}
