/**
 * Legal Documents Routes
 * Publicly accessible legal pages (no authentication required)
 * Required for Indian legal compliance
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Legal document templates (inline for now - move to files later)
const legalDocuments = {
  terms: {
    title: 'Terms and Conditions',
    lastUpdated: '2025-01-21',
    content: `
      <h1>Terms and Conditions</h1>
      <p><strong>Last Updated:</strong> January 21, 2025</p>
      <p><strong>Effective Date:</strong> January 21, 2025</p>

      <h2>1. INTRODUCTION AND ACCEPTANCE</h2>
      <p>These Terms and Conditions ("Terms") constitute a legally binding agreement between you and [COMPANY NAME],
      a company incorporated under the Companies Act, 2013.</p>

      <p><strong>IMPORTANT:</strong> This Platform facilitates connections between healthcare facilities/patients
      and licensed nurses. We are a technology platform and not a healthcare provider.</p>

      <h2>2. SERVICES</h2>
      <p>The Nocturnal platform provides healthcare staffing facilitation services.</p>

      <h2>3. CONTACT INFORMATION</h2>
      <p><strong>Grievance Officer:</strong></p>
      <ul>
        <li>Email: grievance@nocturnal.com</li>
        <li>Response Time: 24 hours acknowledgment, 15 days resolution</li>
      </ul>

      <p><em>Note: This is a simplified version. Complete terms must be drafted by a lawyer.</em></p>
    `
  },

  privacy: {
    title: 'Privacy Policy',
    lastUpdated: '2025-01-21',
    content: `
      <h1>Privacy Policy</h1>
      <p><strong>Last Updated:</strong> January 21, 2025</p>

      <h2>1. INTRODUCTION</h2>
      <p>This Privacy Policy complies with:</p>
      <ul>
        <li>Digital Personal Data Protection Act, 2023 (DPDPA)</li>
        <li>Information Technology Act, 2000</li>
      </ul>

      <h2>2. DATA WE COLLECT</h2>
      <p>We collect personal data including name, email, phone, and health information for providing nursing services.</p>

      <h2>3. YOUR RIGHTS</h2>
      <ul>
        <li>Right to access your data</li>
        <li>Right to correction</li>
        <li>Right to erasure</li>
        <li>Right to withdraw consent</li>
      </ul>

      <h2>4. DATA PROTECTION OFFICER</h2>
      <p>Email: dpo@nocturnal.com</p>

      <p><em>Note: This is a simplified version. Complete privacy policy must be drafted by a lawyer.</em></p>
    `
  },

  refund: {
    title: 'Refund and Cancellation Policy',
    lastUpdated: '2025-01-21',
    content: `
      <h1>Refund and Cancellation Policy</h1>
      <p><strong>Last Updated:</strong> January 21, 2025</p>

      <h2>CANCELLATION POLICY</h2>
      <table border="1" cellpadding="10">
        <tr>
          <th>Cancellation Time</th>
          <th>Refund Amount</th>
        </tr>
        <tr>
          <td>&gt;24 hours before service</td>
          <td>95% refund (5% processing fee)</td>
        </tr>
        <tr>
          <td>12-24 hours before</td>
          <td>50% refund</td>
        </tr>
        <tr>
          <td>&lt;12 hours before</td>
          <td>No refund</td>
        </tr>
      </table>

      <h2>REFUND PROCESS</h2>
      <p>Refunds processed within 5-7 business days to original payment method.</p>

      <h2>CONTACT</h2>
      <p>Email: support@nocturnal.com</p>

      <p><em>Note: This is a simplified version. Complete policy must be drafted by a lawyer.</em></p>
    `
  },

  grievance: {
    title: 'Grievance Redressal Policy',
    lastUpdated: '2025-01-21',
    content: `
      <h1>Grievance Redressal Policy</h1>
      <p><strong>Last Updated:</strong> January 21, 2025</p>

      <p>This policy is formulated in accordance with:</p>
      <ul>
        <li>Information Technology (Intermediary Guidelines) Rules, 2021</li>
        <li>Digital Personal Data Protection Act, 2023</li>
      </ul>

      <h2>GRIEVANCE OFFICER</h2>
      <p><strong>Name:</strong> [To be appointed]</p>
      <p><strong>Email:</strong> grievance@nocturnal.com</p>
      <p><strong>Phone:</strong> +91-XXXXXXXXXX</p>
      <p><strong>Working Hours:</strong> Monday-Friday, 10 AM - 6 PM IST</p>

      <h2>HOW TO FILE A COMPLAINT</h2>
      <ol>
        <li>Email: grievance@nocturnal.com</li>
        <li>Include: Your name, contact, and detailed complaint</li>
        <li>Acknowledgment: Within 24 hours</li>
        <li>Resolution: Within 15 days</li>
      </ol>

      <h2>ESCALATION</h2>
      <p>If unsatisfied, you may approach:</p>
      <ul>
        <li>Data Protection Board of India (for privacy issues)</li>
        <li>Consumer Forums (for service issues)</li>
      </ul>

      <p><em>Note: Appoint a dedicated Grievance Officer before launch.</em></p>
    `
  }
};

// Middleware to add proper headers for legal pages
const legalHeaders = (req, res, next) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  next();
};

// Base HTML template
const htmlTemplate = (title, content, lastUpdated) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Nocturnal Healthcare Platform</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1a1a1a;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        h2 {
            color: #2c3e50;
            margin-top: 30px;
        }
        .last-updated {
            color: #666;
            font-size: 0.9em;
            font-style: italic;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border: 1px solid #ddd;
        }
        th {
            background-color: #007bff;
            color: white;
        }
        .notice {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        ${content}

        <div class="notice">
            <strong>⚠️ Important Notice:</strong> This is a template document.
            Before launch, these must be reviewed and customized by a qualified lawyer
            specializing in Indian healthcare and technology law.
        </div>

        <div class="footer">
            <p class="last-updated">Last Updated: ${lastUpdated}</p>
            <p>
                <a href="/legal/terms">Terms &amp; Conditions</a> |
                <a href="/legal/privacy">Privacy Policy</a> |
                <a href="/legal/refund">Refund Policy</a> |
                <a href="/legal/grievance">Grievance Redressal</a>
            </p>
            <p>&copy; 2025 Nocturnal Healthcare Platform. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;

// Routes for each legal document
router.get('/terms', legalHeaders, (req, res) => {
  const doc = legalDocuments.terms;
  res.send(htmlTemplate(doc.title, doc.content, doc.lastUpdated));
});

router.get('/privacy', legalHeaders, (req, res) => {
  const doc = legalDocuments.privacy;
  res.send(htmlTemplate(doc.title, doc.content, doc.lastUpdated));
});

router.get('/refund', legalHeaders, (req, res) => {
  const doc = legalDocuments.refund;
  res.send(htmlTemplate(doc.title, doc.content, doc.lastUpdated));
});

router.get('/cancellation', legalHeaders, (req, res) => {
  // Alias for refund
  const doc = legalDocuments.refund;
  res.send(htmlTemplate(doc.title, doc.content, doc.lastUpdated));
});

router.get('/grievance', legalHeaders, (req, res) => {
  const doc = legalDocuments.grievance;
  res.send(htmlTemplate(doc.title, doc.content, doc.lastUpdated));
});

// Index page listing all legal documents
router.get('/', legalHeaders, (req, res) => {
  const indexContent = `
    <h1>Legal Information</h1>
    <p>Welcome to Nocturnal Healthcare Platform's legal information center.</p>

    <h2>Available Documents</h2>
    <ul style="font-size: 1.1em; line-height: 2;">
      <li><a href="/legal/terms">Terms and Conditions</a></li>
      <li><a href="/legal/privacy">Privacy Policy</a></li>
      <li><a href="/legal/refund">Refund and Cancellation Policy</a></li>
      <li><a href="/legal/grievance">Grievance Redressal Policy</a></li>
    </ul>

    <h2>Contact Information</h2>
    <p><strong>For Grievances:</strong> grievance@nocturnal.com</p>
    <p><strong>For Privacy Concerns:</strong> dpo@nocturnal.com</p>
    <p><strong>Customer Support:</strong> support@nocturnal.com</p>
  `;

  res.send(htmlTemplate('Legal Information', indexContent, '2025-01-21'));
});

// API endpoint to get legal document metadata
router.get('/api/documents', (req, res) => {
  const metadata = Object.keys(legalDocuments).map(key => ({
    id: key,
    title: legalDocuments[key].title,
    lastUpdated: legalDocuments[key].lastUpdated,
    url: `/legal/${key}`
  }));

  res.json({
    success: true,
    documents: metadata
  });
});

module.exports = router;
