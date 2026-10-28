import { createProgressStore, getChecklistProgress, validateContent } from './js/model.js';

const root = document.querySelector('#app');
const contentUrl = new URL('./data/steps.json', import.meta.url);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

async function loadChecklist() {
  root.setAttribute('aria-busy', 'true');
  let content;
  try {
    const response = await fetch(contentUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    content = await response.json();
    showChecklist(validateContent(content));
  } catch {
    // If the sole source of UI copy cannot load, expose the resource and a
    // retry icon. No second copy of the guide or error text lives in the UI.
    const link = element('a', 'resource-link', contentUrl.pathname);
    link.href = contentUrl.href;
    const retry = element('button', 'retry-resource');
    retry.type = 'button';
    const fallback = content?.ui?.bootstrap;
    const retryCopy = typeof fallback?.retry === 'string' ? fallback.retry : contentUrl.pathname;
    retry.setAttribute('aria-label', retryCopy);
    retry.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/></svg>';
    retry.addEventListener('click', loadChecklist);
    const error = element('div', 'storage-error');
    error.setAttribute('role', 'alert');
    if (typeof fallback?.error === 'string') error.append(element('p', null, fallback.error));
    error.append(link, retry);
    root.replaceChildren(error);
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

function showChecklist(content) {
  const { ui, steps, documents } = content;
  const store = createProgressStore({
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value)
  }, content);

  document.title = ui.pageTitle;
  document.querySelector('meta[name="description"]').content = ui.checklist.description;

  const header = element('header', 'app-header');
  const brand = element('div', 'brand');
  const mark = element('img', 'brand-mark');
  mark.src = './assets/mark.svg';
  mark.alt = '';
  mark.width = 38;
  mark.height = 38;
  brand.append(mark, element('h1', null, ui.brand));
  header.append(brand, element('p', 'subline', ui.checklist.subline));

  const welcome = element('section', 'welcome-view');
  welcome.hidden = true;
  const welcomeIntro = element('p', 'welcome-intro', ui.onboarding.intro);
  welcome.append(welcomeIntro);
  const welcomeForm = element('form', 'welcome-form');
  const citizenship = element('fieldset', 'citizenship-question');
  citizenship.disabled = true;
  const question = element('legend', null, ui.onboarding.question);
  question.tabIndex = -1;
  citizenship.append(question);
  const answers = element('div', 'citizenship-options');
  const startButton = element('button', 'start-button', ui.onboarding.start);
  startButton.type = 'submit';
  startButton.disabled = true;
  const cancelAnswer = element('button', 'secondary-button', ui.onboarding.cancel);
  cancelAnswer.type = 'button';
  cancelAnswer.hidden = true;
  cancelAnswer.addEventListener('click', () => {
    editingAnswer = false;
    update(store.snapshot());
    changeAnswer.focus({ preventScroll: true });
    window.scrollTo({ top: overviewScroll, behavior: 'instant' });
  });
  let selectedAnswer = null;
  const answerInputs = new Map();
  for (const [value, label] of [[true, ui.onboarding.yes], [false, ui.onboarding.no]]) {
    const option = element('label', 'citizenship-option');
    const input = element('input');
    input.type = 'radio';
    input.name = 'eu-citizen';
    input.value = String(value);
    input.required = true;
    input.addEventListener('change', () => {
      selectedAnswer = value;
      update(store.snapshot());
    });
    option.append(input, element('span', null, label));
    answers.append(option);
    answerInputs.set(value, input);
  }
  citizenship.append(answers);
  welcomeForm.append(citizenship, startButton, cancelAnswer);
  welcome.append(welcomeForm);
  welcomeForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!store.snapshot().ready || selectedAnswer === null) return;
    editingAnswer = false;
    activeView = 'overview';
    store.update({ euCitizen: selectedAnswer });
    progressHeading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  const list = element('ol', 'checklist');
  list.setAttribute('aria-label', ui.checklist.label);
  const overview = element('div', 'overview-view');
  overview.id = 'overview';
  overview.hidden = true;
  const progress = element('section', 'progress-card');
  progress.hidden = true;
  const progressHeading = element('h2', 'progress-heading', ui.progress.label);
  progressHeading.tabIndex = -1;
  const progressCount = element('p', 'progress-count');
  progressCount.id = 'progress-count';
  progressCount.setAttribute('role', 'status');
  const progressBar = element('progress', 'progress-bar');
  progressBar.max = steps.length || 1;
  progressBar.value = 0;
  progressBar.setAttribute('aria-labelledby', 'progress-count');
  progress.append(progressHeading, progressCount, progressBar);
  overview.append(progress, element('p', 'overview-hint', ui.checklist.hint), list);
  const changeAnswer = element('button', 'change-answer', ui.onboarding.change);
  changeAnswer.type = 'button';
  changeAnswer.addEventListener('click', () => {
    const snapshot = store.snapshot();
    if (!canUseChecklist(snapshot)) return;
    overviewScroll = window.scrollY;
    editingAnswer = true;
    selectedAnswer = snapshot.state.euCitizen;
    for (const [answer, input] of answerInputs) input.checked = answer === selectedAnswer;
    update(snapshot);
    question.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  overview.append(changeAnswer);
  const detail = element('section', 'detail-view');
  detail.id = 'step-detail';
  detail.hidden = true;
  detail.setAttribute('aria-labelledby', 'detail-title');
  const inputs = new Map();
  const documentInputs = new Map();
  let overviewScroll = 0;
  let lastStepButton = null;
  let activeStepId = null;
  let detailDoneButton = null;
  let detailDoneStatus = null;
  let activeView = 'overview';
  let editingAnswer = false;

  function canUseChecklist(snapshot) {
    return snapshot.ready && typeof snapshot.state.euCitizen === 'boolean' && !editingAnswer;
  }

  // Both views edit the same record, through the existing ordered save queue.
  function setStepDone(id, done) {
    const snapshot = store.snapshot();
    if (!canUseChecklist(snapshot) || !getChecklistProgress(content, snapshot.state).visibleSteps.some(step => step.id === id)) return false;
    const completedSteps = new Set(snapshot.state.completedSteps);
    if (done) completedSteps.add(id);
    else completedSteps.delete(id);
    return store.update({ completedSteps: [...completedSteps] });
  }

  function showOverview() {
    activeView = 'overview';
    update(store.snapshot());
    lastStepButton?.focus({ preventScroll: true });
    window.scrollTo({ top: overviewScroll, behavior: 'instant' });
  }

  function showDetail(step, trigger) {
    const snapshot = store.snapshot();
    if (!canUseChecklist(snapshot) || (snapshot.state.euCitizen && step.nonEuOnly)) return;
    activeView = 'detail';
    overviewScroll = window.scrollY;
    lastStepButton = trigger;
    activeStepId = step.id;
    documentInputs.clear();

    const back = element('button', 'back-button');
    back.type = 'button';
    back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M19 12H5m5-5-5 5 5 5"/></svg>';
    back.append(document.createTextNode(ui.detail.back));
    back.addEventListener('click', showOverview);
    const title = element('h2', 'detail-title', step.title);
    title.id = 'detail-title';
    title.tabIndex = -1;
    detail.replaceChildren(back, title);

    const completion = element('div', 'detail-completion');
    detailDoneStatus = element('p', 'completion-status');
    detailDoneStatus.setAttribute('role', 'status');
    detailDoneButton = element('button', 'done-button', ui.detail.complete);
    detailDoneButton.type = 'button';
    detailDoneButton.disabled = true;
    detailDoneButton.addEventListener('click', () => {
      setStepDone(step.id, !store.snapshot().state.completedSteps.includes(step.id));
    });
    completion.append(detailDoneStatus, detailDoneButton);
    detail.append(completion);

    if (step.nonEuOnly) detail.append(element('p', 'applicability-note', step.applicabilityNote));

    for (const [label, value] of [[ui.detail.why, step.whyItMatters], [ui.detail.when, step.timing]]) {
      const section = element('section', 'detail-section');
      section.append(element('h3', null, label), element('p', null, value));
      detail.append(section);
    }

    const packing = element('section', 'detail-section');
    packing.append(element('h3', null, ui.detail.packing));
    if (step.packingList.length) {
      packing.append(element('p', 'packing-help', ui.detail.packingHelp));
      const packingList = element('ul', 'document-list');
      for (const id of step.packingList) {
        const doc = documents.find(item => item.id === id);
        const row = element('li');
        const label = element('label', 'document-label');
        const input = element('input', 'document-checkbox');
        input.type = 'checkbox';
        input.disabled = true;
        input.dataset.documentId = id;
        const text = element('span');
        text.append(element('span', 'document-title', doc.label));
        if (doc.note) text.append(element('span', 'document-note', doc.note));
        label.append(input, text);
        row.append(label);
        packingList.append(row);
        documentInputs.set(id, input);

        input.addEventListener('change', () => {
          const snapshot = store.snapshot();
          if (!canUseChecklist(snapshot)) {
            input.checked = snapshot.state.packedDocuments.includes(id);
            return;
          }
          const packedDocuments = new Set(snapshot.state.packedDocuments);
          if (input.checked) packedDocuments.add(id);
          else packedDocuments.delete(id);
          store.update({ packedDocuments: [...packedDocuments] });
        });
      }
      packing.append(packingList);
    } else {
      packing.append(element('p', null, ui.detail.noDocuments));
    }
    if (step.packingListNote) packing.append(element('p', 'packing-note', step.packingListNote));
    detail.append(packing);

    const source = element('a', 'source-link', ui.detail.source);
    source.href = step.officialSourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    detail.append(source, element('p', 'source-note', ui.detail.sourceNote));

    update(store.snapshot());
    title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  for (const [index, step] of steps.entries()) {
    const row = element('li', 'step-row');
    const open = element('button', 'step-open');
    open.type = 'button';
    open.setAttribute('aria-controls', 'step-detail');
    open.addEventListener('click', () => showDetail(step, open));
    const number = element('span', 'step-number', String(index + 1).padStart(2, '0'));
    number.setAttribute('aria-hidden', 'true');
    const title = element('span', 'step-title', step.title);
    const text = element('span', 'step-copy');
    text.append(title);
    if (step.nonEuOnly) text.append(element('span', 'step-note', ui.checklist.nonEuLabel));
    const doneBadge = element('span', 'done-badge', ui.checklist.doneLabel);
    doneBadge.hidden = true;
    text.append(doneBadge);
    const input = element('input', 'step-checkbox');
    input.type = 'checkbox';
    input.disabled = true;
    input.dataset.stepId = step.id;
    input.setAttribute('aria-label', fillTemplate(ui.checklist.completeLabel, { title: step.title }));
    const completeControl = element('label', 'complete-control');
    completeControl.append(input);
    open.append(number, text);
    row.append(open, completeControl);
    list.append(row);
    inputs.set(step.id, { input, row, doneBadge, number });

    input.addEventListener('change', () => {
      if (setStepDone(step.id, input.checked) === false) {
        input.checked = store.snapshot().state.completedSteps.includes(step.id);
      }
    });
  }

  const errorBox = element('section', 'storage-error');
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;
  const errorText = element('p');
  const retryButton = element('button', 'retry-button');
  retryButton.type = 'button';
  retryButton.addEventListener('click', () => {
    if (store.snapshot().ready) store.retrySave();
    else store.hydrate();
  });
  errorBox.append(errorText, retryButton);
  const resetButton = element('button', 'secondary-button', ui.storage.reset);
  resetButton.type = 'button';
  resetButton.hidden = true;
  errorBox.append(resetButton);

  const resetDialog = element('dialog', 'reset-dialog');
  resetDialog.setAttribute('aria-labelledby', 'reset-title');
  resetDialog.setAttribute('aria-describedby', 'reset-note');
  const resetTitle = element('h2', null, ui.storage.resetTitle);
  resetTitle.id = 'reset-title';
  const resetNote = element('p', null, ui.storage.resetNote);
  resetNote.id = 'reset-note';
  const cancelReset = element('button', 'secondary-button', ui.storage.resetCancel);
  cancelReset.type = 'button';
  cancelReset.autofocus = true;
  cancelReset.addEventListener('click', () => resetDialog.close());
  const confirmReset = element('button', 'reset-confirm', ui.storage.resetConfirm);
  confirmReset.type = 'button';
  confirmReset.addEventListener('click', () => {
    if (store.snapshot().loading || store.snapshot().saving) return;
    resetDialog.close();
    editingAnswer = false;
    activeView = 'overview';
    selectedAnswer = null;
    for (const input of answerInputs.values()) input.checked = false;
    store.reset();
    question.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  resetDialog.append(resetTitle, resetNote, cancelReset, confirmReset);
  resetButton.addEventListener('click', () => {
    if (!store.snapshot().loading && !store.snapshot().saving) resetDialog.showModal();
  });

  const status = element('p', 'save-status');
  status.setAttribute('role', 'status');
  root.replaceChildren(header, errorBox, welcome, overview, detail, status, resetDialog);

  // Updating existing inputs keeps keyboard focus and native checkbox behaviour.
  function update(snapshot) {
    const ready = canUseChecklist(snapshot);
    const { visibleSteps, done, total } = getChecklistProgress(content, snapshot.state);
    const visibleIds = new Set(visibleSteps.map(step => step.id));
    welcome.hidden = !snapshot.ready || ready;
    welcomeIntro.hidden = editingAnswer;
    cancelAnswer.hidden = !editingAnswer;
    startButton.textContent = editingAnswer ? ui.onboarding.save : ui.onboarding.start;
    citizenship.disabled = !snapshot.ready || ready;
    startButton.disabled = !snapshot.ready || ready || selectedAnswer === null;
    overview.hidden = !ready || activeView !== 'overview';
    detail.hidden = !ready || activeView !== 'detail';
    changeAnswer.disabled = !ready;
    let stepNumber = 0;
    for (const [id, { input, row, doneBadge, number }] of inputs) {
      row.hidden = !visibleIds.has(id);
      if (!row.hidden) number.textContent = String(++stepNumber).padStart(2, '0');
      input.checked = snapshot.state.completedSteps.includes(id);
      input.disabled = !ready || row.hidden;
      row.classList.toggle('is-complete', input.checked);
      doneBadge.hidden = !input.checked;
    }
    progress.hidden = !ready;
    if (ready) {
      const count = fillTemplate(ui.progress.count, { done, total });
      if (progressCount.textContent !== count) progressCount.textContent = count;
      progressBar.max = total || 1;
      progressBar.value = done;
    }
    if (detailDoneButton) {
      const done = snapshot.state.completedSteps.includes(activeStepId);
      detailDoneButton.disabled = !ready;
      detailDoneButton.textContent = done ? ui.detail.undo : ui.detail.complete;
      detailDoneButton.classList.toggle('is-done', done);
      detailDoneStatus.hidden = !ready;
      const statusText = done ? ui.detail.done : ui.detail.notDone;
      if (detailDoneStatus.textContent !== statusText) detailDoneStatus.textContent = statusText;
    }
    for (const [id, input] of documentInputs) {
      input.checked = snapshot.state.packedDocuments.includes(id);
      input.disabled = !ready;
    }
    errorBox.hidden = !snapshot.error;
    resetButton.hidden = !snapshot.error || snapshot.ready;
    resetButton.disabled = snapshot.loading || snapshot.saving;
    confirmReset.disabled = snapshot.loading || snapshot.saving;
    status.hidden = Boolean(snapshot.error) || (snapshot.ready && !ready);
    if (snapshot.error) {
      const message = ui.storage[snapshot.error];
      if (errorText.textContent !== message) errorText.textContent = message;
      retryButton.textContent = snapshot.ready ? ui.storage.retrySave : ui.storage.retryLoad;
      retryButton.disabled = snapshot.loading || snapshot.saving;
    } else {
      const message = !snapshot.ready ? ui.storage.loading : snapshot.saving ? ui.storage.saving : ui.storage.saved;
      if (status.textContent !== message) status.textContent = message;
    }
  }

  store.subscribe(update);
  update(store.snapshot());
  store.hydrate();
}

loadChecklist();
