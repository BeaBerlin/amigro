import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addDays, createProgressStore, emptyProgress, formatDate, getChecklistProgress, getPackingProgress, getStatusAnswers, getStatusUpdate, hasCompleteStatus, parseDate, restoreProgress, stepApplies, STATUS_FIELDS, STORAGE_KEY, validateContent } from '../js/model.js';
import { getLegacyStorage } from '../vendor/async-storage/createAsyncStorage.js';

const content = JSON.parse(await readFile(new URL('../data/steps.json', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const legacyIdentityPacking = {
  anmeldung: ['identity'], 'health-insurance': ['identity'], 'bank-account': ['identity'], 'residence-permit': ['identity']
};

test('dates reject impossible values and accept leap days', () => {
  for (const value of ['', '27/10/2026', '2026-02-29', '2026-02-31', '2026-13-01', '2026-00-01', '2026-04-31', '0026-01-01', null]) {
    assert.equal(parseDate(value), null, String(value));
  }
  assert.equal(parseDate('2028-02-29').toISOString(), '2028-02-29T00:00:00.000Z');
});

test('reminders cross months, years and DST as calendar dates', () => {
  assert.equal(addDays('2026-10-27', 14), '2026-11-10');
  assert.equal(addDays('2026-12-24', 14), '2027-01-07');
  assert.equal(addDays('2028-02-20', 14), '2028-03-05');
  assert.equal(addDays('2026-03-22', 14), '2026-04-05');
  assert.equal(addDays('2026-10-18', 14), '2026-11-01');
  assert.equal(addDays('9999-12-31', 14), null);
  assert.equal(addDays('invalid', 14), null);
  assert.equal(formatDate('2026-11-10'), '10 Nov 2026');
});

test('restore deduplicates IDs, drops retired items and rejects incompatible records', () => {
  assert.deepEqual(restoreProgress(null, content), emptyProgress());
  const state = { ...emptyProgress(), moveInDate: '2026-10-27', completedSteps: ['anmeldung', 'anmeldung', 'retired'], packedDocuments: ['identity', 'identity', 'retired'] };
  assert.deepEqual(restoreProgress(JSON.stringify(state), content), { ...state, completedSteps: ['anmeldung'], packedDocuments: ['identity'] });
  for (const raw of ['bad', 'null', '[]', '{}', JSON.stringify({ ...state, version: 2 }), JSON.stringify({ ...state, packedDocuments: [7] }), JSON.stringify({ ...state, moveInDate: '2026-02-30' })]) {
    assert.throws(() => restoreProgress(raw, content));
  }
});

test('legacy progress retains known answers and ticks; missing status remains unanswered', () => {
  const legacy = { version: 1, moveInDate: '2026-10-27', completedSteps: ['anmeldung', 'residence-permit'], packedDocuments: ['identity'] };
  assert.deepEqual(restoreProgress(JSON.stringify(legacy), content), { ...emptyProgress(), ...legacy, packedDocumentsByStep: legacyIdentityPacking });
  for (const answer of [true, false, null]) {
    const restored = restoreProgress(JSON.stringify({ ...legacy, euCitizen: answer }), content);
    assert.deepEqual(getStatusAnswers(restored), { eu: answer, job: null, student: null, family: null });
    assert.equal(hasCompleteStatus(getStatusAnswers(restored)), false);
  }
  for (const field of Object.values(STATUS_FIELDS)) {
    for (const answer of [true, false, null]) assert.equal(restoreProgress(JSON.stringify({ ...legacy, [field]: answer }), content)[field], answer);
    for (const answer of ['true', 'false', 'yes', 0, 1, [], {}]) {
      assert.throws(() => restoreProgress(JSON.stringify({ ...legacy, [field]: answer }), content));
    }
  }
});

test('EU progress excludes the residence step from both numerator and denominator without deleting it', () => {
  const state = { ...emptyProgress(), euCitizen: true, completedSteps: content.steps.map(step => step.id) };
  const eu = getChecklistProgress(content, state);
  assert.equal(eu.total, 5);
  assert.equal(eu.done, 5);
  assert.equal(eu.visibleSteps.some(step => step.id === 'residence-permit'), false);
  assert.deepEqual(state.completedSteps, content.steps.map(step => step.id));
  const nonEu = getChecklistProgress(content, { ...state, euCitizen: false });
  assert.equal(nonEu.total, 6);
  assert.equal(nonEu.done, 6);
  assert.equal(nonEu.visibleSteps.at(-1).id, 'residence-permit');
  assert.equal(getChecklistProgress(content, { ...state, completedSteps: ['residence-permit'] }).done, 0);
});

test('both citizenship answers survive a new store while existing date and ticks remain', async () => {
  for (const answer of [true, false]) {
    let raw = JSON.stringify({ version: 1, moveInDate: '2026-10-27', completedSteps: ['anmeldung'], packedDocuments: ['identity'] });
    const storage = {
      getItem(key) { assert.equal(key, STORAGE_KEY); return raw; },
      setItem(key, value) { assert.equal(key, STORAGE_KEY); raw = value; }
    };
    const store = createProgressStore(storage, content);
    await store.hydrate();
    assert.equal(store.snapshot().state.euCitizen, null);
    await store.update({ euCitizen: answer });
    const reloaded = createProgressStore(storage, content);
    await reloaded.hydrate();
    assert.deepEqual(reloaded.snapshot().state, {
      ...emptyProgress(), euCitizen: answer, moveInDate: '2026-10-27', completedSteps: ['anmeldung'], packedDocuments: ['identity'], packedDocumentsByStep: legacyIdentityPacking
    });
  }
});

test('changing the EU answer preserves hidden step progress and its document ticks', async () => {
  let raw = JSON.stringify({ ...emptyProgress(), euCitizen: false, completedSteps: content.steps.map(step => step.id), packedDocumentsByStep: { 'residence-permit': ['identity'] } });
  const store = createProgressStore({ getItem: () => raw, setItem(key, value) { raw = value; } }, content);
  await store.hydrate();
  await store.update({ euCitizen: true });
  assert.equal(getChecklistProgress(content, store.snapshot().state).done, 5);
  assert.equal(JSON.parse(raw).completedSteps.length, 6);
  await store.update({ euCitizen: false });
  assert.equal(getChecklistProgress(content, store.snapshot().state).done, 6);
  assert.deepEqual(store.snapshot().state.packedDocumentsByStep, { 'residence-permit': ['identity'] });
});

test('explicit reset clears all status answers together with the saved checklist', async () => {
  let raw = JSON.stringify({ ...emptyProgress(), ...getStatusUpdate({ eu: true, job: true, student: false, family: true }), moveInDate: '2026-10-27', completedSteps: ['anmeldung'], packedDocuments: ['identity'], packedDocumentsByStep: { anmeldung: ['identity'] } });
  const store = createProgressStore({ getItem: () => raw, setItem(key, value) { raw = value; } }, content);
  await store.hydrate();
  await store.reset();
  assert.deepEqual(JSON.parse(raw), emptyProgress());
});

test('content validation rejects broken copy, duplicate IDs, unsafe sources and packing references', () => {
  assert.equal(validateContent(content), content);
  const breakContent = [
    value => { value.schemaVersion = 2; },
    value => { value.steps = []; },
    value => { delete value.ui.detail.complete; },
    value => { delete value.ui.detail.packingReminder; },
    value => { delete value.ui.detail.readyBadge; },
    value => { delete value.ui.detail.commonMistakes; },
    value => { value.ui.detail.packingCount = 'Ready'; },
    value => { delete value.ui.onboarding.headline; },
    value => { value.ui.onboarding.questions.pop(); },
    value => { value.ui.onboarding.questions[1].id = 'eu'; },
    value => { value.ui.onboarding.questions[1].id = 'income'; },
    value => { value.ui.onboarding.questions[0].label = ''; },
    value => { value.ui.about.faq = []; },
    value => { delete value.ui.about.faq[0].answer; },
    value => { delete value.ui.checklist.nonEuLabel; },
    value => { delete value.ui.checklist.pathView; },
    value => { value.ui.checklist.viewLabel = ''; },
    value => { value.ui.progress.count = 'All done'; },
    value => { value.documents.push(value.documents[0]); },
    value => { value.steps.push(value.steps[0]); },
    value => { value.steps[0].shortTitle = ''; },
    value => { value.steps[0].packingList.push('missing-document'); },
    value => { value.steps[0].packingList.push(value.steps[0].packingList[0]); },
    value => { value.steps[0].officialSourceUrl = 'javascript:alert(1)'; },
    value => { value.steps[0].nonEuOnly = 'false'; },
    value => { delete value.steps.at(-1).applicabilityNote; }
  ];
  for (const mutate of breakContent) {
    const broken = structuredClone(content);
    mutate(broken);
    assert.throws(() => validateContent(broken));
  }
});

test('legacy shared ticks migrate once; clearing a per-step tick never restores it from the legacy array', async () => {
  const legacy = { version: 1, euCitizen: false, moveInDate: '', completedSteps: ['anmeldung'], packedDocuments: ['identity'] };
  let raw = JSON.stringify(legacy);
  let writes = 0;
  const storage = { getItem: async () => raw, setItem: async (key, value) => { writes += 1; raw = value; } };
  const store = createProgressStore(storage, content);
  await store.hydrate();
  assert.equal(writes, 0);
  assert.deepEqual(store.snapshot().state.packedDocumentsByStep, legacyIdentityPacking);
  await store.update({ packedDocumentsByStep: { ...store.snapshot().state.packedDocumentsByStep, anmeldung: [] } });
  const reloaded = createProgressStore(storage, content);
  await reloaded.hydrate();
  assert.equal(reloaded.snapshot().state.packedDocumentsByStep.anmeldung, undefined);
  assert.deepEqual(reloaded.snapshot().state.packedDocumentsByStep['health-insurance'], ['identity']);
  assert.deepEqual(reloaded.snapshot().state.completedSteps, legacy.completedSteps);
  await reloaded.update({ packedDocumentsByStep: {} });
  assert.deepEqual(restoreProgress(raw, content).packedDocumentsByStep, {});
  assert.deepEqual(JSON.parse(raw).packedDocuments, ['identity']);
});

test('packing readiness persists independently per step and does not complete a step or empty list', async () => {
  let raw = null;
  const storage = { getItem: async () => raw, setItem: async (key, value) => { raw = value; } };
  const store = createProgressStore(storage, content);
  await store.hydrate();
  const address = content.steps.find(step => step.id === 'anmeldung');
  const insurance = content.steps.find(step => step.id === 'health-insurance');
  const tax = content.steps.find(step => step.id === 'tax-id');
  await store.update({ packedDocumentsByStep: { anmeldung: ['identity'] } });
  assert.deepEqual(getPackingProgress(address, store.snapshot().state), { done: 1, total: 5, ready: false });
  assert.deepEqual(getPackingProgress(insurance, store.snapshot().state), { done: 0, total: 4, ready: false });
  await store.update({ packedDocumentsByStep: { anmeldung: [...address.packingList], 'health-insurance': ['identity'] } });
  const reloaded = createProgressStore(storage, content);
  await reloaded.hydrate();
  assert.deepEqual(getPackingProgress(address, reloaded.snapshot().state), { done: 5, total: 5, ready: true });
  assert.deepEqual(getPackingProgress(insurance, reloaded.snapshot().state), { done: 1, total: 4, ready: false });
  assert.deepEqual(getPackingProgress(tax, reloaded.snapshot().state), { done: 0, total: 0, ready: false });
  assert.deepEqual(reloaded.snapshot().state.completedSteps, []);
  await reloaded.update({ packedDocumentsByStep: { ...reloaded.snapshot().state.packedDocumentsByStep, anmeldung: ['identity'] } });
  assert.equal(getPackingProgress(address, reloaded.snapshot().state).ready, false);
});

test('per-step restore removes stale or misplaced IDs and rejects malformed maps without overwriting data', async () => {
  const state = { ...emptyProgress(), packedDocumentsByStep: {
    anmeldung: ['identity', 'identity', 'retired-document', 'home-details'],
    'tax-id': ['identity'], retired: ['identity']
  } };
  assert.deepEqual(restoreProgress(JSON.stringify(state), content).packedDocumentsByStep, { anmeldung: ['identity'] });
  for (const map of [null, [], 'bad', { anmeldung: null }, { anmeldung: 'identity' }, { anmeldung: [42] }]) {
    const saved = JSON.stringify({ ...emptyProgress(), packedDocumentsByStep: map });
    assert.throws(() => restoreProgress(saved, content));
    let writes = 0;
    const store = createProgressStore({ getItem: async () => saved, setItem: async () => { writes += 1; } }, content);
    await store.hydrate();
    assert.equal(store.snapshot().error, 'corrupt');
    assert.equal(store.update({ packedDocumentsByStep: {} }), false);
    assert.equal(writes, 0);
  }
});

test('common mistakes are optional string arrays; all shipped arrays are empty', () => {
  for (const step of content.steps) assert.deepEqual(step.common_mistakes, []);
  for (const value of [undefined, [], ['TO VERIFY: Team draft']]) {
    const custom = structuredClone(content);
    custom.steps[0].common_mistakes = value;
    assert.equal(validateContent(custom), custom);
  }
  for (const value of [null, {}, 'draft', [1], [''], ['  ']]) {
    const broken = structuredClone(content);
    broken.steps[0].common_mistakes = value;
    assert.throws(() => validateContent(broken));
  }
});

test('all sixteen complete profiles keep the first five steps; only non-EU profiles see residence', () => {
  for (let bits = 0; bits < 16; bits += 1) {
    const answers = Object.fromEntries(Object.keys(STATUS_FIELDS).map((key, index) => [key, Boolean(bits & (1 << index))]));
    assert.equal(hasCompleteStatus(answers), true);
    const state = { ...emptyProgress(), ...getStatusUpdate(answers), completedSteps: content.steps.map(step => step.id) };
    assert.deepEqual(getStatusAnswers(state), answers);
    const progress = getChecklistProgress(content, state);
    assert.deepEqual(progress.visibleSteps.map(step => step.id), content.steps.filter(step => !answers.eu || step.id !== 'residence-permit').map(step => step.id));
    assert.equal(progress.total, answers.eu ? 5 : 6);
    assert.equal(progress.done, progress.total);
  }
  for (const step of content.steps) assert.equal(step.applies_if._review, 'TO VERIFY');
});

test('optional rules retain legacy behaviour; conditions combine and unknown answers do not hide steps', () => {
  const state = { ...emptyProgress(), ...getStatusUpdate({ eu: false, job: true, student: false, family: true }) };
  assert.equal(stepApplies({ nonEuOnly: true }, { ...state, euCitizen: true }), false);
  assert.equal(stepApplies({ nonEuOnly: true }, state), true);
  assert.equal(stepApplies({ nonEuOnly: false }, { ...state, euCitizen: true }), true);
  assert.equal(stepApplies({ applies_if: {} }, state), true);
  const conditional = { applies_if: { job: true, student: false, family: true, _review: 'TO VERIFY' } };
  assert.equal(stepApplies(conditional, state), true);
  for (const field of ['jobContract', 'student', 'bringingFamily']) {
    assert.equal(stepApplies(conditional, { ...state, [field]: !state[field] }), false);
  }
  assert.equal(stepApplies(conditional, emptyProgress()), true);
  const custom = structuredClone(content);
  custom.steps[0].applies_if = conditional.applies_if;
  assert.equal(validateContent(custom), custom);
  assert.equal(getChecklistProgress(custom, { ...state, student: true }).visibleSteps.some(step => step.id === custom.steps[0].id), false);
});

test('rule validation rejects malformed or unknown conditions while allowing omitted and empty rules', () => {
  for (const rule of [null, [], 'TO VERIFY', { eu: 'false' }, { job: null }, { income: true }, { _review: 'reviewed' }]) {
    const broken = structuredClone(content);
    broken.steps[0].applies_if = rule;
    assert.throws(() => validateContent(broken));
  }
  for (const rule of [undefined, {}, { family: false }]) {
    const valid = structuredClone(content);
    valid.steps[0].applies_if = rule;
    assert.equal(validateContent(valid), valid);
  }
});

test('the four answers save together and survive reload and later edits without losing hidden progress', async () => {
  const original = { version: 1, euCitizen: false, moveInDate: '2026-10-27', completedSteps: ['residence-permit'], packedDocuments: ['identity'] };
  let raw = JSON.stringify(original);
  const writes = [];
  const storage = { getItem: async () => raw, setItem: async (key, value) => { writes.push(value); raw = value; } };
  const store = createProgressStore(storage, content);
  await store.hydrate();
  assert.equal(writes.length, 0);
  assert.equal(hasCompleteStatus(getStatusAnswers(store.snapshot().state)), false);
  const answers = { eu: true, job: false, student: true, family: false };
  await store.update(getStatusUpdate(answers));
  assert.equal(writes.length, 1);
  const reloaded = createProgressStore(storage, content);
  await reloaded.hydrate();
  assert.deepEqual(getStatusAnswers(reloaded.snapshot().state), answers);
  assert.equal(hasCompleteStatus(getStatusAnswers(reloaded.snapshot().state)), true);
  assert.equal(getChecklistProgress(content, reloaded.snapshot().state).done, 0);
  await reloaded.update(getStatusUpdate({ ...answers, eu: false, family: true }));
  const edited = restoreProgress(raw, content);
  assert.equal(getChecklistProgress(content, edited).done, 1);
  assert.equal(edited.moveInDate, original.moveInDate);
  assert.deepEqual(edited.completedSteps, original.completedSteps);
  assert.deepEqual(edited.packedDocuments, original.packedDocuments);
});

test('the actual AsyncStorage web adapter reuses the old browser record and exposes failures to recovery', async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  });
  const original = { version: 1, euCitizen: false, moveInDate: '', completedSteps: ['tax-id'], packedDocuments: ['identity'] };
  const records = new Map([[STORAGE_KEY, JSON.stringify(original)]]);
  let blockRead = true;
  let blockWrite = false;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem(key) { if (blockRead) throw new Error('blocked'); return records.get(key) ?? null; },
    setItem(key, value) { if (blockWrite) throw new Error('quota'); records.set(key, value); }
  } } });
  const store = createProgressStore(getLegacyStorage(), content);
  await store.hydrate();
  assert.equal(store.snapshot().error, 'read');
  assert.equal(store.update(getStatusUpdate({ eu: true, job: true, student: false, family: false })), false);
  assert.deepEqual(JSON.parse(records.get(STORAGE_KEY)), original);
  blockRead = false;
  await store.hydrate();
  assert.deepEqual(store.snapshot().state.completedSteps, original.completedSteps);
  blockWrite = true;
  const answers = { eu: true, job: true, student: false, family: false };
  await store.update(getStatusUpdate(answers));
  assert.equal(store.snapshot().error, 'write');
  assert.deepEqual(JSON.parse(records.get(STORAGE_KEY)), original);
  blockWrite = false;
  await store.retrySave();
  assert.equal(store.snapshot().error, null);
  const reloaded = createProgressStore(getLegacyStorage(), content);
  await reloaded.hydrate();
  assert.deepEqual(getStatusAnswers(reloaded.snapshot().state), answers);
  assert.deepEqual(reloaded.snapshot().state.packedDocuments, original.packedDocuments);
});

