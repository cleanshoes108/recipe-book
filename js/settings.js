// Small settings kept in localStorage: the API key for reading recipes, and the model.

const KEY = 'recipe-book:settings';

export const MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Recommended. Careful with cookbook pages.' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Faster and cheaper.' },
];

const DEFAULTS = { apiKey: '', model: MODELS[0].id };

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    /* storage unavailable; settings stay in memory for this session */
  }
  return next;
}

export function hasApiKey() {
  return Boolean(getSettings().apiKey);
}
