export const STORAGE_KEY = 'amigro.progress.v1';
export const STATUS_FIELDS = Object.freeze({
  eu: 'euCitizen',
  job: 'jobContract',
  student: 'student',
  family: 'bringingFamily'
});

export function getStatusAnswers(state) {
  return Object.fromEntries(Object.entries(STATUS_FIELDS).map(([key, field]) => [key, state[field] ?? null]));
}

export function getStatusUpdate(answers) {
  return Object.fromEntries(Object.entries(STATUS_FIELDS).map(([key, field]) => [field, answers[key] ?? null]));
}

export function hasCompleteStatus(answers) {
  return Object.keys(STATUS_FIELDS).every(key => typeof answers[key] === 'boolean');
}

export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function addDays(value, days) {
  const date = parseDate(value);
  if (!date || !Number.isInteger(days) || days < 0) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : null;
}

export function formatDate(value, locale = 'en-GB') {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) : '';
}

export function emptyProgress() {
  return { version: 1, ...getStatusUpdate({}), moveInDate: '', completedSteps: [], packedDocuments: [] };
}

export function restoreProgress(raw, content) {
  if (raw === null) return emptyProgress();
  const state = JSON.parse(raw);
  if (!state || state.version !== 1 || typeof state.moveInDate !== 'string' ||
      (state.moveInDate !== '' && !parseDate(state.moveInDate)) ||
      !Array.isArray(state.completedSteps) || !Array.isArray(state.packedDocuments) ||
      ![...state.completedSteps, ...state.packedDocuments].every(id => typeof id === 'string')) {
    throw new Error('invalid-progress');
  }
  // Keep known legacy answers and ticks. Missing answers remain unanswered.
  for (const field of Object.values(STATUS_FIELDS)) {
    if (Object.hasOwn(state, field) && state[field] !== null && typeof state[field] !== 'boolean') throw new Error('invalid-progress');
  }
  const known = (values, items) => [...new Set(values)].filter(id => items.some(item => item.id === id));
  return { version: 1, ...getStatusUpdate(getStatusAnswers(state)), moveInDate: state.moveInDate,
    completedSteps: known(state.completedSteps, content.steps),
    packedDocuments: known(state.packedDocuments, content.documents) };
}

export function stepApplies(step, state) {
  if (step.applies_if === undefined) return !(state.euCitizen === true && step.nonEuOnly);
  const answers = getStatusAnswers(state);
  return Object.entries(step.applies_if).every(([key, expected]) =>
    key === '_review' || typeof answers[key] !== 'boolean' || answers[key] === expected);
}

export function getChecklistProgress(content, state) {
  const visibleSteps = content.steps.filter(step => stepApplies(step, state));
  return {
    visibleSteps,
    done: visibleSteps.filter(step => state.completedSteps.includes(step.id)).length,
    total: visibleSteps.length
  };
}