test('edits remain blocked until the saved record has loaded', async () => {
  let finishRead;
  const writes = [];
  const store = createProgressStore({ getItem: () => new Promise(resolve => { finishRead = resolve; }), setItem: (key, value) => writes.push(value) }, content);
  const loading = store.hydrate();
  assert.equal(store.snapshot().loading, true);
  assert.equal(store.reset(), false);
  assert.equal(store.update({ completedSteps: ['anmeldung'] }), false);
  finishRead(JSON.stringify({ ...emptyProgress(), completedSteps: ['tax-id'] }));
  await loading;
  assert.equal(store.snapshot().ready, true);
  assert.equal(store.snapshot().loading, false);
  assert.deepEqual(store.snapshot().state.completedSteps, ['tax-id']);
  assert.equal(writes.length, 0);
});

test('failed and corrupt reads preserve saved data until an explicit reset', async () => {
  for (const mode of ['read', 'corrupt']) {
    const writes = [];
    const storage = { getItem() { if (mode === 'read') throw new Error('blocked'); return 'broken'; }, setItem: (key, value) => writes.push(value) };
    const store = createProgressStore(storage, content);
    await store.hydrate();
    assert.equal(store.snapshot().error, mode);
    assert.equal(store.update({ moveInDate: '2026-10-27' }), false);
    assert.equal(writes.length, 0);
    await store.reset();
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0]), emptyProgress());
  }
});

