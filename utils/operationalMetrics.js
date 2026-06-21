const counters = new Map();
const gauges = new Map();
const labeledCounters = new Map();

const increment = (name, amount = 1) => counters.set(name, (counters.get(name) || 0) + amount);
const labelsKey = labels => JSON.stringify(Object.keys(labels || {})
  .sort()
  .map(key => [key, String(labels[key])]));
const incrementLabeled = (name, labels = {}, amount = 1) => {
  const key = `${name}:${labelsKey(labels)}`;
  const current = labeledCounters.get(key) || { name, labels, value: 0 };
  current.value += amount;
  labeledCounters.set(key, current);
};
const setGauge = (name, value) => gauges.set(name, Number(value) || 0);
const snapshot = () => ({
  counters: Object.fromEntries(counters),
  gauges: Object.fromEntries(gauges),
  labeledCounters: Array.from(labeledCounters.values())
});

module.exports = { increment, incrementLabeled, setGauge, snapshot };
