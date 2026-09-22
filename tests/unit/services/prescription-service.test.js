const prescriptionService = require('../../../services/prescriptionService');

describe('PrescriptionService', () => {
  test('generates valid HTML with patient, doctor, medicines and lab tests', () => {
    const mockConsultation = {
      consultationNumber: 'CON-TEST-1234',
      doctor: {
        name: 'Sharma',
        specialty: 'Cardiologist',
        medicalRegistrationNumber: 'MCI-99882'
      },
      patient: {
        name: 'Rahul Verma',
        age: 32,
        gender: 'Male',
        bloodGroup: 'O+'
      },
      assessment: {
        diagnosis: 'Acute Bronchitis',
        advice: 'Drink warm water and avoid cold beverages.'
      },
      prescription: {
        medicines: [
          { name: 'Azithromycin', dosage: '500mg', frequency: 'Once daily', duration: '3 days' }
        ],
        labTests: [
          { testName: 'Complete Blood Count (CBC)', urgency: 'ROUTINE', reason: 'Rule out infection' }
        ],
        issuedAt: new Date('2026-09-21')
      }
    };

    const html = prescriptionService.generatePrescriptionHtml(mockConsultation);
    expect(html).toContain('Dr. Sharma');
    expect(html).toContain('Rahul Verma');
    expect(html).toContain('Acute Bronchitis');
    expect(html).toContain('Azithromycin');
    expect(html).toContain('Complete Blood Count (CBC)');
    expect(html).toContain('CON-TEST-1234');
  });
});