export function validateContent(content) {
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const copyPaths = {
    '': ['brand', 'pageTitle'],
    checklist: ['subline', 'label', 'description', 'hint', 'completeLabel', 'doneLabel', 'nonEuLabel', 'viewLabel', 'listView', 'pathView', 'nextLabel'],
    onboarding: ['headline', 'subline', 'intro', 'yes', 'no', 'start', 'change', 'save', 'cancel'],
    progress: ['label', 'count'],
    detail: ['back', 'why', 'when', 'packing', 'packingReminder', 'packingHelp', 'noDocuments', 'sourceHeading', 'source', 'sourceNote', 'complete', 'undo', 'done', 'notDone'],
    about: ['label', 'headline', 'paragraph', 'reviewNote', 'footer'],
    storage: ['saved', 'saving', 'loading', 'read', 'corrupt', 'write', 'retryLoad', 'retrySave', 'reset', 'resetTitle', 'resetNote', 'resetConfirm', 'resetCancel'],
    bootstrap: ['error', 'retry']
  };
  if (content?.schemaVersion !== 1 || !Array.isArray(content.steps) || !content.steps.length || !Array.isArray(content.documents)) throw new Error('invalid-content');
  for (const [section, keys] of Object.entries(copyPaths)) {
    const copy = section ? content.ui?.[section] : content.ui;
    if (!keys.every(key => nonempty(copy?.[key]))) throw new Error('invalid-content-copy');
  }
  const questions = content.ui.onboarding.questions;
  if (!Array.isArray(questions) || questions.length !== Object.keys(STATUS_FIELDS).length ||
      new Set(questions.map(item => item?.id)).size !== questions.length ||
      !questions.every(item => item && Object.hasOwn(STATUS_FIELDS, item.id) && nonempty(item.label))) throw new Error('invalid-content-questions');
  if (!Array.isArray(content.ui.about.faq) || !content.ui.about.faq.length ||
      !content.ui.about.faq.every(item => nonempty(item?.question) && nonempty(item?.answer))) throw new Error('invalid-content-faq');
  if (!['{done}', '{total}'].every(token => content.ui.progress.count.includes(token)) || !content.ui.checklist.completeLabel.includes('{title}')) throw new Error('invalid-content-template');
  for (const items of [content.steps, content.documents]) {
    if (!items.every(item => item && nonempty(item.id)) || new Set(items.map(item => item.id)).size !== items.length) throw new Error('invalid-content-id');
  }
  for (const doc of content.documents) {
    if (!nonempty(doc.label) || (doc.note !== undefined && !nonempty(doc.note))) throw new Error('invalid-content-document');
  }
  for (const step of content.steps) {
    if (step.applies_if !== undefined) {
      const rule = step.applies_if;
      if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
          !Object.entries(rule).every(([key, value]) => key === '_review' ? value === 'TO VERIFY' : Object.hasOwn(STATUS_FIELDS, key) && typeof value === 'boolean')) throw new Error('invalid-content-condition');
    }
    if (!['title', 'shortTitle', 'whyItMatters', 'timing', 'packingListNote'].every(key => nonempty(step[key])) ||
        typeof step.nonEuOnly !== 'boolean' || (step.nonEuOnly && !nonempty(step.applicabilityNote)) ||
        !Array.isArray(step.packingList) || new Set(step.packingList).size !== step.packingList.length ||
        !step.packingList.every(id => content.documents.some(doc => doc.id === id)) ||
        !nonempty(step.officialSourceUrl) || new URL(step.officialSourceUrl).protocol !== 'https:') throw new Error('invalid-content-step');
  }
  return content;
}

// Reads finish before edits are enabled. Every write joins the same queue.
// A failed read never causes the existing record to be overwritten implicitly.
export function createProgressStore(storage, content) {
  let state = emptyProgress();
  let ready = false;
  let loading = false;
  let error = null;
  let pending = 0;
  let revision = 0;
  let tail = Promise.resolve();
  const listeners = new Set();
  const snapshot = () => ({ state: structuredClone(state), ready, loading, error, saving: pending > 0 });
  const emit = () => listeners.forEach(listener => listener(snapshot()));

  function save() {
    const serialized = JSON.stringify(state);
    const savingRevision = revision;
    pending += 1;
    emit();
    tail = tail.then(async () => {
      try {
        await storage.setItem(STORAGE_KEY, serialized);
        if (savingRevision === revision) error = null;
      } catch {
        error = 'write';
      } finally {
        pending -= 1;
        emit();
      }
    });
    return tail;
  }

  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async hydrate() {
      if (ready || pending || loading) return;
      loading = true;
      emit();
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        try { state = restoreProgress(raw, content); }
        catch { error = 'corrupt'; return; }
        ready = true;
        error = null;
      } catch { error = 'read'; }
      finally { loading = false; emit(); }
    },
    update(change) {
      if (!ready) return false;
      state = restoreProgress(JSON.stringify({ ...state, ...change }), content);
      revision += 1;
      return save();
    },
    retrySave() { if (ready) return save(); return Promise.resolve(); },
    reset() {
      if (loading) return false;
      state = emptyProgress();
      ready = true;
      revision += 1;
      return save();
    },
    settled() { return tail; }
  };
}
