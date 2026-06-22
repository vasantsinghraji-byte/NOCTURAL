/**
 * Disallow direct DOM HTML sinks outside the central AppUi helper.
 *
 * Direct innerHTML / insertAdjacentHTML usage has repeatedly created XSS
 * review debt. Use AppUi.setSafeHtml(), AppUi.appendSafeHtml(), textContent,
 * or explicit DOM node construction instead.
 */

'use strict';

// eslint 9+/10: prefer context.sourceCode; fall back to the removed getSourceCode() for older versions
const getSourceText = (context, node) => (context.sourceCode || context.getSourceCode()).getText(node);

module.exports = {
    meta: {
    type: 'problem',
    docs: {
      description: 'disallow direct DOM HTML sinks; use AppUi helpers or DOM node construction',
      recommended: true
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      innerHTML:
        'Do not access innerHTML directly. Use textContent for text, AppUi.setSafeHtml(element, html) for sanitized HTML, or construct DOM nodes explicitly.',
      insertAdjacentHTML:
        'Do not call insertAdjacentHTML() directly. Use AppUi.appendSafeHtml(element, html) for sanitized HTML or construct DOM nodes explicitly.',
      replaceAssignment: 'Replace this assignment with AppUi.setSafeHtml(...).',
      replaceAppend: 'Replace this append with AppUi.appendSafeHtml(...).'
    }
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || !node.property || node.property.name !== 'innerHTML') {
          return;
        }

        const parent = node.parent;
        const isSimpleAssignment = parent
          && parent.type === 'AssignmentExpression'
          && parent.operator === '='
          && parent.left === node;

        context.report({
          node,
          messageId: 'innerHTML',
          fix: isSimpleAssignment
            ? (fixer) => fixer.replaceText(
                parent,
                `AppUi.setSafeHtml(${getSourceText(context, node.object)}, ${getSourceText(context, parent.right)})`
              )
            : null,
          suggest: isSimpleAssignment
            ? [{
                messageId: 'replaceAssignment',
                fix(fixer) {
                  return fixer.replaceText(
                    parent,
                    `AppUi.setSafeHtml(${getSourceText(context, node.object)}, ${getSourceText(context, parent.right)})`
                  );
                }
              }]
            : []
        });
      },

      CallExpression(node) {
        const callee = node.callee;
        if (
          !callee
          || callee.type !== 'MemberExpression'
          || callee.computed
          || !callee.property
          || callee.property.name !== 'insertAdjacentHTML'
        ) {
          return;
        }

        const [position, html] = node.arguments;
        const canSuggestAppend = position
          && position.type === 'Literal'
          && position.value === 'beforeend'
          && html;

        context.report({
          node,
          messageId: 'insertAdjacentHTML',
          fix: canSuggestAppend
            ? (fixer) => fixer.replaceText(
                node,
                `AppUi.appendSafeHtml(${getSourceText(context, callee.object)}, ${getSourceText(context, html)})`
              )
            : null,
          suggest: canSuggestAppend
            ? [{
                messageId: 'replaceAppend',
                fix(fixer) {
                  return fixer.replaceText(
                    node,
                    `AppUi.appendSafeHtml(${getSourceText(context, callee.object)}, ${getSourceText(context, html)})`
                  );
                }
              }]
            : []
        });
      }
    };
  }
};
