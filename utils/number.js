const roundToDecimals = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const roundToTwoDecimals = (value) => roundToDecimals(value, 2);

module.exports = {
  roundToDecimals,
  roundToTwoDecimals
};
