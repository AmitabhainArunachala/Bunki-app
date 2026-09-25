/* Portable Bunki report client. No dependency on the learning app's state/storage. */
(() => {
  'use strict';
  if (window.BunkiReports) return;
  const SCHEMA = 'bunki.maintenance/v1';
  const DB_NAME = 'bunki-maintenance-reports-v1';
  const DEFAULT_LIMITS = { attachment_bytes: 2097152, attachment_count: 4, total_attachment_bytes: 6291456 };
  // Service config reaches innerHTML; only bounded integers may pass (a hostile
  // or broken service cannot inject markup through a limit).
  const LIMIT_CAPS = { attachment_bytes: 67108864, attachment_count: 32, total_attachment_bytes: 268435456 };
  const boundedLimits = (raw) => Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => {
    const value = raw?.[key];
    return [key, Number.isSafeInteger(value) && value >= 0 && value <= LIMIT_CAPS[key] ? value : fallback];
  }));
  const STATUS = { received: 'Received', looking_into_it: 'Looking into it', preparing_fix: 'Preparing a fix', ready_for_review: 'Ready for review' };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  // Contract lengths count Unicode codepoints. UTF-16 slicing can split an emoji.
  const clip = (value, length) => typeof value === 'string' ? Array.from(value).slice(0, length).join('') : '';
  const id = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).sort().reduce((result, key) => { result[key] = item[key]; return result; }, {}) : item);
  const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
  let instance;

  function database() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('This browser cannot save reports. Keep this sheet open and copy your text before leaving.'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('records', { keyPath: 'id' });
        db.createObjectStore('attachments', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Report storage is blocked by another tab. Close that tab and retry.'));
    });
  }

  function createClient(initialOptions) {
    let options = initialOptions || {};
    let service = normalizeService(options.serviceUrl);
    let dbPromise = database();
    dbPromise.catch(() => {});
    let config = null, configPromise = null, configError = '', draft = null, draftDirty = false, active = 'new', selectedId = null;
    let draftCanAdoptBuild = false;
    let syncing = false, disposed = false, initialized = false, engaged = false, saveTimer, retryTimer, pollTimer;
    let saveQueue = Promise.resolve(), message = '', returnState = null, rows = [], previewUrls = [];
    let busy = false, attachmentBusy = false, followups = {}, sessionPromise = null;
    const root = document.createElement('div');
    root.id = 'bunki-reports-root';
    root.innerHTML = `<div class="br-rail" aria-label="Report support"><button type="button" data-br="open">Report a problem</button><button type="button" data-br="reports">My reports <span class="br-count"></span></button></div>
      <dialog class="br-sheet" aria-labelledby="br-title"><header class="br-heading"><h2 id="br-title">Report a problem</h2><button type="button" class="br-close" data-br="close" aria-label="Close reports and return to learning">Close</button></header><nav class="br-nav" aria-label="Reports"><button type="button" data-br="new" aria-current="page">Report a problem</button><button type="button" data-br="list">My reports</button></nav><div class="br-body"></div></dialog><div class="br-sr" role="status" aria-live="polite" id="br-live"></div>`;
    document.body.append(root);
    // A host that supplies its own in-flow entries (openReport/openReports) mounts
    // with rail:false: no overlay may ever sit over its controls.
    const railless = options.rail === false;
    if (railless) root.querySelector('.br-rail').style.display = 'none';
    const dialog = root.querySelector('dialog'), body = root.querySelector('.br-body');
    // Native top-layer modals make even high-z-index siblings inert. Keep the
    // report entry inside the active host dialog, without taking over its UI.
    function keepEntryReachable() {
      if (disposed || dialog.open || railless) return;
      const hostDialogs = [...document.querySelectorAll('dialog[open]')].filter(item => item !== dialog && !root.contains(item));
      const focusedHost = document.activeElement?.closest('dialog[open]');
      const destination = hostDialogs.includes(focusedHost) ? focusedHost : hostDialogs[hostDialogs.length - 1] || document.body;
      if (root.parentElement !== destination) destination.append(root);
    }
    const hostObserver = new MutationObserver(keepEntryReachable);
    hostObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    keepEntryReachable();

    function normalizeService(value) {
      if (!value) return '';
      try {
        const url = new URL(value, location.href);
        if (url.username || url.password || url.search || url.hash) return '';
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return '';
        return url.href.replace(/\/$/, '');
      } catch (_) { return ''; }
    }
    const metaKey = name => `${name}:${service || 'unconfigured'}`;
    const emptyDraft = () => { draftCanAdoptBuild = true; return { actual: '', expected: '', category: 'bug', context: capture(), attachments: [], created_at: new Date().toISOString() }; };
    function serviceBuild() {
      if (!service || new URL(service).origin !== location.origin) return null;
      const build = config?.build;
      if (!build || !/^[a-f0-9]{40}$/.test(build.git_sha || '') || !/^[a-f0-9]{64}$/.test(build.artifact_sha256 || '')) return null;
      return { git_sha: build.git_sha, artifact_sha256: build.artifact_sha256 };
    }

    function capture() {
      let source = {};
      try { source = typeof options.getContext === 'function' ? options.getContext() || {} : {}; } catch (_) { /* Safe minimal context remains usable. */ }
      const sha = source.build?.git_sha || source.build_sha;
      const artifact = source.build?.artifact_sha256 || source.artifact_sha256;
      const context = { app_id: 'bunki', surface: clip(source.surface, 160) || 'unknown', route: clip(source.route, 500) || '/', build: { git_sha: /^[a-f0-9]{40}$/.test(sha || '') ? sha : null, artifact_sha256: /^[a-f0-9]{64}$/.test(artifact || '') ? artifact : null }, content_ids: Array.isArray(source.content_ids) ? source.content_ids.filter(value => typeof value === 'string' && value).slice(0, 32).map(value => clip(value, 160)) : [], locale: clip(source.locale, 32) || clip(navigator.language, 32) || 'en' };
      if (!context.build.git_sha && !context.build.artifact_sha256 && serviceBuild()) context.build = serviceBuild();
      // Caller supplies semantic actions only; arbitrary nested payloads are discarded.
      const action_trace = (Array.isArray(source.action_trace) ? source.action_trace : []).slice(-8).filter(item => item && typeof item.action === 'string').map(item => ({ action: clip(item.action, 100), ...(typeof item.target === 'string' ? { target: clip(item.target, 160) } : {}), ...(typeof item.at === 'string' ? { at: clip(item.at, 40) } : {}) }));
      const diagnostics = { viewport: { width: Math.round(window.innerWidth), height: Math.round(window.innerHeight) }, ...(source.content_revision ? { content_revision: clip(source.content_revision, 160) } : {}), action_trace };
      return { context, diagnostics };
    }

    async function read(store, key) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => { const request = db.transaction(store, 'readonly').objectStore(store)[key === undefined ? 'getAll' : 'get'](key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    }
    async function transact(stores, writer) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Report storage could not be written.'));
        tx.onabort = () => reject(tx.error || new Error('Report storage write was interrupted.'));
        try { writer(tx); } catch (error) { tx.abort(); reject(error); }
      });
    }
    const putMeta = (key, value) => transact(['meta'], tx => tx.objectStore('meta').put({ key, value }));
    function announce(value) { root.querySelector('#br-live').textContent = value; }
    function setMessage(value) { message = value; announce(value); const element = body.querySelector('.br-notice'); if (element) { element.textContent = value; element.hidden = !value; } }
    const errorText = error => error?.name === 'AbortError' ? 'The service did not reply in time. Your saved report will retry with the same ID.' : clip(error?.message, 400) || 'The service is unavailable. Your saved report can be retried.';

    async function request(path, { method = 'GET', data, token, bodyText, timeout = 18000 } = {}) {
      if (!service) throw new Error('The report service is not connected. Reports stay on this device until a service is configured.');
      if (navigator.onLine === false) throw new Error('You are offline. Reports stay on this device and retry when you reconnect.');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(service + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined || bodyText ? { 'Content-Type': 'application/json' } : {}) }, ...(bodyText || data !== undefined ? { body: bodyText || JSON.stringify(data) } : {}), credentials: 'omit', signal: controller.signal });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(response.status === 401 ? 'Your report session has expired. Saved reports are kept here; reconnect this browser with the service operator to restore access.' : result.error?.message || `Report service returned ${response.status}. Retry when the service is available.`);
          error.status = response.status; throw error;
        }
        return result;
      } finally { clearTimeout(timer); }
    }
    async function loadConfig() {
      if (!service) { configError = 'The report service is not connected. You can save a report on this device.'; return null; }
      if (configPromise) return configPromise;
      configPromise = (async () => {
        try {
          config = await request('/api/config'); configError = '';
          const build = serviceBuild();
          // Only a context captured in this document may inherit this document's
          // same-origin build. Older offline drafts retain their unknown identity.
          if (build && draftCanAdoptBuild && draft && !draft.context.context.build.git_sha && !draft.context.context.build.artifact_sha256) {
            draft.context.context.build = build;
            if (draftDirty) await persistDraft();
          }
          return config;
        } catch (error) { configError = errorText(error); return null; }
      })();
      try { return await configPromise; } finally { configPromise = null; }
    }
    async function session() {
      if (sessionPromise) return sessionPromise;
      const getSession = async () => {
        const saved = await read('meta', metaKey('session'));
        if (saved?.value?.token && saved.value.actor_ref) return saved.value;
        const value = await request('/api/session', { method: 'POST', data: {} });
        if (!value.token || !value.actor_ref) throw new Error('The service did not return a usable guest session.');
        await putMeta(metaKey('session'), value);
        return value;
      };
      sessionPromise = navigator.locks ? navigator.locks.request(`bunki-reports-session:${service}`, getSession) : getSession();
      try { return await sessionPromise; } finally { sessionPromise = null; }
    }
    async function authenticated(path, params = {}) { const auth = await session(); return request(path, { ...params, token: auth.token }); }

    function persistDraft() {
      if (!draft) return Promise.resolve();
      clearTimeout(saveTimer);
      const snapshot = structuredClone(draft), key = metaKey('draft');
      saveQueue = saveQueue.catch(() => {}).then(() => putMeta(key, snapshot));
      return saveQueue;
    }
    function scheduleDraft() {
      draftDirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persistDraft().catch(() => setMessage('This draft could not be saved on this device. Keep the sheet open and copy your text before leaving.')), 150);
    }
    async function refreshRows() {
      rows = (await read('records')).filter(row => row.service === service).sort((a, b) => b.created_at.localeCompare(a.created_at));
      root.querySelector('.br-count').textContent = rows.length ? `(${rows.length})` : '';
    }
    function statusLabel(row) {
      if (!row.view?.receipt) return 'Saved on this device';
      // A release claim needs server evidence; unknown client/model statuses cannot claim a fix.
      if (row.view.status === 'fixed' && row.view.release?.verified === true && row.view.release?.version) return `Fixed in ${row.view.release.version}`;
      return STATUS[row.view.status] || 'Received';
    }
    function localRow(view) {
      return { id: view.report.id, service, created_at: view.report.created_at, report: view.report, view, delivery_error: '', received_at: view.receipt.received_at };
    }
    function validView(view, expectedId) {
      return view?.report?.id && (!expectedId || view.report.id === expectedId) && view.receipt?.report_id === view.report.id && typeof view.receipt.receipt_id === 'string' && /^[a-f0-9]{64}$/.test(view.receipt.payload_sha256 || '');
    }
    async function saveView(view) {
      if (!validView(view)) throw new Error('The service reply did not contain a matching receipt. Your local report is kept for retry.');
      const previous = await read('records', view.report.id);
      if (previous?.wire_sha256 && previous.wire_sha256 !== view.receipt.payload_sha256) throw new Error('The receipt digest does not match this device’s saved payload. The report is retained for inspection.');
      await transact(['records'], tx => tx.objectStore('records').put({ ...previous, ...localRow(view) }));
    }
    async function reloadRemote() {
      const result = await authenticated('/api/reports');
      if (!Array.isArray(result.reports)) throw new Error('The service returned an invalid report list.');
      for (const view of result.reports) await saveView(view);
      await refreshRows();
    }
    async function attachmentBase64(blob) {
      return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('A saved attachment could not be read. The report remains on this device.')); reader.readAsDataURL(blob); });
    }
    async function freezePayload(row, auth) {
      if (row.wire_text) {
        if (await digest(row.wire_text) !== row.wire_sha256) throw new Error('The saved request failed its integrity check. It was not sent.');
        if (row.report.origin.actor_ref !== auth.actor_ref) throw new Error('This saved report belongs to a different guest session. Its original identity was preserved.');
        return row;
      }
      const report = structuredClone(row.report);
      report.origin.actor_ref = auth.actor_ref;
      const attachments = [];
      for (const attachmentId of report.attachment_ids) {
        const item = await read('attachments', attachmentId);
        if (!item?.blob) throw new Error('A saved attachment is missing. The report was kept and has not been sent.');
        attachments.push({ id: item.id, name: item.name, mime_type: item.mime_type, data_base64: await attachmentBase64(item.blob) });
      }
      const wire_text = canonical({ idempotency_key: row.idempotency_key, report, attachments });
      const frozen = { ...row, report, wire_text, wire_sha256: await digest(wire_text) };
      await transact(['records'], tx => tx.objectStore('records').put(frozen));
      return frozen;
    }
    async function sync() {
      if (navigator.locks) return navigator.locks.request(`bunki-reports-delivery:${service}`, { ifAvailable: true }, lock => lock ? syncUnlocked() : undefined);
      return syncUnlocked();
    }
    async function syncUnlocked() {
      if (syncing || disposed || !initialized) return;
      syncing = true;
      clearTimeout(retryTimer);
      try {
        await refreshRows();
        for (let row of rows.filter(item => !item.view?.receipt)) {
          try {
            const auth = await session();
            row = await freezePayload(row, auth);
            const view = await request('/api/reports', { method: 'POST', token: auth.token, bodyText: row.wire_text });
            if (!validView(view, row.id)) throw new Error('The service reply did not contain the matching receipt. Retrying keeps this report’s original ID.');
            if (view.receipt.payload_sha256 !== row.wire_sha256) throw new Error('The receipt digest does not match the saved payload. It was kept on this device for inspection.');
            await saveView(view);
            announce('Your report was received.');
          } catch (error) {
            await transact(['records'], tx => tx.objectStore('records').put({ ...row, delivery_error: errorText(error) }));
            configError = errorText(error);
            break;
          }
        }
        await refreshRows();
        if (dialog.open && active !== 'new' && !busy && !body.querySelector('textarea:focus')) render();
      } catch (error) { configError = errorText(error); }
      finally { syncing = false; if (!disposed && service && rows.some(row => !row.view?.receipt)) retryTimer = setTimeout(sync, 30000); }
    }

    function snapshotReturn() {
      const element = document.activeElement;
      const selection = window.getSelection();
      returnState = { element, x: window.scrollX, y: window.scrollY, selection: selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null, start: element?.selectionStart, end: element?.selectionEnd };
    }
    async function open(mode) {
      if (!initialized) await ready;
      engaged = true;
      if (!dialog.open) {
        snapshotReturn();
        if (!draft || (!draft.actual && !draft.expected && !draft.attachments.length)) { draft = emptyDraft(); draftDirty = false; }
        try { if (typeof options.onOpen === 'function') options.onOpen({ mode }); } catch (_) { /* A host playback error must not block reporting. */ }
        window.dispatchEvent(new CustomEvent('bunki:reports-open', { detail: { mode } }));
        // Protect the active sheet even if the host later rerenders its modal.
        if (root.parentElement !== document.body) document.body.append(root);
        dialog.showModal();
      }
      active = mode; message = ''; render();
      (mode === 'new' ? body.querySelector('#br-actual') : body.querySelector('button'))?.focus({ preventScroll: true });
      if (mode === 'list') updateReports();
      else loadConfig().then(() => { if (dialog.open && active === 'new' && !busy) render(); });
    }
    function restoreReturn() {
      clearTimeout(pollTimer);
      if (draftDirty) persistDraft().catch(() => announce('The draft could not be saved. Reopen reports before leaving this page.'));
      const saved = returnState; returnState = null;
      if (!saved) return;
      keepEntryReachable();
      if (saved.element?.isConnected) {
        saved.element.focus({ preventScroll: true });
        if (typeof saved.start === 'number' && typeof saved.element.setSelectionRange === 'function') {
          try { saved.element.setSelectionRange(saved.start, saved.end); } catch (_) { /* Non-text controls do not accept ranges. */ }
        }
      }
      if (saved.selection?.startContainer?.isConnected && !root.contains(saved.selection.startContainer)) {
        try { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(saved.selection); } catch (_) { /* Route rerender may invalidate an old range. */ }
      }
      window.scrollTo(saved.x, saved.y);
    }
    function close() { if (dialog.open) dialog.close(); }
    function clearPreviews() { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; }
    function preview(item) { const url = URL.createObjectURL(item.blob); previewUrls.push(url); return `<figure><img src="${esc(url)}" alt="Selected screenshot: ${esc(item.name)}"><figcaption>${esc(item.name)} · ${Math.ceil(item.blob.size / 1024)} KB</figcaption><button type="button" data-br="remove" data-id="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">Remove screenshot</button></figure>`; }
    function notice() { return `<p class="br-notice" role="status" ${message ? '' : 'hidden'}>${esc(message)}</p>`; }
    function exactContext(context) { return `<details><summary>Inspect the exact context included</summary><pre>${esc(JSON.stringify(context, null, 2))}</pre><p class="br-note">Only these fields, your words, and the screenshots you choose are included.</p></details>`; }
    function render() {
      const focus = document.activeElement, focusId = body.contains(focus) ? focus.id : '', start = focus?.selectionStart, end = focus?.selectionEnd, scroll = body.scrollTop;
      const focusAction = body.contains(focus) ? focus.dataset.br : null, focusRecord = focus?.dataset.id;
      clearPreviews();
      root.querySelector('#br-title').textContent = active === 'new' ? 'Report a problem' : active === 'detail' ? 'Your report' : 'My reports';
      root.querySelector('[data-br="new"]').setAttribute('aria-current', active === 'new' ? 'page' : 'false');
      root.querySelector('[data-br="list"]').setAttribute('aria-current', active !== 'new' ? 'page' : 'false');
      body.innerHTML = active === 'new' ? newMarkup() : active === 'detail' ? detailMarkup() : listMarkup();
      if (focusId || focusAction) {
        const replacement = focusId ? body.querySelector(`#${focusId}`) : [...body.querySelectorAll('[data-br]')].find(item => item.dataset.br === focusAction && item.dataset.id === focusRecord);
        if (replacement) { replacement.focus({ preventScroll: true }); if (typeof start === 'number' && replacement.setSelectionRange) replacement.setSelectionRange(start, end); }
      }
      body.scrollTop = scroll;
    }
    function newMarkup() {
      const limits = boundedLimits(config?.limits);
      return `${notice()}<p>Tell us what happened. Your place in the lesson stays here.</p>${options.clockNotice ? `<p class="br-note">${esc(typeof options.clockNotice === 'function' ? options.clockNotice() : options.clockNotice)}</p>` : ''}
        ${configError ? `<p class="br-note">${esc(configError)}</p>` : ''}<form id="br-form"><label class="br-field"><span>What happened?</span><textarea id="br-actual" name="actual" required maxlength="12000" rows="4" placeholder="Which sentence or control was involved?">${esc(draft?.actual)}</textarea></label>
        <label class="br-field"><span>What did you expect? <small>Optional</small></span><textarea id="br-expected" name="expected" maxlength="4000" rows="2">${esc(draft?.expected)}</textarea></label>
        <label class="br-field"><span>Category</span><select id="br-category" name="category">${[['bug', 'Something isn’t working'], ['content', 'Language or content'], ['experience', 'Learning experience'], ['idea', 'An idea']].map(([value, label]) => `<option value="${value}" ${draft?.category === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        ${exactContext(draft?.context)}<label class="br-field"><span>Add a screenshot <small>Optional</small></span><input id="br-files" type="file" accept="image/png,image/jpeg,image/webp" multiple ${attachmentBusy ? 'disabled' : ''} aria-describedby="br-file-note"></label><p id="br-file-note" class="br-note">Choose an image yourself. Preview it below and remove anything private. PNG, JPEG or WebP; up to ${limits.attachment_count} images, ${Math.floor(limits.attachment_bytes / 1048576)} MB each.</p><div class="br-attachments">${(draft?.attachments || []).map(preview).join('')}</div>
        <div class="br-actions"><button type="submit" class="br-primary" ${busy || attachmentBusy ? 'disabled' : ''}>${busy ? 'Saving…' : service ? 'Send report' : 'Save on this device'}</button><button type="button" data-br="close">Return to lesson</button></div><p class="br-note">Saved on this device before sending. “Received” appears only when the service confirms delivery.</p></form>`;
    }
    function listMarkup() {
      return `${notice()}<p class="br-note">Reports and guest access are saved in this browser. Clearing browser data removes that access.</p><div class="br-actions"><button type="button" data-br="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Refresh & retry'}</button><button type="button" data-br="new">New report</button></div>${configError ? `<p class="br-note">${esc(configError)}</p>` : ''}${rows.length ? `<ul class="br-report-list">${rows.map(row => `<li><button type="button" data-br="detail" data-id="${esc(row.id)}"><span class="br-report-title">${esc(clip(row.report.user_words, 140))}${Array.from(row.report.user_words).length > 140 ? '…' : ''}</span><span class="br-status">${esc(statusLabel(row))}</span><time class="br-date" datetime="${esc(row.created_at)}">${esc(new Date(row.created_at).toLocaleDateString())}</time></button></li>`).join('')}</ul>` : '<h3>No reports yet</h3><p>A report can describe something broken, a language issue, or an idea for Bunki.</p>'}`;
    }
    function proposalMarkup(proposal) {
      return `<section class="br-proposal"><h3>${esc(proposal.title)}</h3><p class="br-note">Sensei proposal · ${esc(proposal.origin?.model_ref || 'Model not supplied')} · Requires operator review</p><p class="br-verbatim">${esc(proposal.problem)}</p><h4>Suggested change</h4><p class="br-verbatim">${esc(proposal.proposed_change)}</p>${proposal.claims?.length ? `<h4>Claims and evidence</h4><ul>${proposal.claims.map(claim => `<li><strong>${esc(({ user_report: 'Reported', inspection: 'Inspected', hypothesis: 'Hypothesis' })[claim.basis] || claim.basis)}:</strong> ${esc(claim.text)}<br><span class="br-note">Evidence: ${esc((claim.evidence_ids || []).join(', '))}</span></li>`).join('')}</ul>` : ''}<h4>Acceptance checks</h4><ol>${(proposal.acceptance_cases || []).map(item => `<li><strong>Given</strong> ${esc(item.given)}<br><strong>When</strong> ${esc(item.when)}<br><strong>Then</strong> ${esc(item.then)}</li>`).join('')}</ol>${proposal.unknowns?.length ? `<h4>Still uncertain</h4><ul>${proposal.unknowns.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}<h4>Rollback</h4><p>${esc(proposal.rollback)}</p><p class="br-note">Source reports: ${esc((proposal.source_report_ids || []).join(', '))}</p><details><summary>Inspect complete proposal JSON</summary><pre>${esc(JSON.stringify(proposal, null, 2))}</pre></details><button type="button" data-br="export" data-id="${esc(proposal.id)}">Export this proposal JSON</button><p class="br-note">This proposal requests review. It cannot change the app or grant execution permission.</p></section>`;
    }
    function detailMarkup() {
      const row = rows.find(item => item.id === selectedId);
      if (!row) { active = 'list'; return listMarkup(); }
      const report = row.report, view = row.view, isReceived = !!view?.receipt, follow = followups[row.id]?.text || '';
      const protectedAnswer = typeof options.protectAnswers === 'function' ? options.protectAnswers() : options.protectAnswers === true;
      return `${notice()}<button type="button" data-br="list">Back to my reports</button><h3>${esc(statusLabel(row))}</h3><p class="br-note">${isReceived ? `Receipt ${esc(view.receipt.receipt_id)}` : 'Delivery is pending. You can leave this sheet; the saved report stays in this browser.'}</p>${row.delivery_error ? `<p class="br-note">${esc(row.delivery_error)}</p>` : ''}<h4>Your original words</h4><p class="br-verbatim">${esc(report.user_words)}</p><h4>What you expected</h4><p class="br-verbatim">${esc(report.expected)}</p>${exactContext({ context: report.context, evidence: report.evidence.filter(item => item.kind === 'action_trace'), attachment_ids: report.attachment_ids })}<div class="br-actions"><button type="button" data-br="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Refresh & retry'}</button>${isReceived ? `<button type="button" data-br="propose" ${busy || ['running', 'pending'].includes(view.triage?.state) && view.triage?.state !== 'pending' ? 'disabled' : ''}>Ask Sensei for a proposal</button>` : ''}</div>
        ${isReceived ? `<h3>Sensei analysis</h3>${protectedAnswer ? '<p class="br-note">Your report is available. AI analysis and proposals can be read after the protected sitting ends, to keep answer support unchanged.</p>' : `<p class="br-note">${esc(triageText(view))}</p>${view.conversation?.length ? `<ol class="br-thread">${view.conversation.map(item => `<li><strong>${esc(item.actor === 'sensei' ? 'Sensei · AI interpretation' : item.actor === 'user' ? 'You' : 'Service update')}</strong><p class="br-verbatim">${esc(item.text)}</p></li>`).join('')}</ol>` : ''}${(view.proposals || []).map(proposalMarkup).join('')}`}<form id="br-follow-form"><label class="br-field"><span>Add a detail or reply</span><textarea id="br-follow" maxlength="4000" rows="3">${esc(follow)}</textarea></label><div class="br-actions"><button type="submit" ${busy ? 'disabled' : ''}>Send follow-up</button><button type="button" data-br="reopen" ${busy ? 'disabled' : ''}>Still happening</button></div><p class="br-note">“Still happening” keeps this thread and adds the current screen context.</p></form>` : ''}`;
    }
    function triageText(view) {
      const triage = view.triage;
      if (triage?.reason) return `${triage.state ? `${triage.state.charAt(0).toUpperCase()}${triage.state.slice(1)}: ` : ''}${triage.reason}`;
      if (triage?.state === 'running') return 'Sensei is analyzing the received report. Refresh to see its response.';
      if (triage?.state === 'complete') return view.proposals?.length ? 'The service returned the proposal below. Your original words remain above.' : 'Analysis finished. The service has not returned a build proposal.';
      return config?.ai?.status && !['ready', 'available'].includes(config.ai.status) ? `AI service: ${config.ai.status}. No model response has been received.` : 'No model response has been received yet. Ask Sensei for a proposal when you are ready.';
    }

    async function submitReport() {
      if (busy || attachmentBusy || !draft?.actual.trim()) return;
      busy = true; setMessage('Saving the report and selected screenshots on this device…'); render();
      try {
        if (draftCanAdoptBuild && service && new URL(service).origin === location.origin && !draft.context.context.build.git_sha) await loadConfig();
        await persistDraft();
        const reportId = id('report'), report = { schema_version: SCHEMA, id: reportId, revision: 1, created_at: new Date().toISOString(), origin: { kind: 'user', actor_ref: 'pending_guest_session', model_ref: null }, context: draft.context.context, evidence: [{ id: id('evidence'), kind: 'user_quote', summary: clip(draft.actual.trim(), 4000), artifact_ref: null }, { id: id('evidence'), kind: 'action_trace', summary: JSON.stringify(draft.context.diagnostics), artifact_ref: null }, ...draft.attachments.map(item => ({ id: id('evidence'), kind: 'screenshot', summary: `User-selected screenshot: ${item.name}`, artifact_ref: `attachment:${item.id}` }))], execution_authority: 'none', kind: 'learner_report', category: draft.category, user_words: clip(draft.actual.trim(), 12000), expected: clip(draft.expected.trim(), 4000) || 'Not specified', actual: clip(draft.actual.trim(), 4000), reproduction_steps: [], attachment_ids: draft.attachments.map(item => item.id) };
        const row = { id: reportId, idempotency_key: id('delivery'), service, created_at: report.created_at, report, view: null, delivery_error: '' };
        await transact(['records', 'attachments', 'meta'], tx => {
          tx.objectStore('records').put(row);
          for (const item of draft.attachments) tx.objectStore('attachments').put({ ...item, report_id: reportId });
          tx.objectStore('meta').delete(metaKey('draft'));
        });
        draft = emptyDraft(); draftDirty = false;
        selectedId = reportId; active = 'detail';
        message = 'Saved on this device. Delivery is pending.';
        await refreshRows();
        announce(message);
      } catch (error) { message = `The report could not be saved. Your draft is still here. ${errorText(error)}`; }
      finally { busy = false; render(); }
      sync();
    }

    async function addFiles(files) {
      if (attachmentBusy || busy) return;
      attachmentBusy = true;
      const limits = boundedLimits(config?.limits);
      try {
        const selected = [...files];
        if (draft.attachments.length + selected.length > limits.attachment_count) throw new Error(`Choose at most ${limits.attachment_count} screenshots.`);
        if (selected.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) throw new Error('Choose PNG, JPEG, or WebP images. No files were added.');
        if (selected.some(file => file.size > limits.attachment_bytes)) throw new Error(`Each screenshot must be at most ${Math.floor(limits.attachment_bytes / 1048576)} MB. No files were added.`);
        if ([...draft.attachments.map(item => item.blob), ...selected].reduce((sum, file) => sum + file.size, 0) > limits.total_attachment_bytes) throw new Error('The screenshots exceed the combined size limit. Choose smaller images.');
        for (const file of selected) {
          const bitmap = await createImageBitmap(file).catch(() => null);
          if (!bitmap || bitmap.width > 16000 || bitmap.height > 16000 || bitmap.width * bitmap.height > 40000000) { bitmap?.close(); throw new Error('A screenshot cannot be previewed safely. Choose a valid image smaller than 40 megapixels.'); }
          bitmap.close();
        }
        draft.attachments.push(...selected.map(file => ({ id: id('attachment'), name: clip(file.name.replace(/[\\/]/g, '_'), 160) || 'screenshot', mime_type: file.type, blob: file })));
        draftDirty = true;
        await persistDraft(); message = '';
      } catch (error) { message = errorText(error); }
      finally { attachmentBusy = false; render(); }
    }
    async function updateReports() {
      if (busy) return;
      busy = true; render();
      try { await loadConfig(); await sync(); await reloadRemote(); message = ''; configError = ''; }
      catch (error) { message = errorText(error); }
      finally { busy = false; await refreshRows().catch(() => {}); if (dialog.open && active !== 'new') render(); }
    }
    async function propose() {
      if (busy) return;
      busy = true; render();
      try {
        const result = await authenticated(`/api/reports/${encodeURIComponent(selectedId)}/propose`, { method: 'POST', data: {} });
        message = result.queued ? 'Sensei analysis was requested. Its actual response will appear here when the service returns it.' : 'The service returned a response. Refreshing this report…';
        const view = await authenticated(`/api/reports/${encodeURIComponent(selectedId)}`);
        await saveView(view); await refreshRows();
        clearTimeout(pollTimer);
        pollTimer = setTimeout(() => { if (dialog.open && active === 'detail' && !body.querySelector('textarea:focus')) updateReports(); }, 12000);
      } catch (error) { message = errorText(error); }
      finally { busy = false; render(); announce(message); }
    }
    async function followup(reopen) {
      if (busy) return;
      const reportId = selectedId, text = clip((followups[reportId]?.text || '').trim(), 4000);
      if (!reopen && !text) { setMessage('Write a detail before sending your follow-up.'); body.querySelector('#br-follow')?.focus(); return; }
      busy = true; render();
      try {
        const key = metaKey(`followup:${reportId}`), previous = followups[reportId] || {};
        const action = reopen ? 'reopen' : 'messages';
        // Freeze retries, including the captured reopen context, before network I/O.
        let pending = previous.pending;
        if (pending && (pending.action !== action || pending.data.text !== (text || 'Still happening.'))) throw new Error('An earlier follow-up is awaiting confirmation. Retry it unchanged before sending another message.');
        if (!pending) pending = { action, data: { idempotency_key: id('message'), text: text || 'Still happening.', ...(reopen ? { context: capture().context } : {}) } };
        followups[reportId] = { text, pending };
        await putMeta(key, followups[reportId]);
        const view = await authenticated(`/api/reports/${encodeURIComponent(reportId)}/${action}`, { method: 'POST', data: pending.data });
        if (!validView(view, reportId)) throw new Error('The follow-up reply did not include the report receipt. Retry this message unchanged.');
        await saveView(view);
        followups[reportId] = { text: '' }; await putMeta(key, followups[reportId]);
        await refreshRows(); message = reopen ? 'The report was reopened with your current screen context.' : 'Your follow-up was received.';
      } catch (error) { message = `Your follow-up is kept on this device. ${errorText(error)}`; }
      finally { busy = false; render(); announce(message); }
    }
    function exportProposal(proposalId) {
      const proposal = rows.find(row => row.id === selectedId)?.view?.proposals?.find(item => item.id === proposalId);
      if (!proposal) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2) + '\n'], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `bunki-${proposal.id.replace(/[^a-z0-9_-]/g, '')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    root.addEventListener('click', async event => {
      const button = event.target.closest('[data-br]');
      if (!button || button.disabled) return;
      const action = button.dataset.br;
      if (action === 'open' || action === 'new') open('new');
      else if (action === 'reports' || action === 'list') open('list');
      else if (action === 'close') close();
      else if (action === 'detail') {
        selectedId = button.dataset.id; active = 'detail'; message = '';
        try { followups[selectedId] = (await read('meta', metaKey(`followup:${selectedId}`)))?.value || { text: '' }; } catch (_) { /* In-memory follow-up remains available. */ }
        render(); body.scrollTop = 0; body.querySelector('button')?.focus({ preventScroll: true });
      } else if (action === 'remove' && !busy) { draft.attachments = draft.attachments.filter(item => item.id !== button.dataset.id); scheduleDraft(); render(); body.querySelector('#br-files')?.focus(); }
      else if (action === 'refresh') updateReports();
      else if (action === 'propose') propose();
      else if (action === 'reopen') followup(true);
      else if (action === 'export') exportProposal(button.dataset.id);
    });
    root.addEventListener('input', event => {
      if (event.target.id === 'br-actual') { draft.actual = event.target.value; scheduleDraft(); }
      else if (event.target.id === 'br-expected') { draft.expected = event.target.value; scheduleDraft(); }
      else if (event.target.id === 'br-follow') {
        const previous = followups[selectedId] || {};
        followups[selectedId] = { ...previous, text: event.target.value };
        putMeta(metaKey(`followup:${selectedId}`), followups[selectedId]).catch(() => setMessage('This follow-up could not be saved. Keep the sheet open and copy your text.'));
      }
    });
    root.addEventListener('change', event => {
      if (event.target.id === 'br-category') { draft.category = event.target.value; scheduleDraft(); }
      if (event.target.id === 'br-files') addFiles(event.target.files);
    });
    root.addEventListener('submit', event => { event.preventDefault(); if (event.target.id === 'br-form') submitReport(); if (event.target.id === 'br-follow-form') followup(false); });
    dialog.addEventListener('close', restoreReturn);
    dialog.addEventListener('cancel', () => { /* Native Escape closes and restores the exact origin. */ });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')].filter(item => item.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    function onOnline() { if (engaged || rows.some(row => !row.view?.receipt)) loadConfig().then(sync); }
    function onVisibility() { if (document.visibilityState === 'hidden' && draftDirty) persistDraft().catch(() => {}); }
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    const ready = (async () => {
      try { draft = (await read('meta', metaKey('draft')))?.value || emptyDraft(); await refreshRows(); }
      catch (error) { draft = emptyDraft(); configError = `Report storage is unavailable. ${errorText(error)}`; }
      initialized = true;
      // Ordinary lessons are network-idle. Only a prior pending outbox warrants reconnecting.
      if (rows.some(row => !row.view?.receipt)) loadConfig().then(sync);
    })();
    return {
      ready,
      openReport: () => open('new'),
      openReports: () => open('list'),
      close,
      retry: sync,
      update(next) {
        // A service identity is part of a report's guest session and outbox; never silently rebind it.
        const nextService = normalizeService(next.serviceUrl === undefined ? service : next.serviceUrl);
        if (nextService !== service) { configError = 'The configured service changed. Reload this page to connect it; saved reports retain their original service identity.'; return; }
        options = { ...options, ...next };
      },
      async unmount() {
        if (draftDirty) await persistDraft().catch(() => {});
        disposed = true; close(); clearTimeout(saveTimer); clearTimeout(retryTimer); clearTimeout(pollTimer); clearPreviews();
        window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisibility);
        hostObserver.disconnect();
        root.remove(); (await dbPromise.catch(() => null))?.close(); instance = null;
      }
    };
  }
  window.BunkiReports = Object.freeze({ mount(options = {}) { if (instance) { instance.update(options); return instance; } instance = createClient(options); return instance; } });
})();
