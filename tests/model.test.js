import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addDays, createProgressStore, emptyProgress, formatDate, getChecklistProgress, parseDate, restoreProgress, STORAGE_KEY, validateContent } from '../js/model.js';

const content = JSON.parse(await readFile(new URL('../data/steps.json', import.meta.url), 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

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

test('legacy progress needs an answer without losing ticks; only boolean or null answers are accepted', () => {
  const legacy = { version: 1, moveInDate: '2026-10-27', completedSteps: ['anmeldung', 'residence-permit'], packedDocuments: ['identity'] };
  assert.deepEqual(restoreProgress(JSON.stringify(legacy), content), { ...legacy, euCitizen: null });
  for (const answer of [true, false, null]) {
    assert.equal(restoreProgress(JSON.stringify({ ...legacy, euCitizen: answer }), content).euCitizen, answer);
  }
  for (const answer of ['true', 'false', 'yes', 0, 1, [], {}]) {
    assert.throws(() => restoreProgress(JSON.stringify({ ...legacy, euCitizen: answer }), content));
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
      version: 1, euCitizen: answer, moveInDate: '2026-10-27', completedSteps: ['anmeldung'], packedDocuments: ['identity']
    });
  }
});

test('changing the EU answer preserves hidden step progress and shared documents', async () => {
  let raw = JSON.stringify({ ...emptyProgress(), euCitizen: false, completedSteps: content.steps.map(step => step.id), packedDocuments: ['identity'] });
  const store = createProgressStore({ getItem: () => raw, setItem(key, value) { raw = value; } }, content);
  await store.hydrate();
  await store.update({ euCitizen: true });
  assert.equal(getChecklistProgress(content, store.snapshot().state).done, 5);
  assert.equal(JSON.parse(raw).completedSteps.length, 6);
  await store.update({ euCitizen: false });
  assert.equal(getChecklistProgress(content, store.snapshot().state).done, 6);
  assert.deepEqual(store.snapshot().state.packedDocuments, ['identity']);
});

test('explicit reset clears the onboarding answer together with the saved checklist', async () => {
  let raw = JSON.stringify({ ...emptyProgress(), euCitizen: true, moveInDate: '2026-10-27', completedSteps: ['anmeldung'], packedDocuments: ['identity'] });
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
    value => { delete value.ui.checklist.nonEuLabel; },
    value => { value.ui.progress.count = 'All done'; },
    value => { value.documents.push(value.documents[0]); },
    value => { value.steps.push(value.steps[0]); },
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
  await store.update({ packedDocuments: ['identity'] });
  assert.equal(store.snapshot().error, 'write');
  assert.deepEqual(store.snapshot().state.packedDocuments, ['identity']);
  fail = false;
  const retry = store.retrySave();
  assert.equal(store.snapshot().error, 'write');
  await retry;
  assert.equal(store.snapshot().error, null);
  assert.deepEqual(JSON.parse(persisted).packedDocuments, ['identity']);
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
