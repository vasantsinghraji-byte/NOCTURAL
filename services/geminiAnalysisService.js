/**
 * Gemini Analysis Service
 *
 * Uses Google Gemini Pro Vision API to analyze medical investigation reports.
 * Extracts key findings, generates summaries, and flags potential concerns.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Initialize Gemini client
let genAI = null;
let model = null;

const initializeClient = () => {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }
  return !!model;
};

// Medical report analysis prompt
const ANALYSIS_PROMPT = `You are a medical report analysis assistant. Analyze the provided medical investigation report and extract structured information.

Please provide the analysis in the following JSON format:
{
  "reportDate": "YYYY-MM-DD or null if not found",
  "labName": "Name of the laboratory or null",
  "patientName": "Patient name from report or null",
  "referringDoctor": "Referring doctor name or null",
  "testType": "Type of test (e.g., Complete Blood Count, Lipid Profile, etc.)",
  "findings": [
    {
      "parameter": "Name of the test parameter",
      "value": "Measured value as string",
      "unit": "Unit of measurement",
      "normalRange": "Normal range as string",
      "status": "NORMAL, LOW, HIGH, CRITICAL_LOW, or CRITICAL_HIGH",
      "interpretation": "Brief interpretation of this value"
    }
  ],
  "summary": "A 2-3 sentence summary of the overall report findings",
  "keyObservations": ["List of 3-5 key observations from the report"],
  "concerns": [
    {
      "severity": "LOW, MEDIUM, HIGH, or CRITICAL",
      "description": "Description of the concern",
      "recommendation": "Suggested action or follow-up"
    }
  ],
  "confidenceScore": 85
}

Important guidelines:
1. Extract ALL test parameters found in the report
2. Compare values against the provided normal ranges
3. Flag any values outside normal ranges
4. Be conservative with severity ratings - only mark CRITICAL for life-threatening values
5. The confidence score should reflect how clearly the report was readable (0-100)
6. If you cannot read or parse certain parts, note that in the summary
7. Focus on factual extraction, avoid making diagnoses

Analyze the following medical report:`;

/**
 * Convert file to Gemini-compatible format
 */
const fileToGenerativePart = async (filePath, mimeType) => {
  const data = await fs.readFile(filePath);
  return {
    inlineData: {
      data: data.toString('base64'),
      mimeType
    }
  };
};

/**
 * Analyze a medical report using Gemini
 */
const analyzeReport = async (filePath, mimeType) => {
  if (!initializeClient()) {
    throw new Error('Gemini API key not configured');
  }

  try {
    const imagePart = await fileToGenerativePart(filePath, mimeType);

    const result = await model.generateContent([
      ANALYSIS_PROMPT,
      imagePart
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      analysis,
      rawResponse: text,
      model: 'gemini-1.5-flash'
    };
  } catch (error) {
    logger.error('Gemini analysis failed', {
      error: error.message,
      filePath
    });

    return {
      success: false,
      error: {
        code: error.code || 'ANALYSIS_FAILED',
        message: error.message,
        retryable: isRetryableError(error)
      }
    };
  }
};

/**
 * Analyze multiple files for a single report
 */
const analyzeMultipleFiles = async (files) => {
  if (!initializeClient()) {
    throw new Error('Gemini API key not configured');
  }

  try {
    const imageParts = await Promise.all(
      files.map(file => fileToGenerativePart(file.path, file.mimeType))
    );

    const result = await model.generateContent([
      ANALYSIS_PROMPT + '\n\nNote: Multiple pages/files are provided. Analyze all of them as a single report.',
      ...imageParts
    ]);

    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      analysis,
      rawResponse: text,
      model: 'gemini-1.5-flash'
    };
  } catch (error) {
    logger.error('Gemini multi-file analysis failed', {
      error: error.message,
      fileCount: files.length
    });

    return {
      success: false,
      error: {
        code: error.code || 'ANALYSIS_FAILED',
        message: error.message,
        retryable: isRetryableError(error)
      }
    };
  }
};

/**
 * Analyze from URL (for S3/cloud storage)
 */
const analyzeFromUrl = async (url, mimeType) => {
  if (!initializeClient()) {
    throw new Error('Gemini API key not configured');
  }

  try {
    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType
      }
    };

    const result = await model.generateContent([
      ANALYSIS_PROMPT,
      imagePart
    ]);

    const responseText = (await result.response).text();

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Gemini response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      analysis,
      rawResponse: responseText,
      model: 'gemini-1.5-flash'
    };
  } catch (error) {
    logger.error('Gemini URL analysis failed', {
      error: error.message,
      url: url.substring(0, 50) + '...'
    });

    return {
      success: false,
      error: {
        code: error.code || 'ANALYSIS_FAILED',
        message: error.message,
        retryable: isRetryableError(error)
      }
    };
  }
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error) => {
  const retryableCodes = [
    'RATE_LIMIT_EXCEEDED',
    'RESOURCE_EXHAUSTED',
    'INTERNAL',
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED'
  ];

  return retryableCodes.includes(error.code) ||
         error.message?.includes('rate limit') ||
         error.message?.includes('timeout') ||
         error.message?.includes('temporarily unavailable');
};

/**
 * Validate analysis result structure
 */
const validateAnalysisResult = (analysis) => {
  const requiredFields = ['summary', 'findings'];
  const missingFields = requiredFields.filter(field => !analysis[field]);

  if (missingFields.length > 0) {
    return {
      valid: false,
      missingFields
    };
  }

  return { valid: true };
};

/**
 * Format analysis for storage
 */
const formatAnalysisForStorage = (geminiResult) => {
  if (!geminiResult.success) {
    return {
      status: 'FAILED',
      error: geminiResult.error
    };
  }

  const { analysis, rawResponse, model: modelName } = geminiResult;
  const validation = validateAnalysisResult(analysis);

  return {
    status: 'COMPLETED',
    model: modelName,
    completedAt: new Date(),
    extractedData: {
      reportDate: analysis.reportDate ? new Date(analysis.reportDate) : null,
      labName: analysis.labName,
      patientName: analysis.patientName,
      referringDoctor: analysis.referringDoctor,
      testType: analysis.testType,
      findings: analysis.findings || []
    },
    summary: analysis.summary,
    keyObservations: analysis.keyObservations || [],
    concerns: analysis.concerns || [],
    confidenceScore: analysis.confidenceScore || 0,
    rawResponse: rawResponse,
    validationIssues: validation.valid ? null : validation.missingFields
  };
};

module.exports = {
  analyzeReport,
  analyzeMultipleFiles,
  analyzeFromUrl,
  formatAnalysisForStorage,
  validateAnalysisResult,
  initializeClient
};