test('retrying a failed read restores existing progress without writing it', async () => {
  let fail = true;
  let writes = 0;
  const store = createProgressStore({ getItem() {
    if (fail) throw new Error('temporarily unavailable');
    return JSON.stringify({ ...emptyProgress(), completedSteps: ['anmeldung'] });
  }, setItem() { writes += 1; } }, content);
  await store.hydrate();
  assert.equal(store.snapshot().ready, false);
  fail = false;
  await store.hydrate();
  assert.equal(store.snapshot().ready, true);
  assert.equal(store.snapshot().error, null);
  assert.deepEqual(store.snapshot().state.completedSteps, ['anmeldung']);
  assert.equal(writes, 0);
});

test('writes run in order even when the first write is slow', async () => {
  let release;
  const writes = [];
  const store = createProgressStore({ getItem: () => null, setItem: async (key, value) => {
    assert.equal(key, STORAGE_KEY);
    if (!writes.length) { writes.push(value); await new Promise(resolve => { release = resolve; }); }
    else writes.push(value);
  } }, content);
  await store.hydrate();
  store.update({ completedSteps: ['anmeldung'] });
  store.update({ completedSteps: ['anmeldung', 'tax-id'] });
  await tick();
  assert.equal(writes.length, 1);
  release();
  await store.settled();
  assert.equal(writes.length, 2);
  assert.deepEqual(JSON.parse(writes[1]).completedSteps, ['anmeldung', 'tax-id']);
  assert.equal(store.snapshot().saving, false);
});

