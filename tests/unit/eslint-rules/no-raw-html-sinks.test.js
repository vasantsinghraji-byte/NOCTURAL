const { RuleTester } = require('eslint');
const rule = require('../../../tools/eslint-rules/no-raw-html-sinks');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  }
});

ruleTester.run('no-raw-html-sinks', rule, {
  valid: [
    'element.textContent = message;',
    'AppUi.setSafeHtml(element, html);',
    'AppUi.appendSafeHtml(element, html);',
    'element.appendChild(document.createTextNode(message));'
  ],

  invalid: [
    {
      code: 'element.innerHTML = html;',
      output: 'AppUi.setSafeHtml(element, html);',
      errors: [{
        messageId: 'innerHTML',
        suggestions: [{
          messageId: 'replaceAssignment',
          output: 'AppUi.setSafeHtml(element, html);'
        }]
      }]
    },
    {
      code: 'button.dataset.originalHtml = button.innerHTML;',
      errors: [{ messageId: 'innerHTML' }]
    },
    {
      code: "container.insertAdjacentHTML('beforeend', html);",
      output: 'AppUi.appendSafeHtml(container, html);',
      errors: [{
        messageId: 'insertAdjacentHTML',
        suggestions: [{
          messageId: 'replaceAppend',
          output: 'AppUi.appendSafeHtml(container, html);'
        }]
      }]
    },
    {
      code: "container.insertAdjacentHTML('afterbegin', html);",
      errors: [{ messageId: 'insertAdjacentHTML' }]
    }
  ]
});
