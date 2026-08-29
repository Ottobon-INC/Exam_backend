import { supabase } from '../config/db.js'

// In-memory registry of latest candidate snapshots and connected candidates
const examRooms = new Map()

export const setupProctorSocket = (io) => {
  const proctorNamespace = io.of('/proctoring')

  proctorNamespace.on('connection', (socket) => {
    console.log(`[ProctorSocket] Client connected: ${socket.id}`)

    socket.on('join_exam', ({ examId, role, candidateId, candidateName, rollNumber }) => {
      socket.join(examId)
      socket.join('GLOBAL_PROCTORS') // Ensure proctors receive all events across exam rooms
      console.log(`[ProctorSocket] ${role} (${socket.id}) joined exam room: ${examId}`)

      if (role === 'CANDIDATE') {
        if (!examRooms.has(examId)) {
          examRooms.set(examId, new Map())
        }
        const candidateData = {
          candidateId,
          examId,
          candidateName,
          rollNumber,
          socketId: socket.id,
          timestamp: new Date(),
        }
        examRooms.get(examId).set(candidateId, candidateData)

        // Broadcast to proctors in this room & global proctor channels
        proctorNamespace.to(examId).emit('candidate_online', candidateData)
        proctorNamespace.to('GLOBAL_PROCTORS').emit('candidate_online', candidateData)
        proctorNamespace.emit('candidate_online', candidateData)
      } else if (role === 'PROCTOR') {
        // Send ALL existing active candidates across ALL exam rooms to the newly joined proctor
        for (const [eId, roomCandidates] of examRooms.entries()) {
          if (examId !== 'ALL' && String(eId) !== String(examId)) continue
          for (const [cId, cData] of roomCandidates.entries()) {
            const payload = { ...cData, examId: eId }
            socket.emit('candidate_online', payload)
            if (cData.latestFrame) {
              socket.emit('proctor_frame_stream', {
                examId: eId,
                candidateId: cId,
                candidateName: cData.candidateName,
                rollNumber: cData.rollNumber,
                frame: cData.latestFrame,
                lastHeartbeat: cData.lastHeartbeat || new Date(),
              })
            }
          }
        }
      }
    })

    socket.on('candidate_frame', (data) => {
      const { examId, candidateId, candidateName, rollNumber, frame } = data
      if (!examId || !candidateId) return

      // Cache the snapshot in memory for this candidate
      if (!examRooms.has(examId)) {
        examRooms.set(examId, new Map())
      }
      const room = examRooms.get(examId)
      const existing = room.get(candidateId) || { candidateId, candidateName, rollNumber }
      existing.latestFrame = frame
      existing.lastHeartbeat = new Date()
      existing.candidateName = candidateName || existing.candidateName
      existing.rollNumber = rollNumber || existing.rollNumber
      room.set(candidateId, existing)

      // Broadcast to this exam room, global channel, and all connected proctor sockets
      const payload = {
        examId,
        candidateId,
        candidateName: candidateName || existing.candidateName || 'Candidate',
        rollNumber: rollNumber || existing.rollNumber || 'CANDIDATE',
        frame,
        lastHeartbeat: new Date(),
      }
      proctorNamespace.to(examId).emit('proctor_frame_stream', payload)
      proctorNamespace.to('GLOBAL_PROCTORS').emit('proctor_frame_stream', payload)
      proctorNamespace.emit('proctor_frame_stream', payload)
      console.log(`[ProctorSocket] Snapshot relayed for candidate ${candidateName} (${candidateId}) in room ${examId}`)
    })

    const handleViolation = async (data) => {
      const { examId, attemptId, candidateId, eventType, severity, details } = data
      try {
        if (attemptId) {
          await supabase.from('ex_proctor_logs').insert({
            attempt_id: attemptId,
            candidate_id: candidateId,
            event_type: eventType,
            severity: severity || 'MEDIUM',
            details,
          })

          const { data: att } = await supabase.from('ex_attempts').select('violations').eq('id', attemptId).single()
          if (att) {
            await supabase.from('ex_attempts').update({ violations: (att.violations || 0) + 1 }).eq('id', attemptId)
          }
        }
      } catch (err) {
        console.error('[ProctorSocket] Error saving violation log:', err)
      }

      const alertPayload = {
        examId,
        candidateId,
        eventType,
        severity,
        details,
        timestamp: new Date(),
      }
      proctorNamespace.to(examId).emit('violation_alert', alertPayload)
      proctorNamespace.to('GLOBAL_PROCTORS').emit('violation_alert', alertPayload)
      proctorNamespace.emit('violation_alert', alertPayload)
    }

    socket.on('log_violation', handleViolation)
    socket.on('candidate_violation', handleViolation)

    socket.on('proctor_action', ({ examId, candidateId, action, message }) => {
      const actionPayload = {
        targetCandidateId: candidateId,
        action,
        message,
        timestamp: new Date(),
      }
      proctorNamespace.to(examId).emit('proctor_intervention', actionPayload)
      proctorNamespace.emit('proctor_intervention', actionPayload)
    })

    socket.on('disconnect', () => {
      console.log(`[ProctorSocket] Client disconnected: ${socket.id}`)
    })
  })
}
