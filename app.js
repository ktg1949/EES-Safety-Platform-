import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

(function () {
  "use strict";

  // ================= checklist definitions =================
  var SAO_CATEGORIES = [
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

  var INSP_CATEGORIES = [
    {id:'prep', title:'작업 전 준비', items:[
      {id:'i1', label:'TBM(작업 전 안전교육) 실시 여부'},
      {id:'i2', label:'위험성평가 결과 공유 여부'},
      {id:'i3', label:'작업허가서 · 신고서 확인'},
      {id:'i4', label:'작업자 건강상태 확인'}
    ]},
    {id:'ppe', title:'개인보호구', items:[
      {id:'i5', label:'안전모 착용 상태'},
      {id:'i6', label:'안전화 착용 상태'},
      {id:'i7', label:'보호장갑 · 보안경 등 작업별 보호구'},
      {id:'i8', label:'호흡보호구(필요 시) 착용 상태'}
    ]},
    {id:'equip', title:'기계 · 설비 안전', items:[
      {id:'i9', label:'방호장치 · 안전장치 정상 작동'},
      {id:'i10', label:'비상정지장치 작동 확인'},
      {id:'i11', label:'정기점검 · 정비 이력 확인'},
      {id:'i12', label:'노후 · 결함 설비 여부'}
    ]},
    {id:'electric', title:'전기 · 화기작업', items:[
      {id:'i13', label:'접지 및 누전차단기 상태'},
      {id:'i14', label:'화기작업 허가서 및 감시인 배치'},
      {id:'i15', label:'밀폐공간 가스농도 측정'},
      {id:'i16', label:'소화기 비치 및 사용 가능 상태'}
    ]},
    {id:'fall', title:'추락 · 낙하 방지', items:[
      {id:'i17', label:'안전대 착용 및 걸이설비 설치'},
      {id:'i18', label:'안전난간 · 덮개 설치 상태'},
      {id:'i19', label:'개구부 · 단부 방호 조치'},
      {id:'i20', label:'중량물 낙하방지 조치'}
    ]},
    {id:'tidy', title:'정리정돈 및 비상대응', items:[
      {id:'i21', label:'통로 확보 및 장애물 정리'},
      {id:'i22', label:'비상구 · 대피로 확보'},
      {id:'i23', label:'소화설비 접근성'},
      {id:'i24', label:'MSDS 비치 및 경고표지 부착'}
    ]}
  ];

  var MODULES = {
    sao: {
      key: 'sao',
      label: '안전행동관찰(SAO)',
      collection: 'sao_records',
      prefix: 'SAO',
      itemMode: 'severity',
      categories: SAO_CATEGORIES
    },
    insp: {
      key: 'insp',
      label: '관리감독자 점검',
      collection: 'supervisor_inspections',
      prefix: 'INS',
      itemMode: 'result',
      categories: INSP_CATEGORIES
    }
  };

  function buildItemIndex(categories) {
    var idx = {};
    categories.forEach(function (cat) { cat.items.forEach(function (it) { idx[it.id] = {label: it.label, cat: cat.title}; }); });
    return idx;
  }
  MODULES.sao.itemIndex = buildItemIndex(SAO_CATEGORIES);
  MODULES.insp.itemIndex = buildItemIndex(INSP_CATEGORIES);

  // ================= helpers =================
  var $ = function (id) { return document.getElementById(id); };
  var VIEW_IDS = ['home', 'sao-list', 'sao-step1', 'sao-step2', 'sao-detail', 'insp-list', 'insp-step1', 'insp-step2', 'insp-detail'];
  var views = {};
  VIEW_IDS.forEach(function (v) { views[v] = $('view-' + v); });
  function showView(name) {
    VIEW_IDS.forEach(function (k) { views[k].hidden = (k !== name); });
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

  // ================= state =================
  var records = {sao: [], insp: []};
  var draft = null;        // record currently being edited
  var draftModule = null;  // 'sao' | 'insp'
  var listState = {
    sao: {filter: 'all', search: ''},
    insp: {filter: 'all', search: ''}
  };

  function emptyChecklist(moduleKey) {
    var mod = MODULES[moduleKey];
    var c = {};
    mod.categories.forEach(function (cat) {
      cat.items.forEach(function (it) {
        c[it.id] = mod.itemMode === 'severity'
          ? {checked: false, severity: '경상', detail: ''}
          : {result: '', note: ''};
      });
    });
    return c;
  }

  function newDraft(moduleKey) {
    var mod = MODULES[moduleKey];
    var base = {
      id: uid(),
      manageNo: mod.prefix + '-' + todayStr().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      status: 'draft',
      date: todayStr(),
      timeStart: '', timeEnd: '',
      area: '', place: '',
      content: '',
      checklist: emptyChecklist(moduleKey),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (moduleKey === 'sao') {
      base.workType = '조업';
      base.shift = '상시';
      base.workers = '';
      base.observer = '';
      base.praise = '';
      base.corrective = '';
    } else {
      base.inspType = '정기점검';
      base.target = '';
      base.inspector = '';
      base.action = '';
      base.note = '';
    }
    return base;
  }

  // ================= Firebase wiring =================
  var db = null;
  var firebaseReady = false;

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

  function renderAll() {
    renderHome();
    renderList('sao');
    renderList('insp');
  }

  function initFirebase() {
    var isPlaceholder = !firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY' || !firebaseConfig.apiKey;
    if (isPlaceholder) {
      showSetupBanner(true);
      renderAll();
      return;
    }
    try {
      var app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      firebaseReady = true;
      Object.keys(MODULES).forEach(function (moduleKey) {
        var mod = MODULES[moduleKey];
        var q = query(collection(db, mod.collection), orderBy('date', 'desc'));
        onSnapshot(q, function (snap) {
          setSyncDot('idle');
          records[moduleKey] = [];
          snap.forEach(function (d) { records[moduleKey].push(d.data()); });
          renderAll();
          if (draft && draftModule === moduleKey) {
            var fresh = records[moduleKey].find(function (r) { return r.id === draft.id; });
            if (fresh) draft = Object.assign({}, fresh, {checklist: draft.checklist || fresh.checklist});
          }
        }, function (err) {
          console.warn(mod.collection + ' onSnapshot error', err);
          setSyncDot('err');
          toast('데이터 연결에 문제가 있어요. Firebase 설정을 확인해주세요');
        });
      });
    } catch (e) {
      console.warn(e);
      showSetupBanner(true);
      renderAll();
    }
  }

  async function saveRecord(moduleKey, rec, opts) {
    var mod = MODULES[moduleKey];
    rec.updatedAt = new Date().toISOString();
    if (!firebaseReady) {
      var i = records[moduleKey].findIndex(function (r) { return r.id === rec.id; });
      if (i >= 0) records[moduleKey][i] = rec; else records[moduleKey].unshift(rec);
      renderAll();
      if (opts && opts.toastMsg) toast(opts.toastMsg + ' (Firebase 미연결 · 이 기기에만 임시 저장됨)');
      return;
    }
    setSyncDot('busy');
    try {
      await setDoc(doc(db, mod.collection, rec.id), rec);
      if (opts && opts.toastMsg) toast(opts.toastMsg);
    } catch (e) {
      console.warn(e);
      setSyncDot('err');
      toast('저장에 실패했어요. 다시 시도해주세요');
    }
  }

  async function deleteRecord(moduleKey, id) {
    var mod = MODULES[moduleKey];
    if (!firebaseReady) {
      records[moduleKey] = records[moduleKey].filter(function (r) { return r.id !== id; });
      renderAll();
      return;
    }
    setSyncDot('busy');
    try { await deleteDoc(doc(db, mod.collection, id)); }
    catch (e) { setSyncDot('err'); toast('삭제에 실패했어요'); }
  }

  // ================= counting helpers =================
  function issueCount(moduleKey, rec) {
    if (!rec.checklist) return 0;
    var mod = MODULES[moduleKey];
    var n = 0;
    Object.keys(rec.checklist).forEach(function (k) {
      var st = rec.checklist[k];
      if (!st) return;
      if (mod.itemMode === 'severity') { if (st.checked) n++; }
      else { if (st.result === '미흡' || st.result === '불량') n++; }
    });
    return n;
  }

  function monthCount(list) {
    var now = new Date();
    return list.filter(function (r) {
      var d = new Date(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }

  // ================= home dashboard =================
  function renderHome() {
    var saoList = records.sao, inspList = records.insp;
    $('home-sao-total').textContent = saoList.length;
    $('home-sao-month').textContent = monthCount(saoList);
    $('home-sao-unsafe').textContent = saoList.reduce(function (s, r) { return s + issueCount('sao', r); }, 0);

    $('home-insp-total').textContent = inspList.length;
    $('home-insp-month').textContent = monthCount(inspList);
    $('home-insp-issue').textContent = inspList.reduce(function (s, r) { return s + issueCount('insp', r); }, 0);

    var combined = saoList.map(function (r) { return {rec: r, mod: 'sao'}; })
      .concat(inspList.map(function (r) { return {rec: r, mod: 'insp'}; }));
    combined.sort(function (a, b) { return (b.rec.updatedAt || '').localeCompare(a.rec.updatedAt || ''); });
    combined = combined.slice(0, 6);

    var root = $('recent-list');
    root.innerHTML = '';
    $('recent-empty').hidden = combined.length > 0;

    combined.forEach(function (entry) {
      var r = entry.rec, moduleKey = entry.mod;
      var title = moduleKey === 'sao'
        ? (r.area || '관찰지역 미입력') + (r.place ? ' · ' + r.place : '')
        : (r.area || '점검지역 미입력') + (r.place ? ' · ' + r.place : '');
      var sub = r.date + (moduleKey === 'sao' ? ' · ' + (r.observer || '관찰자 미입력') : ' · ' + (r.inspector || '점검자 미입력'));
      var div = document.createElement('div');
      div.className = 'recent-item';
      div.innerHTML =
        '<span class="recent-dot ' + moduleKey + '"></span>' +
        '<div class="recent-body"><div class="recent-title">' + escapeHtml(title) + '</div><div class="recent-sub">' + escapeHtml(sub) + '</div></div>' +
        '<span class="recent-badge ' + (r.status === 'submitted' ? 'done' : 'draft') + '">' + (r.status === 'submitted' ? '완료' : '작성중') + '</span>';
      div.addEventListener('click', function () { openDetail(moduleKey, r.id); });
      root.appendChild(div);
    });
  }

  $('home-sao-list').addEventListener('click', function () { showView('sao-list'); });
  $('home-insp-list').addEventListener('click', function () { showView('insp-list'); });
  $('home-sao-new').addEventListener('click', function () { openStep1('sao', null); });
  $('home-insp-new').addEventListener('click', function () { openStep1('insp', null); });
  $('sao-list-home').addEventListener('click', function () { showView('home'); });
  $('insp-list-home').addEventListener('click', function () { showView('home'); });

  // ================= list rendering =================
  function renderList(moduleKey) {
    var mod = MODULES[moduleKey];
    var list = records[moduleKey];
    var st = listState[moduleKey];

    if (moduleKey === 'sao') {
      $('stat-sao-total').textContent = list.length;
      $('stat-sao-month').textContent = monthCount(list);
      $('stat-sao-unsafe').textContent = list.reduce(function (s, r) { return s + issueCount('sao', r); }, 0);
    } else {
      $('stat-insp-total').textContent = list.length;
      $('stat-insp-month').textContent = monthCount(list);
      $('stat-insp-issue').textContent = list.reduce(function (s, r) { return s + issueCount('insp', r); }, 0);
    }

    var filtered = list.slice();
    if (st.filter === 'draft') filtered = filtered.filter(function (r) { return r.status === 'draft'; });
    if (st.filter === 'done') filtered = filtered.filter(function (r) { return r.status === 'submitted'; });
    if (st.filter === 'unsafe' || st.filter === 'issue') filtered = filtered.filter(function (r) { return issueCount(moduleKey, r) > 0; });
    if (st.search) {
      var q = st.search.toLowerCase();
      filtered = filtered.filter(function (r) {
        var person = moduleKey === 'sao' ? r.observer : (r.inspector + ' ' + (r.target || ''));
        return (r.area || '').toLowerCase().indexOf(q) > -1 ||
               (r.place || '').toLowerCase().indexOf(q) > -1 ||
               (person || '').toLowerCase().indexOf(q) > -1;
      });
    }

    var rootId = moduleKey === 'sao' ? 'sao-rec-list' : 'insp-rec-list';
    var emptyId = moduleKey === 'sao' ? 'sao-empty-state' : 'insp-empty-state';
    var root = $(rootId);
    root.innerHTML = '';
    $(emptyId).hidden = filtered.length > 0;

    filtered.forEach(function (r) {
      var n = issueCount(moduleKey, r);
      var card = document.createElement('div');
      card.className = 'rec-card';
      if (moduleKey === 'sao') {
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
            (n > 0 ? '<span class="tag danger">불안전 ' + n + '건</span>' : '<span class="tag safe">이상 없음</span>') +
          '</div>';
      } else {
        card.innerHTML =
          '<div class="rec-top">' +
            '<span class="rec-date mono">' + escapeHtml(r.date || '') + (r.timeStart ? ' · ' + escapeHtml(r.timeStart) + (r.timeEnd ? '~' + escapeHtml(r.timeEnd) : '') : '') + '</span>' +
            '<span class="badge ' + (r.status === 'submitted' ? 'done' : 'draft') + '">' + (r.status === 'submitted' ? '완료' : '작성중') + '</span>' +
          '</div>' +
          '<div class="rec-place">' + escapeHtml(r.area || '점검지역 미입력') + (r.place ? ' · ' + escapeHtml(r.place) : '') + '</div>' +
          '<div class="rec-sub">' + escapeHtml(r.inspector || '점검자 미입력') + ' 점검 · ' + escapeHtml(r.target || '대상 미입력') + '</div>' +
          '<div class="rec-meta">' +
            '<span class="tag">' + escapeHtml(r.inspType || '-') + '</span>' +
            (n > 0 ? '<span class="tag danger">미흡·불량 ' + n + '건</span>' : '<span class="tag safe">이상 없음</span>') +
          '</div>';
      }
      card.addEventListener('click', function () { openDetail(moduleKey, r.id); });
      root.appendChild(card);
    });
  }

  $('sao-search-input').addEventListener('input', function (e) { listState.sao.search = e.target.value.trim(); renderList('sao'); });
  $('insp-search-input').addEventListener('input', function (e) { listState.insp.search = e.target.value.trim(); renderList('insp'); });
  $('sao-filter-chips').addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    Array.prototype.forEach.call($('sao-filter-chips').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    listState.sao.filter = btn.getAttribute('data-filter');
    renderList('sao');
  });
  $('insp-filter-chips').addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    Array.prototype.forEach.call($('insp-filter-chips').querySelectorAll('.chip'), function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    listState.insp.filter = btn.getAttribute('data-filter');
    renderList('insp');
  });

  // ================= step 1 (shared helpers) =================
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
  function setPill(containerId, val) {
    var el = $(containerId);
    Array.prototype.forEach.call(el.querySelectorAll('.pill-opt'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-val') === val);
    });
  }

  pillGroupBind('sao-f-worktype', function (v) { if (draft) draft.workType = v; });
  pillGroupBind('sao-f-shift', function (v) { if (draft) draft.shift = v; });
  pillGroupBind('insp-f-type', function (v) { if (draft) draft.inspType = v; });

  function fillSaoStep1() {
    $('sao-s1-manageno').textContent = draft.manageNo;
    $('sao-f-date').value = draft.date || todayStr();
    $('sao-f-time-start').value = draft.timeStart || '';
    $('sao-f-time-end').value = draft.timeEnd || '';
    $('sao-f-area').value = draft.area || '';
    $('sao-f-place').value = draft.place || '';
    $('sao-f-workers').value = draft.workers || '';
    $('sao-f-observer').value = draft.observer || '';
    $('sao-f-content').value = draft.content || '';
    $('sao-f-content-count').textContent = byteLen(draft.content) + ' / 700 byte';
    setPill('sao-f-worktype', draft.workType || '조업');
    setPill('sao-f-shift', draft.shift || '상시');
  }
  function readSaoStep1() {
    draft.date = $('sao-f-date').value || todayStr();
    draft.timeStart = $('sao-f-time-start').value;
    draft.timeEnd = $('sao-f-time-end').value;
    draft.area = $('sao-f-area').value.trim();
    draft.place = $('sao-f-place').value.trim();
    draft.workers = $('sao-f-workers').value;
    draft.observer = $('sao-f-observer').value.trim();
    draft.content = $('sao-f-content').value;
  }

  function fillInspStep1() {
    $('insp-s1-manageno').textContent = draft.manageNo;
    $('insp-f-date').value = draft.date || todayStr();
    $('insp-f-time-start').value = draft.timeStart || '';
    $('insp-f-time-end').value = draft.timeEnd || '';
    $('insp-f-area').value = draft.area || '';
    $('insp-f-place').value = draft.place || '';
    $('insp-f-target').value = draft.target || '';
    $('insp-f-inspector').value = draft.inspector || '';
    $('insp-f-content').value = draft.content || '';
    $('insp-f-content-count').textContent = byteLen(draft.content) + ' / 700 byte';
    setPill('insp-f-type', draft.inspType || '정기점검');
  }
  function readInspStep1() {
    draft.date = $('insp-f-date').value || todayStr();
    draft.timeStart = $('insp-f-time-start').value;
    draft.timeEnd = $('insp-f-time-end').value;
    draft.area = $('insp-f-area').value.trim();
    draft.place = $('insp-f-place').value.trim();
    draft.target = $('insp-f-target').value.trim();
    draft.inspector = $('insp-f-inspector').value.trim();
    draft.content = $('insp-f-content').value;
  }

  $('sao-f-content').addEventListener('input', function (e) {
    var n = byteLen(e.target.value);
    var el = $('sao-f-content-count');
    el.textContent = n + ' / 700 byte';
    el.classList.toggle('over', n > 700);
  });
  $('insp-f-content').addEventListener('input', function (e) {
    var n = byteLen(e.target.value);
    var el = $('insp-f-content-count');
    el.textContent = n + ' / 700 byte';
    el.classList.toggle('over', n > 700);
  });

  function openStep1(moduleKey, existing) {
    draftModule = moduleKey;
    draft = existing ? JSON.parse(JSON.stringify(existing)) : newDraft(moduleKey);
    if (!draft.checklist) draft.checklist = emptyChecklist(moduleKey);
    if (moduleKey === 'sao') { fillSaoStep1(); showView('sao-step1'); }
    else { fillInspStep1(); showView('insp-step1'); }
  }

  $('sao-fab-new').addEventListener('click', function () { openStep1('sao', null); });
  $('insp-fab-new').addEventListener('click', function () { openStep1('insp', null); });
  $('sao-s1-cancel').addEventListener('click', function () { draft = null; showView('sao-list'); });
  $('sao-s1-back').addEventListener('click', function () { draft = null; showView('sao-list'); });
  $('insp-s1-cancel').addEventListener('click', function () { draft = null; showView('insp-list'); });
  $('insp-s1-back').addEventListener('click', function () { draft = null; showView('insp-list'); });

  $('sao-s1-next').addEventListener('click', function () {
    readSaoStep1();
    if (!draft.area || !draft.place) { toast('관찰지역과 상세장소를 입력해주세요'); return; }
    if (!draft.content) { toast('작업내용을 입력해주세요'); return; }
    saveRecord('sao', draft, {toastMsg: null});
    fillChecklist('sao');
    fillSaoStep2Extra();
    showView('sao-step2');
  });

  $('insp-s1-next').addEventListener('click', function () {
    readInspStep1();
    if (!draft.area || !draft.place) { toast('점검지역과 상세장소를 입력해주세요'); return; }
    if (!draft.content) { toast('점검내용을 입력해주세요'); return; }
    saveRecord('insp', draft, {toastMsg: null});
    fillChecklist('insp');
    fillInspStep2Extra();
    showView('insp-step2');
  });

  // ================= step 2 : checklist (generic) =================
  var builtChecklists = {sao: false, insp: false};

  function checklistRootId(moduleKey) { return moduleKey === 'sao' ? 'sao-checklist-root' : 'insp-checklist-root'; }

  function buildChecklistDom(moduleKey) {
    if (builtChecklists[moduleKey]) return;
    var mod = MODULES[moduleKey];
    var root = $(checklistRootId(moduleKey));
    var html = '';
    mod.categories.forEach(function (cat, ci) {
      html += '<div class="cat" data-cat="' + cat.id + '">' +
        '<div class="cat-head">' +
          '<div class="ti"><span class="cat-num mono">' + (ci + 1) + '</span><h3>' + escapeHtml(cat.title) + '</h3></div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="cat-count" data-catcount="' + moduleKey + '-' + cat.id + '">0</span>' +
            '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>' +
          '</div>' +
        '</div>' +
        '<div class="cat-body">';
      cat.items.forEach(function (it) {
        if (mod.itemMode === 'severity') {
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
        } else {
          html += '<div class="chk-item result-item" data-item="' + it.id + '">' +
            '<div class="chk-row">' +
              '<span class="chk-label">' + escapeHtml(it.label) + '</span>' +
            '</div>' +
            '<div class="result-row">' +
              '<button type="button" class="result-btn ok" data-result="양호">양호</button>' +
              '<button type="button" class="result-btn warn" data-result="미흡">미흡</button>' +
              '<button type="button" class="result-btn bad" data-result="불량">불량</button>' +
              '<button type="button" class="result-btn na" data-result="해당없음">해당없음</button>' +
            '</div>' +
            '<div class="result-note"><textarea placeholder="미흡·불량 사유 및 조치사항을 기록하세요" data-notefor="' + it.id + '"></textarea></div>' +
          '</div>';
        }
      });
      html += '</div></div>';
    });
    root.innerHTML = html;
    builtChecklists[moduleKey] = true;

    root.addEventListener('click', function (e) {
      var head = e.target.closest('.cat-head');
      if (head) { head.closest('.cat').classList.toggle('open'); return; }

      var sevBtn = e.target.closest('.sev-btn');
      if (sevBtn) {
        var sevItem = sevBtn.closest('.chk-item');
        Array.prototype.forEach.call(sevItem.querySelectorAll('.sev-btn'), function (b) { b.classList.remove('on'); });
        sevBtn.classList.add('on');
        draft.checklist[sevItem.getAttribute('data-item')].severity = sevBtn.getAttribute('data-sev');
        return;
      }

      var resultBtn = e.target.closest('.result-btn');
      if (resultBtn) {
        var resItem = resultBtn.closest('.chk-item');
        var resId = resItem.getAttribute('data-item');
        var val = resultBtn.getAttribute('data-result');
        Array.prototype.forEach.call(resItem.querySelectorAll('.result-btn'), function (b) { b.classList.remove('on'); });
        resultBtn.classList.add('on');
        draft.checklist[resId].result = val;
        resItem.classList.add('answered');
        resItem.classList.toggle('show-note', val === '미흡' || val === '불량');
        updateCatCounts(moduleKey);
        updateSummary(moduleKey);
        return;
      }

      var row = e.target.closest('.chk-row');
      if (row && !row.closest('.result-item')) {
        var itemEl = row.closest('.chk-item');
        var id2 = itemEl.getAttribute('data-item');
        var checked = !itemEl.classList.contains('checked');
        itemEl.classList.toggle('checked', checked);
        draft.checklist[id2].checked = checked;
        if (checked) itemEl.closest('.cat').classList.add('open');
        updateCatCounts(moduleKey);
        updateSummary(moduleKey);
        return;
      }
    });

    root.addEventListener('input', function (e) {
      var ta = e.target.closest('textarea[data-detailfor]');
      if (ta) { draft.checklist[ta.getAttribute('data-detailfor')].detail = ta.value; return; }
      var ta2 = e.target.closest('textarea[data-notefor]');
      if (ta2) { draft.checklist[ta2.getAttribute('data-notefor')].note = ta2.value; return; }
    });
  }

  function fillChecklist(moduleKey) {
    buildChecklistDom(moduleKey);
    var mod = MODULES[moduleKey];
    var root = $(checklistRootId(moduleKey));
    Object.keys(draft.checklist).forEach(function (id) {
      var st = draft.checklist[id];
      var itemEl = root.querySelector('.chk-item[data-item="' + id + '"]');
      if (!itemEl) return;
      if (mod.itemMode === 'severity') {
        itemEl.classList.toggle('checked', !!st.checked);
        Array.prototype.forEach.call(itemEl.querySelectorAll('.sev-btn'), function (b) {
          b.classList.toggle('on', b.getAttribute('data-sev') === st.severity);
        });
        var ta = itemEl.querySelector('textarea[data-detailfor]');
        if (ta) ta.value = st.detail || '';
        if (st.checked) itemEl.closest('.cat').classList.add('open');
      } else {
        Array.prototype.forEach.call(itemEl.querySelectorAll('.result-btn'), function (b) {
          b.classList.toggle('on', b.getAttribute('data-result') === st.result);
        });
        itemEl.classList.toggle('answered', !!st.result);
        itemEl.classList.toggle('show-note', st.result === '미흡' || st.result === '불량');
        var ta2 = itemEl.querySelector('textarea[data-notefor]');
        if (ta2) ta2.value = st.note || '';
      }
    });
    updateCatCounts(moduleKey);
    updateSummary(moduleKey);
  }

  function updateCatCounts(moduleKey) {
    var mod = MODULES[moduleKey];
    mod.categories.forEach(function (cat) {
      var n = cat.items.reduce(function (sum, it) {
        var st = draft.checklist[it.id];
        if (mod.itemMode === 'severity') return sum + (st.checked ? 1 : 0);
        return sum + ((st.result === '미흡' || st.result === '불량') ? 1 : 0);
      }, 0);
      var el = document.querySelector('[data-catcount="' + moduleKey + '-' + cat.id + '"]');
      if (el) { el.textContent = n; el.classList.toggle('has', n > 0); }
    });
  }

  function updateSummary(moduleKey) {
    var mod = MODULES[moduleKey];
    var n = Object.keys(draft.checklist).reduce(function (sum, k) {
      var st = draft.checklist[k];
      if (mod.itemMode === 'severity') return sum + (st.checked ? 1 : 0);
      return sum + ((st.result === '미흡' || st.result === '불량') ? 1 : 0);
    }, 0);
    var total = Object.keys(draft.checklist).length;
    if (moduleKey === 'sao') {
      $('sao-s2-total').textContent = total;
      $('sao-s2-unsafe').textContent = n;
    } else {
      $('insp-s2-total').textContent = total;
      $('insp-s2-issue').textContent = n;
    }
  }

  function fillSaoStep2Extra() {
    $('sao-f-praise').value = draft.praise || '';
    $('sao-f-corrective').value = draft.corrective || '';
  }
  function fillInspStep2Extra() {
    $('insp-f-action').value = draft.action || '';
    $('insp-f-note').value = draft.note || '';
  }

  $('sao-s2-back').addEventListener('click', function () {
    draft.praise = $('sao-f-praise').value;
    draft.corrective = $('sao-f-corrective').value;
    saveRecord('sao', draft, {toastMsg: null});
    fillSaoStep1();
    showView('sao-step1');
  });
  $('sao-s2-save-draft').addEventListener('click', function () {
    draft.praise = $('sao-f-praise').value;
    draft.corrective = $('sao-f-corrective').value;
    draft.status = 'draft';
    saveRecord('sao', draft, {toastMsg: '임시저장했어요'});
    showView('sao-list');
  });
  $('sao-s2-submit').addEventListener('click', function () {
    draft.praise = $('sao-f-praise').value;
    draft.corrective = $('sao-f-corrective').value;
    draft.status = 'submitted';
    saveRecord('sao', draft, {toastMsg: '관찰 기록을 제출했어요'});
    showView('sao-list');
  });

  $('insp-s2-back').addEventListener('click', function () {
    draft.action = $('insp-f-action').value;
    draft.note = $('insp-f-note').value;
    saveRecord('insp', draft, {toastMsg: null});
    fillInspStep1();
    showView('insp-step1');
  });
  $('insp-s2-save-draft').addEventListener('click', function () {
    draft.action = $('insp-f-action').value;
    draft.note = $('insp-f-note').value;
    draft.status = 'draft';
    saveRecord('insp', draft, {toastMsg: '임시저장했어요'});
    showView('insp-list');
  });
  $('insp-s2-submit').addEventListener('click', function () {
    draft.action = $('insp-f-action').value;
    draft.note = $('insp-f-note').value;
    draft.status = 'submitted';
    saveRecord('insp', draft, {toastMsg: '점검 기록을 제출했어요'});
    showView('insp-list');
  });

  // ================= detail =================
  var detailId = null;
  var detailModule = null;

  function openDetail(moduleKey, id) {
    var r = records[moduleKey].find(function (x) { return x.id === id; });
    if (!r) return;
    detailId = id;
    detailModule = moduleKey;
    var mod = MODULES[moduleKey];
    var n = issueCount(moduleKey, r);

    if (moduleKey === 'sao') {
      $('sao-d-eyebrow').textContent = r.manageNo || 'SAO 기록';
      var unsafeItemsHtml = '';
      Object.keys(r.checklist || {}).forEach(function (k) {
        var st = r.checklist[k];
        if (!st || !st.checked) return;
        var meta = mod.itemIndex[k] || {label: k, cat: ''};
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
        '<div class="card"><div class="section-title"><span class="dot"></span>불안전 행동 (' + n + '건)</div>' +
          (n > 0 ? unsafeItemsHtml : '<div class="detail-text" style="color:var(--safe);font-weight:700">관찰 중 불안전한 행동이 발견되지 않았습니다</div>') +
        '</div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>격려한 안전행동</div><div class="detail-text">' + escapeHtml(r.praise || '작성된 내용이 없습니다') + '</div></div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>시정 및 재발방지 조치</div><div class="detail-text">' + escapeHtml(r.corrective || '작성된 내용이 없습니다') + '</div></div>';
      $('sao-detail-content').innerHTML = html;
      showView('sao-detail');
    } else {
      $('insp-d-eyebrow').textContent = r.manageNo || '점검 기록';
      var issueItemsHtml = '';
      Object.keys(r.checklist || {}).forEach(function (k) {
        var st = r.checklist[k];
        if (!st || !(st.result === '미흡' || st.result === '불량')) return;
        var meta = mod.itemIndex[k] || {label: k, cat: ''};
        issueItemsHtml += '<div class="unsafe-item">' +
          '<div class="u-top"><span class="u-name">' + escapeHtml(meta.label) + '</span><span class="sev-tag ' + (st.result === '불량' ? '중상' : '경상') + '">' + escapeHtml(st.result) + '</span></div>' +
          '<div class="u-cat">' + escapeHtml(meta.cat) + '</div>' +
          (st.note ? '<div class="u-detail">' + escapeHtml(st.note) + '</div>' : '') +
          '</div>';
      });
      var html2 =
        '<div class="detail-hero">' +
          '<div class="detail-row"><span class="k">상태</span><span class="v">' + (r.status === 'submitted' ? '완료' : '작성중') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검일자</span><span class="v mono">' + escapeHtml(r.date || '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검시간</span><span class="v mono">' + (r.timeStart ? escapeHtml(r.timeStart) + ' ~ ' + escapeHtml(r.timeEnd || '') : '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검지역</span><span class="v">' + escapeHtml(r.area || '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">상세장소</span><span class="v">' + escapeHtml(r.place || '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검구분</span><span class="v">' + escapeHtml(r.inspType || '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검대상</span><span class="v">' + escapeHtml(r.target || '-') + '</span></div>' +
          '<div class="detail-row"><span class="k">점검자</span><span class="v">' + escapeHtml(r.inspector || '-') + '</span></div>' +
        '</div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>점검내용</div><div class="detail-text">' + escapeHtml(r.content || '작성된 내용이 없습니다') + '</div></div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>미흡·불량 항목 (' + n + '건)</div>' +
          (n > 0 ? issueItemsHtml : '<div class="detail-text" style="color:var(--safe);font-weight:700">미흡·불량 사항이 발견되지 않았습니다</div>') +
        '</div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>개선조치 계획</div><div class="detail-text">' + escapeHtml(r.action || '작성된 내용이 없습니다') + '</div></div>' +
        '<div class="card"><div class="section-title"><span class="dot"></span>특이사항</div><div class="detail-text">' + escapeHtml(r.note || '작성된 내용이 없습니다') + '</div></div>';
      $('insp-detail-content').innerHTML = html2;
      showView('insp-detail');
    }
  }

  $('sao-d-back').addEventListener('click', function () { detailId = null; showView('sao-list'); });
  $('sao-d-close').addEventListener('click', function () { detailId = null; showView('sao-list'); });
  $('sao-d-edit').addEventListener('click', function () {
    var r = records.sao.find(function (x) { return x.id === detailId; });
    if (r) openStep1('sao', r);
  });
  $('sao-d-delete').addEventListener('click', function () {
    if (!detailId) return;
    if (confirm('이 관찰 기록을 삭제할까요? 되돌릴 수 없어요.')) { deleteRecord('sao', detailId); showView('sao-list'); }
  });

  $('insp-d-back').addEventListener('click', function () { detailId = null; showView('insp-list'); });
  $('insp-d-close').addEventListener('click', function () { detailId = null; showView('insp-list'); });
  $('insp-d-edit').addEventListener('click', function () {
    var r = records.insp.find(function (x) { return x.id === detailId; });
    if (r) openStep1('insp', r);
  });
  $('insp-d-delete').addEventListener('click', function () {
    if (!detailId) return;
    if (confirm('이 점검 기록을 삭제할까요? 되돌릴 수 없어요.')) { deleteRecord('insp', detailId); showView('insp-list'); }
  });

  // ================= init =================
  showView('home');
  renderAll();
  initFirebase();

})();
