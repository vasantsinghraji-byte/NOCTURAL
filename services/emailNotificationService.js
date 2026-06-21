const logger = require('../utils/logger');

const getFetch = () => {
  if (typeof global.fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime');
  }
  return global.fetch;
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const postEmailWebhook = async (payload) => {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL || process.env.NOTIFICATION_EMAIL_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.info('Email webhook not configured; notification logged only', {
      to: payload.to,
      subject: payload.subject,
      template: payload.template
    });
    return { sent: false, skipped: true };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.EMAIL_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}`;
  }

  const response = await getFetch()(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Email webhook failed with HTTP ${response.status}`);
  }

  return { sent: true };
};

const sendHospitalWaitlistConfirmation = async (lead) => postEmailWebhook({
  template: 'hospital_waitlist_confirmation',
  to: lead.email,
  from: process.env.EMAIL_FROM || 'Nocturnal <no-reply@nocturnal.com>',
  subject: 'Nocturnal hospital pilot waitlist',
  text: `Hi ${lead.contactName},\n\nThanks for joining the Nocturnal hospital pilot waitlist. We will contact you when B2B duty staffing onboarding opens for ${lead.facilityName}.\n\nNocturnal`,
  html: `<p>Hi ${escapeHtml(lead.contactName)},</p><p>Thanks for joining the Nocturnal hospital pilot waitlist. We will contact you when B2B duty staffing onboarding opens for <strong>${escapeHtml(lead.facilityName)}</strong>.</p><p>Nocturnal</p>`
});

const sendHospitalWaitlistAdminNotification = async (lead) => {
  const adminEmail = process.env.WAITLIST_ADMIN_EMAIL || process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    logger.info('Waitlist admin email not configured; lead notification logged only', {
      leadId: lead._id,
      facilityName: lead.facilityName
    });
    return { sent: false, skipped: true };
  }

  return postEmailWebhook({
    template: 'hospital_waitlist_admin_notification',
    to: adminEmail,
    from: process.env.EMAIL_FROM || 'Nocturnal <no-reply@nocturnal.com>',
    subject: `New B2B waitlist lead: ${lead.facilityName}`,
    text: [
      `Facility: ${lead.facilityName}`,
      `Type: ${lead.facilityType}`,
      `Contact: ${lead.contactName}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone}`,
      `Location: ${lead.city}${lead.state ? `, ${lead.state}` : ''}`,
      `Need: ${lead.expectedNeed || 'Not provided'}`
    ].join('\n')
  });
};

module.exports = {
  sendHospitalWaitlistConfirmation,
  sendHospitalWaitlistAdminNotification
};
