import { createProgressStore, getChecklistProgress, getPackingProgress, getStatusAnswers, getStatusUpdate, hasCompleteStatus, validateContent } from './js/model.js';
import { getLegacyStorage } from './vendor/async-storage/createAsyncStorage.js';

const AsyncStorage = getLegacyStorage();

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
  const store = createProgressStore(AsyncStorage, content);

  document.title = ui.pageTitle;
  document.querySelector('meta[name="description"]').content = ui.checklist.description;

  const header = element('header', 'app-header');
  const headerRow = element('div', 'header-row');
  const brand = element('div', 'brand');
  const brandTitle = element('h1', 'brand-title');
  const logo = element('img', 'brand-logo');
  logo.src = './assets/brand/amigro-logo.png';
  logo.alt = ui.brand;
  logo.height = 32;
  brandTitle.append(logo);
  brand.append(brandTitle);
  const aboutButton = element('button', 'about-link', ui.about.label);
  aboutButton.type = 'button';
  aboutButton.hidden = true;
  aboutButton.setAttribute('aria-controls', 'about-view');
  aboutButton.addEventListener('click', () => {
    if (!canUseChecklist(store.snapshot()) || activeView !== 'overview') return;
    overviewScroll = window.scrollY;
    activeView = 'about';
    update(store.snapshot());
    aboutTitle.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  const headerSubline = element('p', 'subline', ui.checklist.subline);
  headerRow.append(brand, aboutButton);
  header.append(headerRow, headerSubline);

  const welcome = element('section', 'welcome-view');
  welcome.hidden = true;
  const welcomeCopy = element('div', 'welcome-copy');
  welcomeCopy.append(
    element('h2', 'welcome-headline', ui.onboarding.headline),
    element('p', 'welcome-subline', ui.onboarding.subline),
    element('p', 'welcome-intro', ui.onboarding.intro)
  );
  welcome.append(welcomeCopy);
  const welcomeForm = element('form', 'welcome-form');
  let draftAnswers = getStatusAnswers({});
  let draftInitialized = false;
  const answerInputs = new Map();
  const questionGroups = [];
  for (const question of ui.onboarding.questions) {
    const fieldset = element('fieldset', 'status-question');
    fieldset.disabled = true;
    const legend = element('legend', null, question.label);
    legend.tabIndex = -1;
    fieldset.append(legend);
    const answers = element('div', 'status-options');
    const inputs = new Map();
    for (const [value, label] of [[true, ui.onboarding.yes], [false, ui.onboarding.no]]) {
      const option = element('label', 'status-option');
      const input = element('input');
      input.type = 'radio';
      input.name = `status-${question.id}`;
      input.value = String(value);
      input.required = true;
      input.addEventListener('change', () => {
        draftAnswers[question.id] = value;
        update(store.snapshot());
      });
      option.append(input, element('span', null, label));
      answers.append(option);
      inputs.set(value, input);
    }
    answerInputs.set(question.id, inputs);
    fieldset.append(answers);
    questionGroups.push(fieldset);
    welcomeForm.append(fieldset);
  }
  const firstQuestion = questionGroups[0].querySelector('legend');
  const startButton = element('button', 'start-button', ui.onboarding.start);
  startButton.type = 'submit';
  startButton.disabled = true;
  const cancelAnswer = element('button', 'secondary-button', ui.onboarding.cancel);
  cancelAnswer.type = 'button';
  cancelAnswer.hidden = true;
  cancelAnswer.addEventListener('click', () => {
    editingAnswer = false;
    activeView = editReturnView;
    fillAnswers(store.snapshot().state);
    update(store.snapshot());
    editTrigger.focus({ preventScroll: true });
    window.scrollTo({ top: editScroll, behavior: 'instant' });
  });
  welcomeForm.append(startButton, cancelAnswer);
  welcome.append(welcomeForm);
  welcomeForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!store.snapshot().ready || !hasCompleteStatus(draftAnswers)) return;
    const wasEditing = editingAnswer;
    editingAnswer = false;
    activeView = wasEditing ? editReturnView : 'overview';
    store.update(getStatusUpdate(draftAnswers));
    (wasEditing ? editTrigger : progressHeading).focus({ preventScroll: true });
    window.scrollTo({ top: wasEditing ? editScroll : 0, behavior: 'instant' });
  });

  const list = element('ol', 'checklist');
  list.id = 'checklist-steps';
  list.setAttribute('aria-label', ui.checklist.label);
  const viewSwitch = element('div', 'view-switch');
  viewSwitch.setAttribute('role', 'group');
  viewSwitch.setAttribute('aria-label', ui.checklist.viewLabel);
  const viewButtons = new Map();
  let checklistView = 'list';
  for (const [view, label] of [['list', ui.checklist.listView], ['path', ui.checklist.pathView]]) {
    const button = element('button', 'view-button', label);
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-controls', list.id);
    button.setAttribute('aria-pressed', String(view === checklistView));
    button.addEventListener('click', () => {
      if (!canUseChecklist(store.snapshot())) return;
      checklistView = view;
      update(store.snapshot());
    });
    viewButtons.set(view, button);
    viewSwitch.append(button);
  }
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
  overview.append(viewSwitch, progress, element('p', 'overview-hint', ui.checklist.hint), list);
  const changeAnswer = element('button', 'change-answer', ui.onboarding.change);
  changeAnswer.type = 'button';
  changeAnswer.addEventListener('click', () => editAnswers(changeAnswer));
  overview.append(changeAnswer);
  const detail = element('section', 'detail-view');
  detail.id = 'step-detail';
  detail.hidden = true;
  detail.setAttribute('aria-labelledby', 'detail-title');
  const about = element('section', 'about-view');
  about.id = 'about-view';
  about.hidden = true;
  about.setAttribute('aria-labelledby', 'about-title');
  const aboutBack = element('button', 'back-button', ui.detail.back);
  aboutBack.type = 'button';
  aboutBack.addEventListener('click', () => {
    activeView = 'overview';
    update(store.snapshot());
    aboutButton.focus({ preventScroll: true });
    window.scrollTo({ top: overviewScroll, behavior: 'instant' });
  });
  const aboutTitle = element('h2', 'about-headline', ui.about.headline);
  aboutTitle.id = 'about-title';
  aboutTitle.tabIndex = -1;
  const aboutEditAnswers = element('button', 'secondary-button about-edit', ui.onboarding.change);
  aboutEditAnswers.type = 'button';
  aboutEditAnswers.addEventListener('click', () => editAnswers(aboutEditAnswers));
  const faq = element('dl', 'about-faq');
  for (const item of ui.about.faq) {
    const pair = element('div', 'faq-pair');
    pair.append(element('dt', null, item.question), element('dd', null, item.answer));
    faq.append(pair);
  }
  about.append(
    aboutBack,
    aboutTitle,
    aboutEditAnswers,
    element('p', 'about-paragraph', ui.about.paragraph),
    element('p', 'about-review-note', ui.about.reviewNote),
    faq,
    element('p', 'about-footer', ui.about.footer)
  );
  const inputs = new Map();
  const documentInputs = new Map();
  let overviewScroll = 0;
  let lastStepButton = null;
  let activeStepId = null;
  let detailDoneButton = null;
  let detailDoneStatus = null;
  let detailPackingCount = null;
  let detailReadyBadge = null;
  let activeView = 'overview';
  let editingAnswer = false;
  let editReturnView = 'overview';
  let editTrigger = changeAnswer;
  let editScroll = 0;

  function canUseChecklist(snapshot) {
    return snapshot.ready && hasCompleteStatus(getStatusAnswers(snapshot.state)) && !editingAnswer;
  }

  function fillAnswers(state) {
    draftAnswers = getStatusAnswers(state);
    for (const [key, inputs] of answerInputs) {
      for (const [answer, input] of inputs) input.checked = answer === draftAnswers[key];
    }
  }

  function editAnswers(trigger) {
    const snapshot = store.snapshot();
    if (!canUseChecklist(snapshot)) return;
    editReturnView = activeView;
    editTrigger = trigger;
    editScroll = window.scrollY;
    editingAnswer = true;
    fillAnswers(snapshot.state);
    update(snapshot);
    firstQuestion.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    if (!canUseChecklist(snapshot) || !getChecklistProgress(content, snapshot.state).visibleSteps.some(item => item.id === step.id)) return;
    activeView = 'detail';
    overviewScroll = window.scrollY;
    lastStepButton = trigger;
    activeStepId = step.id;
    documentInputs.clear();
    detailPackingCount = null;
    detailReadyBadge = null;

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
    packing.append(element('p', 'packing-reminder', ui.detail.packingReminder));
    if (step.packingList.length) {
      packing.append(element('p', 'packing-help', ui.detail.packingHelp));
      const packingStatus = element('p', 'packing-status');
      packingStatus.setAttribute('role', 'status');
      detailPackingCount = element('span', 'packing-count');
      detailReadyBadge = element('span', 'ready-badge', ui.detail.readyBadge);
      detailReadyBadge.hidden = true;
      packingStatus.append(detailPackingCount, detailReadyBadge);
      packing.append(packingStatus);
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
            input.checked = snapshot.state.packedDocumentsByStep[step.id]?.includes(id) ?? false;
            return;
          }
          const packedDocuments = new Set(snapshot.state.packedDocumentsByStep[step.id] ?? []);
          if (input.checked) packedDocuments.add(id);
          else packedDocuments.delete(id);
          store.update({ packedDocumentsByStep: { ...snapshot.state.packedDocumentsByStep, [step.id]: [...packedDocuments] } });
        });
      }
      packing.append(packingList);
    } else {
      packing.append(element('p', null, ui.detail.noDocuments));
    }
    if (step.packingListNote) packing.append(element('p', 'packing-note', step.packingListNote));
    detail.append(packing);

    if (step.common_mistakes?.length) {
      const mistakes = element('section', 'detail-section common-mistakes');
      const mistakeList = element('ul', 'mistakes-list');
      for (const mistake of step.common_mistakes) mistakeList.append(element('li', null, mistake));
      mistakes.append(element('h3', null, ui.detail.commonMistakes), mistakeList);
      detail.append(mistakes);
    }

    const source = element('a', 'source-link', ui.detail.source);
    source.href = step.officialSourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    const sourceSection = element('section', 'detail-section source-section');
    sourceSection.append(
      element('h3', null, ui.detail.sourceHeading),
      source,
      element('p', 'source-note', ui.detail.sourceNote)
    );
    detail.append(sourceSection);

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
    const nextBadge = element('span', 'next-badge', ui.checklist.nextLabel);
    nextBadge.hidden = true;
    const readiness = element('span', 'readiness-indicator');
    readiness.hidden = true;
    text.append(doneBadge, nextBadge, readiness);
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
    inputs.set(step.id, { input, row, open, title, step, doneBadge, nextBadge, readiness, number });

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
    draftInitialized = false;
    store.reset();
    firstQuestion.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  resetDialog.append(resetTitle, resetNote, cancelReset, confirmReset);
  resetButton.addEventListener('click', () => {
    if (!store.snapshot().loading && !store.snapshot().saving) resetDialog.showModal();
  });

  const status = element('p', 'save-status');
  status.setAttribute('role', 'status');
  root.replaceChildren(header, errorBox, welcome, overview, detail, about, status, resetDialog);

  // Updating existing inputs keeps keyboard focus and native checkbox behaviour.
  function update(snapshot) {
    if (snapshot.ready && !draftInitialized) {
      fillAnswers(snapshot.state);
      draftInitialized = true;
    }
    const ready = canUseChecklist(snapshot);
    const { visibleSteps, done, total } = getChecklistProgress(content, snapshot.state);
    const visibleIds = new Set(visibleSteps.map(step => step.id));
    const nextStep = visibleSteps.find(step => !snapshot.state.completedSteps.includes(step.id));
    const pathView = checklistView === 'path';
    list.classList.toggle('is-path', pathView);
    for (const [view, button] of viewButtons) {
      button.disabled = !ready;
      button.setAttribute('aria-pressed', String(view === checklistView));
    }
    welcome.hidden = !snapshot.ready || ready;
    welcomeCopy.hidden = editingAnswer;
    cancelAnswer.hidden = !editingAnswer;
    startButton.textContent = editingAnswer ? ui.onboarding.save : ui.onboarding.start;
    for (const group of questionGroups) group.disabled = !snapshot.ready || ready;
    startButton.disabled = !snapshot.ready || ready || !hasCompleteStatus(draftAnswers);
    overview.hidden = !ready || activeView !== 'overview';
    detail.hidden = !ready || activeView !== 'detail';
    about.hidden = !ready || activeView !== 'about';
    aboutButton.hidden = !ready || activeView !== 'overview';
    aboutButton.disabled = !ready;
    headerSubline.hidden = !ready || activeView !== 'overview';
    changeAnswer.disabled = !ready;
    aboutEditAnswers.disabled = !ready;
    let stepNumber = 0;
    for (const [id, { input, row, open, title, step, doneBadge, nextBadge, readiness, number }] of inputs) {
      row.hidden = !visibleIds.has(id);
      const stepTitle = pathView ? step.shortTitle : step.title;
      if (title.textContent !== stepTitle) title.textContent = stepTitle;
      if (!row.hidden) number.textContent = String(++stepNumber).padStart(2, '0');
      input.checked = snapshot.state.completedSteps.includes(id);
      input.disabled = !ready || row.hidden;
      open.disabled = !ready || row.hidden;
      row.classList.toggle('is-complete', input.checked);
      const isNext = pathView && id === nextStep?.id;
      row.classList.toggle('is-next', isNext);
      row.classList.toggle('is-last-visible', id === visibleSteps.at(-1)?.id);
      if (isNext) open.setAttribute('aria-current', 'step');
      else open.removeAttribute('aria-current');
      doneBadge.hidden = !input.checked;
      nextBadge.hidden = !isNext;
      const packing = getPackingProgress(step, snapshot.state);
      readiness.hidden = !packing.total;
      readiness.classList.toggle('is-ready', packing.ready);
      const readinessText = packing.ready ? ui.detail.readyBadge : fillTemplate(ui.detail.packingCount, packing);
      if (readiness.textContent !== readinessText) readiness.textContent = readinessText;
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
      input.checked = snapshot.state.packedDocumentsByStep[activeStepId]?.includes(id) ?? false;
      input.disabled = !ready;
    }
    if (detailPackingCount) {
      const packing = getPackingProgress(steps.find(step => step.id === activeStepId), snapshot.state);
      const count = fillTemplate(ui.detail.packingCount, packing);
      if (detailPackingCount.textContent !== count) detailPackingCount.textContent = count;
      detailReadyBadge.hidden = !packing.ready;
    }
    errorBox.hidden = !snapshot.error;
    resetButton.hidden = !snapshot.error || snapshot.ready;
    resetButton.disabled = snapshot.loading || snapshot.saving;
    confirmReset.disabled = snapshot.loading || snapshot.saving;
    status.hidden = Boolean(snapshot.error) || (snapshot.ready && !ready) || activeView === 'about';
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