test('a failed write stays visible during retry and clears only after a successful save', async () => {
  let fail = true;
  let persisted;
  const store = createProgressStore({ getItem: () => null, setItem(key, value) { if (fail) throw new Error('quota'); persisted = value; } }, content);
  await store.hydrate();
  await store.update({ packedDocumentsByStep: { anmeldung: ['identity'] } });
  assert.equal(store.snapshot().error, 'write');
  assert.deepEqual(store.snapshot().state.packedDocumentsByStep, { anmeldung: ['identity'] });
  fail = false;
  const retry = store.retrySave();
  assert.equal(store.snapshot().error, 'write');
  await retry;
  assert.equal(store.snapshot().error, null);
  assert.deepEqual(JSON.parse(persisted).packedDocumentsByStep, { anmeldung: ['identity'] });
});

test('content has unique stable IDs, valid packing references and official HTTPS sources', () => {
  assert.equal(content.schemaVersion, 1);
  assert.equal(new Set(content.steps.map(step => step.id)).size, content.steps.length);
  assert.equal(new Set(content.documents.map(doc => doc.id)).size, content.documents.length);
  const officialHosts = new Set(['service.berlin.de', 'www.berlin.de', 'online.portal.bzst.de', 'www.make-it-in-germany.com', 'www.rundfunkbeitrag.de']);
  for (const step of content.steps) {
    for (const key of ['title', 'shortTitle', 'germanName', 'whyItMatters', 'timing', 'timingShort', 'packingListNote', 'sourceName']) assert.equal(typeof step[key], 'string', `${step.id}.${key}`);
    assert.ok(step.instructions.length > 0);
    for (const id of step.packingList) assert.ok(content.documents.some(doc => doc.id === id), `${step.id}: ${id}`);
    const source = new URL(step.officialSourceUrl);
    assert.equal(source.protocol, 'https:');
    assert.ok(officialHosts.has(source.hostname));
    assert.ok(parseDate(step.sourceReviewedOn));
    if (step.deadline) { assert.equal(step.deadline.anchor, 'moveInDate'); assert.ok(Number.isInteger(step.deadline.days)); }
    if (step.nonEuOnly) assert.ok(step.applicabilityNote.includes('TO VERIFY'));
  }
  assert.ok(content.ui.deadline.note.includes('TO VERIFY'));
});
