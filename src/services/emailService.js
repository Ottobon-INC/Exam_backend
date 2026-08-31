import nodemailer from 'nodemailer'

/**
 * Creates Nodemailer Transporter using SMTP settings from .env
 */
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT) || 587
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD

  if (!user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  })
}

/**
 * Sends the official Ottobon Academy AI Engineer Selection Assessment email template.
 */
export const sendExamInvitationEmail = async ({
  candidateName,
  candidateEmail,
  rollNumber,
  rawPassword,
  examTitle,
  examCode,
  durationMinutes,
  candidatePortalUrl,
}) => {
  const portalUrl = candidatePortalUrl || `${process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5050'}/login`
  const transporter = createTransporter()
  const fromAddress = process.env.SMTP_FROM || `"Ottobon Examination Portal" <${process.env.SMTP_USER || 'ai.acad.ottobon@gmail.com'}>`
  const supportContact = process.env.SUPPORT_CONTACT || '+91 9666721646'
  const supportEmail = process.env.SUPPORT_EMAIL || 'ai.acad.ottobon@gmail.com'

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selection Assessment Invitation - Ottobon Academy</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a; line-height:1.6;">
  <!-- Inbox Preheader Text (Visible in Email Client Preview) -->
  <div style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden;">
    Ottobon Academy — AI Engineer Program with Claude. Your registration is confirmed! Log in to select your Monday assessment slot today.
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9; padding:30px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="650" border="0" cellspacing="0" cellpadding="0" style="max-width:650px; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 15px 35px rgba(15,23,42,0.08); border:1px solid #cbd5e1;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #09090b 0%, #1e1b4b 100%); padding:40px 32px; text-align:center; color:#ffffff;">
              <div style="display:inline-block; padding:6px 16px; background-color:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:9999px; color:#e0e7ff; font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:16px;">
                Official Anthropic Partner
              </div>
              <h1 style="margin:0; font-size:24px; font-weight:900; letter-spacing:-0.5px; color:#ffffff; line-height:1.3;">
                Ottobon Academy
              </h1>
              <p style="margin:8px 0 0 0; color:#818cf8; font-size:15px; font-weight:700;">
                AI Engineer Program with Claude
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:36px 32px; background-color:#ffffff;">
              
              <!-- Greeting & Intro -->
              <p style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#0f172a;">
                Hi ${candidateName},
              </p>
              
              <!-- Congratulations Box -->
              <div style="background-color:#f0fdf4; border-left:4px solid #16a34a; border-radius:0 12px 12px 0; padding:18px 20px; margin-bottom:28px;">
                <p style="margin:0; font-size:15px; font-weight:700; color:#14532d; line-height:1.5;">
                  🎉 Congratulations! Your registration for the Ottobon Academy AI Engineer Program with Claude is confirmed.
                </p>
              </div>

              <p style="margin:0 0 16px 0; font-size:14px; color:#334155;">
                Your next step is now ready.
              </p>
              <p style="margin:0 0 24px 0; font-size:14px; color:#334155;">
                Your <strong>Claude AI Engineer Selection Assessment</strong> will be conducted on:
              </p>

              <!-- Date Badge -->
              <div style="background-color:#eef2ff; border:1px solid #c7d2fe; border-radius:14px; padding:18px; text-align:center; margin-bottom:28px;">
                <span style="font-size:11px; font-weight:800; color:#4338ca; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:4px;">Scheduled Assessment Date</span>
                <span style="font-size:20px; font-weight:900; color:#1e1b4b; display:block;">Monday, August 31, 2026</span>
                <span style="font-size:12px; color:#4f46e5; font-weight:600; margin-top:4px; display:block;">First step toward entering the AI Engineer Cohort Program with Claude</span>
              </div>

              <hr style="border:0; border-top:1px solid #e2e8f0; margin:28px 0;" />

              <!-- Credentials Section -->
              <h3 style="margin:0 0 16px 0; font-size:16px; font-weight:800; color:#0f172a;">🔑 Your Assessment Login Details</h3>
              
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; border:1px solid #cbd5e1; border-radius:14px; padding:20px; margin-bottom:28px;">
                <tr>
                  <td>
                    <table width="100%" border="0" cellspacing="0" cellpadding="8">
                      <tr>
                        <td width="35%" style="font-size:13px; font-weight:600; color:#64748b;">Assessment Platform:</td>
                        <td style="font-size:13px; font-weight:700;"><a href="${portalUrl}" target="_blank" style="color:#2563eb; text-decoration:underline;">${portalUrl}</a></td>
                      </tr>
                      <tr>
                        <td style="font-size:13px; font-weight:600; color:#64748b;">Username (Email):</td>
                        <td style="font-size:13px; font-weight:700; font-family:monospace; color:#0f172a;">${candidateEmail}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px; font-weight:600; color:#64748b;">Password:</td>
                        <td style="font-size:14px; font-weight:800; font-family:monospace; color:#0d9488; background-color:#ccfbf1; padding:4px 10px; border-radius:6px; display:inline-block;">${rawPassword || 'Pass@1234'}</td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0 0; font-size:12px; color:#64748b; font-style:italic; border-top:1px dashed #cbd5e1; padding-top:10px;">
                      These login credentials are unique to you. Please do not share your username, password, or assessment access with anyone else.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Slot Selection / Assessment Instructions -->
              <h3 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:#0f172a;">📅 Select Your Preferred Assessment Slot</h3>
              <p style="margin:0 0 14px 0; font-size:14px; color:#334155;">
                You are <strong>not assigned a fixed exam time</strong>. Once you log in to the platform, you will be able to view the <strong>available assessment slots for Monday</strong>.
              </p>

              <div style="background-color:#fafafa; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-bottom:28px;">
                <ol style="margin:0; padding-left:20px; font-size:13px; color:#1e293b; line-height:1.8;">
                  <li style="margin-bottom:6px;"><strong>Log in using your credentials</strong></li>
                  <li style="margin-bottom:6px;"><strong>View the available Monday slots</strong></li>
                  <li style="margin-bottom:6px;"><strong>Select the slot that works best for you</strong></li>
                  <li><strong>Attend the assessment during your selected slot</strong></li>
                </ol>
              </div>

              <p style="margin:0 0 24px 0; font-size:13px; color:#475569; line-height:1.6;">
                We recommend selecting your preferred slot as early as possible based on availability. Once selected, make sure you are available and ready before your chosen assessment time.
              </p>

              <hr style="border:0; border-top:1px solid #e2e8f0; margin:28px 0;" />

              <!-- About Assessment -->
              <h3 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:#0f172a;">💡 What Is This Assessment About?</h3>
              <p style="margin:0 0 14px 0; font-size:14px; color:#334155;">
                This is a <strong>readiness-based Selection Assessment</strong> for the AI Engineer Program. You are <strong>not expected to already know AI, Claude, Python, APIs, or advanced programming concepts</strong>. These are areas that students will learn during the program.
              </p>
              <p style="margin:0 0 16px 0; font-size:14px; color:#334155;">
                The purpose of the assessment is to understand whether you demonstrate the foundational readiness required to successfully learn and progress through the cohort.
              </p>

              <div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-bottom:28px;">
                <h4 style="margin:0 0 12px 0; font-size:13px; font-weight:800; color:#1e293b; text-transform:uppercase;">The assessment will evaluate areas such as:</h4>
                <ul style="margin:0; padding-left:18px; font-size:13px; color:#334155; line-height:1.7;">
                  <li style="margin-bottom:8px;"><strong>Logical & Analytical Thinking:</strong> Your ability to understand information, identify patterns, connect ideas, and arrive at logical conclusions.</li>
                  <li style="margin-bottom:8px;"><strong>Problem Solving & Decision Making:</strong> How you understand a situation, evaluate available information, and approach unfamiliar problems.</li>
                  <li style="margin-bottom:8px;"><strong>Digital & Technical Readiness:</strong> Your ability to understand structured digital concepts, instructions, and technology-related situations.</li>
                  <li><strong>Learning & Applied Thinking:</strong> How effectively you understand new information and apply it to solve a new problem or situation.</li>
                </ul>
              </div>

              <!-- Proctored Notice -->
              <h3 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:#0f172a;">🛡️ This Is a Proctored Assessment</h3>
              <p style="margin:0 0 14px 0; font-size:14px; color:#334155;">
                To maintain fairness for every participant, the assessment will be conducted in a <strong>proctored environment</strong>. During your assessment, please make sure you:
              </p>
              <ul style="margin:0 0 28px 0; padding-left:20px; font-size:13px; color:#475569; line-height:1.7;">
                <li>Attempt the assessment independently</li>
                <li>Use only your assigned credentials</li>
                <li>Allow the permissions requested by the proctoring system (webcam & microphone)</li>
                <li>Follow all instructions displayed on the assessment platform</li>
                <li>Avoid unnecessary tab switching or opening additional applications</li>
                <li>Do not share assessment questions or content with anyone</li>
                <li>Maintain a stable internet connection</li>
                <li>Use a laptop or desktop wherever possible</li>
                <li>Stay in a quiet and distraction-free environment</li>
                <li>Remain available for the complete duration of your selected assessment slot</li>
              </ul>

              <!-- TOP 5 OFFER BANNER -->
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:2px solid #f59e0b; border-radius:16px; padding:24px; text-align:center; margin-bottom:32px;">
                <span style="font-size:24px; display:block; margin-bottom:6px;">🏆</span>
                <h3 style="margin:0; font-size:18px; font-weight:900; color:#78350f;">TOP 5 ASSESSMENT OPPORTUNITY</h3>
                <p style="margin:6px 0 14px 0; font-size:13px; font-weight:700; color:#92400e;">
                  The TOP 5 PERFORMERS in the Selection Assessment will receive:
                </p>
                <div style="background-color:#78350f; color:#ffffff; padding:12px 24px; border-radius:10px; font-size:18px; font-weight:900; letter-spacing:1px; display:inline-block; margin-bottom:14px;">
                  100% FREE COURSE TRAINING
                </div>
                <p style="margin:0; font-size:12px; color:#92400e; line-height:1.5;">
                  Their complete training fee for the upcoming AI Engineer cohort will be waived. Students who qualify outside the Top 5 will also be eligible to proceed to the next stage of the admission process.
                </p>
              </div>

              <!-- Results Section -->
              <h3 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:#0f172a;">📊 Assessment Results</h3>
              <p style="margin:0 0 14px 0; font-size:14px; color:#334155;">
                Your final result will <strong>not be displayed immediately after you complete the assessment</strong>. Once the assessment process is completed:
              </p>
              <ul style="margin:0 0 28px 0; padding-left:20px; font-size:13px; color:#475569; line-height:1.6;">
                <li>Assessment submissions will be reviewed</li>
                <li>Applicable proctoring information will be reviewed</li>
                <li>Final qualification results will be prepared</li>
                <li>Top 5 performers will be identified</li>
              </ul>

              <!-- Checklist Box -->
              <div style="background-color:#f8fafc; border:1px solid #cbd5e1; border-radius:14px; padding:20px; margin-bottom:32px;">
                <h3 style="margin:0 0 14px 0; font-size:15px; font-weight:800; color:#0f172a;">📋 Before Monday — Quick Checklist</h3>
                <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size:13px; color:#334155;">
                  <tr><td>✓ Successfully logged into the platform</td></tr>
                  <tr><td>✓ Selected your preferred available Monday slot</td></tr>
                  <tr><td>✓ A laptop or desktop ready</td></tr>
                  <tr><td>✓ A stable internet connection</td></tr>
                  <tr><td>✓ Your login credentials available</td></tr>
                  <tr><td>✓ A quiet environment for the assessment</td></tr>
                  <tr><td>✓ Enough time to complete the assessment without interruption</td></tr>
                </table>
              </div>

              <!-- Call-To-Action Box -->
              <div style="background-color:#09090b; border-radius:16px; padding:32px 24px; text-align:center; color:#ffffff; margin-bottom:32px;">
                <h2 style="margin:0 0 8px 0; font-size:20px; font-weight:900; color:#ffffff;">Your Next Step</h2>
                <p style="margin:0 0 20px 0; font-size:14px; color:#cbd5e1; font-weight:700;">
                  Log in now and select your preferred assessment slot.
                </p>

                <a href="${candidatePortalUrl}" target="_blank" style="display:inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color:#ffffff; font-size:15px; font-weight:800; text-decoration:none; padding:16px 36px; border-radius:12px; box-shadow:0 8px 20px rgba(79,70,229,0.4);">
                  🚀 Log In to Candidate Portal & Select Slot →
                </a>

                <div style="margin-top:24px; font-size:12px; color:#94a3b8; border-top:1px solid #27272a; padding-top:16px;">
                  <strong style="color:#ffffff;">Support Contact:</strong> ${supportContact} &nbsp;|&nbsp; <strong style="color:#ffffff;">Email:</strong> ${supportEmail}
                </div>
              </div>

              <!-- Inspirational Closing -->
              <div style="text-align:center; padding:10px 0;">
                <p style="margin:0 0 8px 0; font-size:15px; font-weight:800; color:#0f172a; font-style:italic;">
                  "Your registration got you to the starting line. Now it’s time to show your readiness."
                </p>
                <p style="margin:16px 0 0 0; font-size:14px; font-weight:700; color:#334155;">
                  Regards,<br />
                  <strong>Ottobon Academy</strong><br />
                  <span style="font-size:12px; color:#64748b;">AI Engineer Program with Claude (Official Anthropic Partner)</span>
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#09090b; padding:24px; text-align:center; color:#94a3b8; font-size:12px;">
              <p style="margin:0;">© 2026 Ottobon Academy. All rights reserved.</p>
              <p style="margin:4px 0 0 0; font-size:11px; color:#64748b;">This is an automated candidate invitation for the Claude AI Engineer Selection Assessment.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `

  if (!transporter) {
    console.log(`[SIMULATED EMAIL DISPATCH] (SMTP credentials not set in .env):`)
    console.log(`-> To: ${candidateEmail} (${candidateName})`)
    console.log(`-> Subject: Selection Assessment Invitation - Ottobon Academy`)
    console.log(`-> Login Email: ${candidateEmail} | Password: ${rawPassword || 'Pass@1234'}`)
    return { success: true, simulated: true }
  }

  const mailOptions = {
    from: fromAddress,
    to: candidateEmail,
    subject: `🎯 Ottobon Academy | AI Engineer Program with Claude — Selection Assessment Invitation & Login Credentials`,
    html: htmlContent,
  }

  const info = await transporter.sendMail(mailOptions)
  console.log(`✅ Official invitation email sent to ${candidateEmail}:`, info.messageId)
  return { success: true, messageId: info.messageId }
}
