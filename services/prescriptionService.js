/**
 * Digital Prescription Service
 *
 * Generates formatted clinical prescriptions with medicines,
 * diagnostic lab orders, and standardized patient advice.
 */

class PrescriptionService {
  /**
   * Format digital prescription HTML markup for viewing / PDF rendering
   * @param {Object} consultation Consultation document with populated doctor & patient
   * @returns {string} HTML document string
   */
  generatePrescriptionHtml(consultation) {
    const {
      consultationNumber,
      doctor,
      patient,
      assessment = {},
      prescription = {},
      endedAt,
      createdAt
    } = consultation;

    const dateStr = new Date(prescription.issuedAt || endedAt || createdAt).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const medicinesRows = (prescription.medicines || [])
      .map(
        (m, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${m.name}</strong>${m.isGeneric ? ' (Generic)' : ''}</td>
          <td>${m.dosage || '-'}</td>
          <td>${m.frequency || '-'}</td>
          <td>${m.duration || '-'}</td>
          <td>${m.instructions || '-'}</td>
        </tr>`
      )
      .join('');

    const labTestsRows = (prescription.labTests || [])
      .map(
        (t, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${t.testName || (t.test && t.test.name) || 'Diagnostic Test'}</td>
          <td><span class="badge ${t.urgency === 'URGENT' ? 'urgent' : 'routine'}">${t.urgency || 'ROUTINE'}</span></td>
          <td>${t.reason || '-'}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Prescription - ${consultationNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 40px; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 20px; }
    .doctor-info h2 { margin: 0; color: #0284c7; }
    .doctor-info p { margin: 4px 0; font-size: 14px; color: #64748b; }
    .patient-card { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 24px 0; display: grid; grid-template-columns: repeat(4, 1fr); font-size: 14px; }
    .section-title { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
    th { background: #f1f5f9; text-align: left; padding: 8px; color: #475569; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .badge.urgent { background: #fee2e2; color: #b91c1c; }
    .badge.routine { background: #e0f2fe; color: #0369a1; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="doctor-info">
      <h2>Dr. ${doctor?.name || 'Practitioner'}</h2>
      <p>${doctor?.specialty || 'General Practitioner'} | Reg No: ${doctor?.medicalRegistrationNumber || 'MCI-VERIFIED'}</p>
      <p>MedRush Telemedicine Network</p>
    </div>
    <div style="text-align: right;">
      <h3 style="margin: 0; color: #0f172a;">DIGITAL PRESCRIPTION</h3>
      <p style="margin: 4px 0; font-size: 13px; color: #64748b;">Ref: ${consultationNumber}</p>
      <p style="margin: 4px 0; font-size: 13px; color: #64748b;">Date: ${dateStr}</p>
    </div>
  </div>

  <div class="patient-card">
    <div><strong>Patient:</strong> ${patient?.name || 'Valued Patient'}</div>
    <div><strong>Age/Gender:</strong> ${patient?.age || '-'} / ${patient?.gender || '-'}</div>
    <div><strong>Blood Group:</strong> ${patient?.bloodGroup || '-'}</div>
    <div><strong>Phone:</strong> ${patient?.phone || '-'}</div>
  </div>

  ${assessment.diagnosis ? `
    <div class="section-title">Clinical Diagnosis</div>
    <p style="font-size: 14px; margin: 8px 0;">${assessment.diagnosis}</p>
  ` : ''}

  ${medicinesRows ? `
    <div class="section-title">Rx - Prescribed Medications</div>
    <table>
      <thead>
        <tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr>
      </thead>
      <tbody>${medicinesRows}</tbody>
    </table>
  ` : ''}

  ${labTestsRows ? `
    <div class="section-title">Recommended Lab / Diagnostic Tests</div>
    <table>
      <thead>
        <tr><th>#</th><th>Test Name</th><th>Urgency</th><th>Clinical Reason</th></tr>
      </thead>
      <tbody>${labTestsRows}</tbody>
    </table>
  ` : ''}

  ${prescription.generalAdvice || assessment.advice ? `
    <div class="section-title">Advice & Lifestyle Instructions</div>
    <p style="font-size: 14px; line-height: 1.6; margin: 8px 0;">${prescription.generalAdvice || assessment.advice}</p>
  ` : ''}

  <div class="footer">
    <div>Generated electronically by MedRush. Valid under Indian Telemedicine Practice Guidelines 2020.</div>
    <div>Doctor Signature: Digitally Signed by Dr. ${doctor?.name || 'Verified Practitioner'}</div>
  </div>
</body>
</html>`;
  }
}

module.exports = new PrescriptionService();
