function pickAllowedFields(source, allowedFields) {
    const input = source || {};

    return allowedFields.reduce((result, field) => {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
            result[field] = input[field];
        }
        return result;
    }, {});
}

module.exports = pickAllowedFields;
