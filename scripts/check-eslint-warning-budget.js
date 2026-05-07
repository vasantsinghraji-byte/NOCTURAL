#!/usr/bin/env node

const path = require('path');
const { ESLint } = require('eslint');

const DEFAULT_WARNING_BUDGET = 78;

function parseBudget(value) {
  if (!value) {
    return DEFAULT_WARNING_BUDGET;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid ESLint warning budget: ${value}`);
  }

  return parsed;
}

function countMessages(report) {
  let errors = 0;
  let warnings = 0;
  const rules = {};

  for (const fileReport of report) {
    errors += fileReport.errorCount || 0;
    warnings += fileReport.warningCount || 0;

    for (const message of fileReport.messages || []) {
      if (message.severity !== 1) {
        continue;
      }

      const ruleId = message.ruleId || 'unknown';
      rules[ruleId] = (rules[ruleId] || 0) + 1;
    }
  }

  return { errors, warnings, rules };
}

function formatTopRules(rules) {
  const entries = Object.entries(rules)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([ruleId, count]) => `${ruleId}: ${count}`).join(', ');
}

async function run() {
  const budget = parseBudget(process.env.ESLINT_WARNING_BUDGET || process.argv[2]);
  const eslint = new ESLint({ cwd: path.resolve(__dirname, '..') });
  const report = await eslint.lintFiles(['.']);

  const summary = countMessages(report);

  console.log(`ESLint warning budget: ${summary.warnings}/${budget}`);
  console.log(`ESLint errors: ${summary.errors}`);
  console.log(`Top warning rules: ${formatTopRules(summary.rules)}`);

  if (summary.errors > 0) {
    process.exit(1);
  }

  if (summary.warnings > budget) {
    console.error(`ESLint warning budget exceeded: ${summary.warnings} warnings > ${budget} budget.`);
    process.exit(1);
  }
}

try {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
