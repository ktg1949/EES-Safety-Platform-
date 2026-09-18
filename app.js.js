import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

(function () {
  "use strict";

  // ---------------- checklist definition ----------------
  var CHECK_CATEGORIES = [
    {id:'reaction', title:'작업자의 반응', items:[
      {id:'r1', label:'개인보호구를 착용하거나 조정함'},
      {id:'r2', label:'작업 자세를 바꿈'},
      {id:'r3', label:'작업 방법을 고침'},
      {id:'r4', label:'LOTO 실시 · 표찰 부착 등'},
      {id:'r5', label:'안전조치를 함 (접지, 전선정리 등)'},
      {id:'r6', label:'기타'}
    ]},
    {id:'ppe', title:'개인보호구 (머리부터 발끝까지)', items:[
      {id:'p1', label:'머리 (안전모)'},
      {id:'p2', label:'눈과 얼굴 (보안경, 보안면 등)'},
      {id:'p3', label:'귀 (귀마개, 커버형 등)'},
      {id:'p4', label:'호흡기 (방진, 방독, 공기호흡기 등)'},
      {id:'p5', label:'손과 팔 (가죽, 절연, 방열장갑 등)'},
      {id:'p6', label:'발 (안전화, 장화 등)'},
      {id:'p7', label:'기타'}
    ]},
    {id:'posture', title:'작업자의 위치와 자세', items:[
      {id:'s1', label:'충돌'},
      {id:'s2', label:'낙하 (물체에 부딪힘)'},
      {id:'s3', label:'협착 (구동기기 등 낀부분)'},
      {id:'s4', label:'추락 (개구부, 난간 등)'},
      {id:'s5', label:'고온·고열·저온물질'},
      {id:'s6', label:'감전 (활선, 충전부 노출)'},
      {id:'s7', label:'질식·중독·유해물질 노출'},
      {id:'s8', label:'화재·폭발 (가연성, 인화성 물질 주변)'}
    ]},
    {id:'tools', title:'작업 도구 및 장비', items:[
      {id:'t1', label:'부적합한 도구, 장비 사용'},
      {id:'t2', label:'정확하게 사용하지 않음'},
      {id:'t3', label:'도구나 장비가 불안전한 상태임'},
      {id:'t4', label:'기타'}
    ]},
    {id:'standard', title:'작업표준 (절차, 수칙)', items:[
      {id:'d1', label:'설정되어 있지 않음'},
      {id:'d2', label:'내용이 적합하지 않음'},
      {id:'d3', label:'내용을 모르고 있음'},
      {id:'d4', label:'작업표준(절차, 수칙)을 준수하지 않음'}
    ]},
    {id:'tidy', title:'정리정돈', items:[
      {id:'o1', label:'기준 미설정 또는 미숙지'},
      {id:'o2', label:'기준을 준수하지 않음'},
      {id:'o3', label:'안전통로에 물건을 방치함'},
      {id:'o4', label:'기타'}
    ]}
  ];
  var ITEM_INDEX = {};
  CHECK_CATEGORIES.forEach(function (cat) { cat.items.forEach(function (it) { ITEM_INDEX[it.id] = {label: it.label, cat: cat.title}; }); });

  var $ = function (id) { return document.getElementById(id); };
  var views = { list: $('view-list'), step1: $('view-step1'), step2: $('view-step2'), detail: $('view-detail') };
  function showView(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== name); });
    window.scrollTo(0, 0);
  }

  function uid() {
    try { return crypto.randomUUID(); } catch (e) { return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2); }
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function byteLen(str) { return new TextEncoder().encode(str || '').length; }
  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---------------- state ----------------
  var records = [];
  var draft = null;
  var currentFilter = 'all';
  var currentSearch = '';

  function emptyChecklist() {
    var c = {};
    CHECK_CATEGORIES.forEach(function (cat) { cat.items.forEach(function (it) { c[it.id] = {checked: false, severity: '경상', detail: ''}; }); });
    return c;
  }

  function newDraft() {
    return {
      id: uid(),
      manageNo: 'SAO-' + todayStr().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      status: 'draft',
      date: todayStr(),
      timeStart: '', timeEnd: '',
      area: '', place: '',
      workType: '조업', shift: '상시',
      workers: '', observer: '',
      content: '',
      checklist: emptyChecklist(),
      praise: '', corrective: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // ---------------- Firebase wiring ----------------
  var db = null;
  var firebaseReady = false;
  var RECORDS_PATH = 'sao_records';

  function setSyncDot(state) {
    var el = $('sync-dot');
    el.classList.remove('busy', 'err');
    if (state === 'busy') el.classList.add('busy');
    if (state === 'err') el.classList.add('err');
  }

  function showSetupBanner(show) {
    var b = $('setup-banner');
    if (b) b.hidden = !show;
  }

  function initFirebase() {
    var isPlaceholder = !firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY' || !firebaseConfig.apiKey;
    if (isPlaceholder) {
      showSetupBanner(true);
      renderList();
      return;
    }
    try {
      var app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      firebaseReady = true;
      var q = query(collection(db, RECORDS_PATH), orderBy('date', 'desc'));
      onSnapshot(q, function (snap) {
        setSyncDot('idle');
        records = [];
        snap.forEach(function (d) { records.push(d.data()); });
        renderList();
        if (draft) {
          var fresh = records.find(function (r) { return r.id === draft.id; });
          if (fresh) draft = Object.assign({}, fresh, {checklist: draft.checklist || fresh.checklist});
        }
      }, function (err) {
        console.warn('sao_records onSnapshot error', err);
        setSyncDot('err');
        toast('데이터 연결에 문제가 있어요. Firebase 설정을 확인해주세요');
      });
    } catch (e) {
      console.warn(e);
      showSetupBanner(true);
      renderList();
    }
  }

  async function saveRecord(rec, opts) {
    rec.updatedAt = new Date().toISOString();
    if (!firebaseReady) {
      var i = records.findIndex(function (r) { return r.id === rec.id; });
      if (i >= 0) records[i] = rec; else records.unshift(rec);
      renderList();
      if (opts && opts.toastMsg) toast(opts.toastMsg + ' (Firebase 미연결 · 이 기기에만 임시 저장됨)');
      return;
    }
    setSyncDot('busy');
    try {
      await setDoc(doc(db, RECORDS_PATH, rec.id), rec);
      if (opts && opts.toastMsg) toast(opts.toastMsg);
    } catch (e) {
      console.warn(e);
      setSyncDot('err');
      toast('저장에 실패했어요. 다시 시도해주세요');
    }
  }

  async function deleteRecord(id) {
    if (!firebaseReady) {
      records = records.filter(function (r) { return r.id !== id; });
      renderList();
      return;
    }
    setSyncDot('busy');
    try { await deleteDoc(doc(db, RECORDS_PATH, id)); }
    catch (e) { setSyncDot('err'); toast('삭제에 실패했어요'); }
  }

  // ---------------- list rendering ----------------
  function unsafeCount(rec) {
    if (!rec.checklist) return 0;
    var n = 0;
    Object.keys(rec.checklist).forEach(function (k) { if (rec.checklist[k] && rec.checklist[k].checked) n++; });
    return n;
  }

  function renderList() {
    var total = records.length;
    var now = new Date();
    var monthCount = records.filter(function (r) {
      var d = new Date(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    var unsafeTotal = records.reduce(function (sum, r) { return sum + unsafeCount(r); }, 0);
    $('stat-total').textContent = total;
    $('stat-month').textContent = monthCount;
    $('stat-unsafe').textContent = unsafeTotal;

    var list = records.slice();
    if (currentFilter === 'draft') list = list.filter(function (r) { return r.status === 'draft'; });
    if (currentFilter === 'done') list = list.filter(function (r) { return r.status === 'submitted'; });
    if (currentFilter === 'unsafe') list = list.filter(function (r) { return unsafeCount(r) > 0; });
    if (currentSearch) {
      var q = currentSearch.toLowerCase();
      list = list.filter(function (r) {
        return (r.area || '').toLowerCase().indexOf(q) > -1 ||
               (r.place || '').toLowerCase().indexOf(q) > -1 ||
               (r.observer || '').toLowerCase().indexOf(q) > -1;
      });
    }

    var root = $('rec-list');
    root.innerHTML = '';
    $('empty-state').hidden = list.length > 0;

    list.forEach(function (r) {
      var uc = unsafeCount(r);
      var card = document.createElement('div');
      card.className = 'rec-card';
      card.innerHTML =
        '<div class="rec-top">' +
          '<span class="rec-date mono">' + escapeHtml(r.date || '') + (r.timeStart ? ' · ' + escapeHtml(r.timeStart) + (r.timeEnd ? '~' + escapeHtml(r.timeEnd) : '') : '') + '</span>' +
          '<span class="badge ' + (r.status === 'submitted' ? 'done' : 'draft') + '">' + (r.status === 'submitted' ? '완료' : '작성중') + '</span>' +
        '</div>' +
        '<div class="rec-place">' + escapeHtml(r.area || '관찰지역 미입력') + (r.place ? ' · ' + escapeHtml(r.place) : '') + '</div>' +
        '<div class="rec-sub">' + escapeHtml(r.observer || '관찰자 미입력') + ' 관찰 · 작업유형 ' + escapeHtml(r.workType || '-') + '</div>' +
        '<div class="rec-meta">' +
          '<span class="tag">' + escapeHtml(r.workType || '-') + '</span>' +
          '<span class="tag">' + escapeHtml(r.shift || '-') + '</span>' +
          (uc > 0 ? '<span class="tag danger">불안전 ' + uc + '건</span>' : '<span class="tag safe">이상 없음</span>') +
        '</div>';
      card.addEventListener('click', function () { openDetail(r.id); });
      root.appendChild(card);
    });
  }

  $('search-input').addEventListener('input', function (e) { currentSearch = e.target.value.trim(); renderList(); });
  $('filter-chips').addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    Array.prototype.forEach.call($('filter-chips').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    currentFilter = btn.getAttribute('data-filter');
    renderList();
  });

  // ---------------- step 1 ----------------
  function pillGroupBind(containerId, onChange) {
    var el = $(containerId);
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.pill-opt');
      if (!btn) return;
      Array.prototype.forEach.call(el.querySelectorAll('.pill-opt'), function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      onChange(btn.getAttribute('data-val'));
    });
  }
  pillGroupBind('f-worktype', function (v) { if (draft) draft.workType = v; });
  pillGroupBind('f-shift', function (v) { if (draft) draft.shift = v; });

  function setPill(containerId, val) {
    var el = $(containerId);
    Array.prototype.forEach.call(el.querySelectorAll('.pill-opt'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-val') === val);
    });
  }

  function fillStep1Form() {
    $('s1-manageno').textContent = draft.manageNo;
    $('f-date').value = draft.date || todayStr();
    $('f-time-start').value = draft.timeStart || '';
    $('f-time-end').value = draft.timeEnd || '';
    $('f-area').value = draft.area || '';
    $('f-place').value = draft.place || '';
    $('f-workers').value = draft.workers || '';
    $('f-observer').value = draft.observer || '';
    $('f-content').value = draft.content || '';
    $('f-content-count').textContent = byteLen(draft.content) + ' / 700 byte';
    setPill('f-worktype', draft.workType || '조업');
    setPill('f-shift', draft.shift || '상시');
  }

  function readStep1Form() {
    draft.date = $('f-date').value || todayStr();
    draft.timeStart = $('f-time-start').value;
    draft.timeEnd = $('f-time-end').value;
    draft.area = $('f-area').value.trim();
    draft.place = $('f-place').value.trim();
    draft.workers = $('f-workers').value;
    draft.observer = $('f-observer').value.trim();
    draft.content = $('f-content').value;
  }

  $('f-content').addEventListener('input', function (e) {
    var n = byteLen(e.target.value);
    var el = $('f-content-count');
    el.textContent = n + ' / 700 byte';
    el.classList.toggle('over', n > 700);
  });

  function openStep1(existing) {
    draft = existing ? JSON.parse(JSON.stringify(existing)) : newDraft();
    if (!draft.checklist) draft.checklist = emptyChecklist();
    fillStep1Form();
    showView('step1');
  }

  $('fab-new').addEventListener('click', function () { openStep1(null); });
  $('s1-cancel').addEventListener('click', function () { draft = null; showView('list'); });
  $('s1-back').addEventListener('click', function () { draft = null; showView('list'); });

  $('s1-next').addEventListener('click', function () {
    readStep1Form();
    if (!draft.area || !draft.place) { toast('관찰지역과 상세장소를 입력해주세요'); return; }
    if (!draft.content) { toast('작업내용을 입력해주세요'); return; }
    saveRecord(draft, {toastMsg: null});
    fillChecklistState();
    fillStep2Form();
    showView('step2');
  });

  // ---------------- step 2 : checklist ----------------
  var checklistBuilt = false;
  function buildChecklistDom() {
    if (checklistBuilt) return;
    var root = $('checklist-root');
    var html = '';
    CHECK_CATEGORIES.forEach(function (cat, ci) {
      html += '<div class="cat" data-cat="' + cat.id + '">' +
        '<div class="cat-head">' +
          '<div class="ti"><span class="cat-num mono">' + (ci + 1) + '</span><h3>' + escapeHtml(cat.title) + '</h3></div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="cat-count" data-catcount="' + cat.id + '">0</span>' +
            '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>' +
          '</div>' +
        '</div>' +
        '<div class="cat-body">';
      cat.items.forEach(function (it) {
        html += '<div class="chk-item" data-item="' + it.id + '">' +
          '<div class="chk-row">' +
            '<span class="chk-box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></span>' +
            '<span class="chk-label">' + escapeHtml(it.label) + '</span>' +
          '</div>' +
          '<div class="chk-detail">' +
            '<div class="sev-row">' +
              '<button type="button" class="sev-btn" data-sev="경상">경상</button>' +
              '<button type="button" class="sev-btn" data-sev="중상">중상</button>' +
              '<button type="button" class="sev-btn" data-sev="사망">사망</button>' +
            '</div>' +
            '<textarea placeholder="불안전한 행동 세부내용을 기록하세요" data-detailfor="' + it.id + '"></textarea>' +
          '</div>' +
        '</div>';
      });
      html += '</div></div>';
    });
    root.innerHTML = html;
    checklistBuilt = true;

    root.addEventListener('click', function (e) {
      var head = e.target.closest('.cat-head');
      if (head) { head.closest('.cat').classList.toggle('open'); return; }
      var sevBtn = e.target.closest('.sev-btn');
      if (sevBtn) {
        var item = sevBtn.closest('.chk-item');
        Array.prototype.forEach.call(item.querySelectorAll('.sev-btn'), function (b) { b.classList.remove('on'); });
        sevBtn.classList.add('on');
        var id = item.getAttribute('data-item');
        draft.checklist[id].severity = sevBtn.getAttribute('data-sev');
        return;
      }
      var row = e.target.closest('.chk-row');
      if (row) {
        var itemEl = row.closest('.chk-item');
        var id2 = itemEl.getAttribute('data-item');
        var checked = !itemEl.classList.contains('checked');
        itemEl.classList.toggle('checked', checked);
        draft.checklist[id2].checked = checked;
        if (checked) itemEl.closest('.cat').classList.add('open');
        updateCatCounts();
        updateSummary();
        return;
      }
    });

    root.addEventListener('input', function (e) {
      var ta = e.target.closest('textarea[data-detailfor]');
      if (ta) {
        var id = ta.getAttribute('data-detailfor');
        draft.checklist[id].detail = ta.value;
      }
    });
  }

  function fillChecklistState() {
    buildChecklistDom();
    var root = $('checklist-root');
    Object.keys(draft.checklist).forEach(function (id) {
      var st = draft.checklist[id];
      var itemEl = root.querySelector('.chk-item[data-item="' + id + '"]');
      if (!itemEl) return;
      itemEl.classList.toggle('checked', !!st.checked);
      Array.prototype.forEach.call(itemEl.querySelectorAll('.sev-btn'), function (b) {
        b.classList.toggle('on', b.getAttribute('data-sev') === st.severity);
      });
      var ta = itemEl.querySelector('textarea[data-detailfor]');
      if (ta) ta.value = st.detail || '';
      if (st.checked) itemEl.closest('.cat').classList.add('open');
    });
    updateCatCounts();
    updateSummary();
  }

  function updateCatCounts() {
    CHECK_CATEGORIES.forEach(function (cat) {
      var n = cat.items.reduce(function (sum, it) { return sum + (draft.checklist[it.id].checked ? 1 : 0); }, 0);
      var el = document.querySelector('[data-catcount="' + cat.id + '"]');
      if (el) { el.textContent = n; el.classList.toggle('has', n > 0); }
    });
  }

  function updateSummary() {
    var n = Object.keys(draft.checklist).reduce(function (sum, k) { return sum + (draft.checklist[k].checked ? 1 : 0); }, 0);
    $('s2-checked-total').textContent = Object.keys(draft.checklist).length;
    $('s2-unsafe-total').textContent = n;
  }

  function fillStep2Form() {
    $('f-praise').value = draft.praise || '';
    $('f-corrective').value = draft.corrective || '';
  }
  function readStep2Form() {
    draft.praise = $('f-praise').value;
    draft.corrective = $('f-corrective').value;
  }

  $('s2-back').addEventListener('click', function () {
    readStep2Form();
    saveRecord(draft, {toastMsg: null});
    fillStep1Form();
    showView('step1');
  });

  $('s2-save-draft').addEventListener('click', function () {
    readStep2Form();
    draft.status = 'draft';
    saveRecord(draft, {toastMsg: '임시저장했어요'});
    showView('list');
  });

  $('s2-submit').addEventListener('click', function () {
    readStep2Form();
    draft.status = 'submitted';
    saveRecord(draft, {toastMsg: '관찰 기록을 제출했어요'});
    showView('list');
  });

  // ---------------- detail ----------------
  var detailId = null;
  function openDetail(id) {
    var r = records.find(function (x) { return x.id === id; });
    if (!r) return;
    detailId = id;
    $('d-eyebrow').textContent = r.manageNo || 'SAO 기록';
    var uc = unsafeCount(r);

    var unsafeItemsHtml = '';
    Object.keys(r.checklist || {}).forEach(function (k) {
      var st = r.checklist[k];
      if (!st || !st.checked) return;
      var meta = ITEM_INDEX[k] || {label: k, cat: ''};
      unsafeItemsHtml += '<div class="unsafe-item">' +
        '<div class="u-top"><span class="u-name">' + escapeHtml(meta.label) + '</span><span class="sev-tag ' + escapeHtml(st.severity || '경상') + '">' + escapeHtml(st.severity || '경상') + '</span></div>' +
        '<div class="u-cat">' + escapeHtml(meta.cat) + '</div>' +
        (st.detail ? '<div class="u-detail">' + escapeHtml(st.detail) + '</div>' : '') +
        '</div>';
    });

    var html =
      '<div class="detail-hero">' +
        '<div class="detail-row"><span class="k">상태</span><span class="v">' + (r.status === 'submitted' ? '완료' : '작성중') + '</span></div>' +
        '<div class="detail-row"><span class="k">관찰일자</span><span class="v mono">' + escapeHtml(r.date || '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">관찰시간</span><span class="v mono">' + (r.timeStart ? escapeHtml(r.timeStart) + ' ~ ' + escapeHtml(r.timeEnd || '') : '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">관찰지역</span><span class="v">' + escapeHtml(r.area || '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">상세장소</span><span class="v">' + escapeHtml(r.place || '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">작업유형</span><span class="v">' + escapeHtml(r.workType || '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">근무형태</span><span class="v">' + escapeHtml(r.shift || '-') + '</span></div>' +
        '<div class="detail-row"><span class="k">작업인원</span><span class="v">' + escapeHtml(String(r.workers || '-')) + '명</span></div>' +
        '<div class="detail-row"><span class="k">관찰자</span><span class="v">' + escapeHtml(r.observer || '-') + '</span></div>' +
      '</div>' +
      '<div class="card"><div class="section-title"><span class="dot"></span>작업내용</div><div class="detail-text">' + escapeHtml(r.content || '작성된 내용이 없습니다') + '</div></div>' +
      '<div class="card"><div class="section-title"><span class="dot"></span>불안전 행동 (' + uc + '건)</div>' +
        (uc > 0 ? unsafeItemsHtml : '<div class="detail-text" style="color:var(--safe);font-weight:700">관찰 중 불안전한 행동이 발견되지 않았습니다</div>') +
      '</div>' +
      '<div class="card"><div class="section-title"><span class="dot"></span>격려한 안전행동</div><div class="detail-text">' + escapeHtml(r.praise || '작성된 내용이 없습니다') + '</div></div>' +
      '<div class="card"><div class="section-title"><span class="dot"></span>시정 및 재발방지 조치</div><div class="detail-text">' + escapeHtml(r.corrective || '작성된 내용이 없습니다') + '</div></div>';

    $('detail-content').innerHTML = html;
    showView('detail');
  }

  $('d-back').addEventListener('click', function () { detailId = null; showView('list'); });
  $('d-close').addEventListener('click', function () { detailId = null; showView('list'); });
  $('d-edit').addEventListener('click', function () {
    var r = records.find(function (x) { return x.id === detailId; });
    if (r) openStep1(r);
  });
  $('d-delete').addEventListener('click', function () {
    if (!detailId) return;
    if (confirm('이 관찰 기록을 삭제할까요? 되돌릴 수 없어요.')) {
      deleteRecord(detailId);
      showView('list');
    }
  });

  // ---------------- init ----------------
  showView('list');
  renderList();
  initFirebase();

})();
