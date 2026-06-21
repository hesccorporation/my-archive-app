const STORAGE_KEY = "my-archive-app-state-v1";
const DB_NAME = "my-archive-app-db";
const DB_STORE = "state";
const APP_URL = "https://hesccorporation.github.io/my-archive-app/";
const SUPABASE_URL = "https://askukytiskyakvbxtpan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFza3VreXRpc2t5YWt2Ynh0cGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDE5NjcsImV4cCI6MjA5NzQ3Nzk2N30.3Sygw5Op7g2sAZdXlNb-HWKbHfVLCormsBqhhxmOcpQ";

const defaultState = {
  categories: ["받은함", "사업", "야구 영상", "공부 자료", "구매할 것"],
  activeView: "받은함",
  typeFilter: "all",
  viewMode: "large",
  items: [
    {
      id: crypto.randomUUID(),
      title: "야구 타격폼 분석 영상",
      type: "link",
      url: "https://www.youtube.com/",
      category: "야구 영상",
      tags: ["타격", "참고자료"],
      memo: "유튜브에서 공유해서 저장할 자료의 예시입니다.",
      favorite: true,
      createdAt: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      title: "신규 사업 아이디어",
      type: "note",
      url: "",
      category: "사업",
      tags: ["아이디어", "검토"],
      memo: "떠오른 생각을 일단 받은함이나 사업 카테고리에 빠르게 넣어두면 됩니다.",
      favorite: false,
      createdAt: new Date(Date.now() - 86400000).toISOString()
    }
  ]
};

let state = loadState();
let selectedIds = new Set();
let appDatabase = null;
let databaseReady = false;
let supabaseClient = null;
let currentUser = null;
let remoteReady = false;
let remoteSaveTimer = null;
let suppressRemoteSave = false;
let activeImageItemId = "";
let activeDetailItemId = "";

const els = {
  categoryNav: document.querySelector("#categoryNav"),
  categoryForm: document.querySelector("#categoryForm"),
  newCategory: document.querySelector("#newCategory"),
  itemForm: document.querySelector("#itemForm"),
  editingId: document.querySelector("#editingId"),
  quickInput: document.querySelector("#quickInput"),
  titleInput: document.querySelector("#titleInput"),
  typeInput: document.querySelector("#typeInput"),
  urlInput: document.querySelector("#urlInput"),
  categoryInput: document.querySelector("#categoryInput"),
  quickCategoryInput: document.querySelector("#quickCategoryInput"),
  tagsInput: document.querySelector("#tagsInput"),
  memoInput: document.querySelector("#memoInput"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  advancedToggleButton: document.querySelector("#advancedToggleButton"),
  searchInput: document.querySelector("#searchInput"),
  mobileSearchInput: document.querySelector("#mobileSearchInput"),
  itemList: document.querySelector("#itemList"),
  resultCount: document.querySelector("#resultCount"),
  filterTabs: document.querySelector("#filterTabs"),
  viewToggle: document.querySelector("#viewToggle"),
  currentViewLabel: document.querySelector("#currentViewLabel"),
  currentViewTitle: document.querySelector("#currentViewTitle"),
  newItemButton: document.querySelector("#newItemButton"),
  mobileAddButton: document.querySelector("#mobileAddButton"),
  composer: document.querySelector("#composer"),
  kakaoImportInput: document.querySelector("#kakaoImportInput"),
  imageImportInput: document.querySelector("#imageImportInput"),
  quickImageInput: document.querySelector("#quickImageInput"),
  pendingImageStatus: document.querySelector("#pendingImageStatus"),
  pendingImagePreview: document.querySelector("#pendingImagePreview"),
  importStatus: document.querySelector("#importStatus"),
  bulkDeleteButton: document.querySelector("#bulkDeleteButton"),
  selectAllButton: document.querySelector("#selectAllButton"),
  emailInput: document.querySelector("#emailInput"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  pullButton: document.querySelector("#pullButton"),
  pushButton: document.querySelector("#pushButton"),
  syncStatus: document.querySelector("#syncStatus"),
  passwordInput: document.querySelector("#passwordInput"),
  signupButton: document.querySelector("#signupButton"),
  resetPasswordButton: document.querySelector("#resetPasswordButton"),
  imageModal: document.querySelector("#imageModal"),
  modalImage: document.querySelector("#modalImage"),
  modalCloseButton: document.querySelector("#modalCloseButton"),
  modalEditButton: document.querySelector("#modalEditButton"),
  modalSaveButton: document.querySelector("#modalSaveButton"),
  detailModal: document.querySelector("#detailModal"),
  detailBody: document.querySelector("#detailBody"),
  detailCloseButton: document.querySelector("#detailCloseButton"),
  detailEditButton: document.querySelector("#detailEditButton")
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState;
    return normalizeState(JSON.parse(saved));
  } catch {
    return defaultState;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    els.importStatus.textContent = "저장 공간이 부족합니다. 오래된 이미지나 자료를 삭제한 뒤 다시 시도해 주세요.";
  }

  if (databaseReady && appDatabase) {
    saveStateToDatabase().catch(() => {
      els.importStatus.textContent = "휴대폰 저장소에 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.";
    });
  }

  if (remoteReady && currentUser && !suppressRemoteSave) {
    scheduleRemoteSave();
  }
  return true;
}

function normalizeState(value) {
  return {
    ...defaultState,
    ...value,
    categories: value?.categories?.length ? value.categories : defaultState.categories,
    items: Array.isArray(value?.items) ? value.items : defaultState.items
  };
}

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function databaseRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStateFromDatabase() {
  if (!appDatabase) return null;
  const transaction = appDatabase.transaction(DB_STORE, "readonly");
  const saved = await databaseRequest(transaction.objectStore(DB_STORE).get(STORAGE_KEY));
  return saved ? normalizeState(saved) : null;
}

async function saveStateToDatabase() {
  if (!appDatabase) return;
  const transaction = appDatabase.transaction(DB_STORE, "readwrite");
  await databaseRequest(transaction.objectStore(DB_STORE).put(state, STORAGE_KEY));
}

async function initializeStorage() {
  try {
    appDatabase = await openDatabase();
    if (!appDatabase) return;

    const savedState = await loadStateFromDatabase();
    if (savedState) {
      state = savedState;
    } else {
      await saveStateToDatabase();
    }
    databaseReady = true;
  } catch {
    databaseReady = false;
    els.importStatus.textContent = "휴대폰 장기 저장소를 열지 못했습니다. Chrome/Safari에서 다시 열어 주세요.";
  }
}

function initializeSupabase() {
  if (!window.supabase?.createClient) {
    setSyncStatus("Supabase 연결 파일을 불러오지 못했습니다.");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function setSyncStatus(message) {
  els.syncStatus.textContent = message;
}

function setSyncButtons() {
  const signedIn = Boolean(currentUser);
  els.logoutButton.disabled = !signedIn;
  els.pullButton.disabled = !signedIn;
  els.pushButton.disabled = !signedIn;
}

async function initializeAuth() {
  initializeSupabase();
  if (!supabaseClient) {
    setSyncButtons();
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  setSyncButtons();

  if (currentUser) {
    els.emailInput.value = currentUser.email || "";
    setSyncStatus(`${currentUser.email} 로그인됨. 서버 자료를 확인하는 중...`);
    await pullRemoteState({ silent: true });
    remoteReady = true;
    setSyncStatus(`${currentUser.email} 동기화 준비됨`);
  } else {
    setSyncStatus("로그인하면 PC와 휴대폰이 같은 자료를 봅니다.");
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    remoteReady = false;
    setSyncButtons();

    if (currentUser) {
      els.emailInput.value = currentUser.email || "";
      setSyncStatus(`${currentUser.email} 로그인됨. 서버 자료를 불러오는 중...`);
      await pullRemoteState({ silent: true });
      remoteReady = true;
      setSyncStatus(`${currentUser.email} 동기화 준비됨`);
      render();
    } else {
      selectedIds.clear();
      setSyncStatus("로그아웃됨");
      render();
    }
  });
}

function getAuthFields() {
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  if (!email) {
    setSyncStatus("이메일을 입력해 주세요.");
    return null;
  }
  if (!password || password.length < 6) {
    setSyncStatus("비밀번호는 6자 이상 입력해 주세요.");
    return null;
  }
  return { email, password };
}

async function signupWithPassword() {
  if (!supabaseClient) return;
  const fields = getAuthFields();
  if (!fields) return;

  setSyncStatus("회원가입 중...");
  const { data, error } = await supabaseClient.auth.signUp({
    email: fields.email,
    password: fields.password
  });

  if (error) {
    setSyncStatus(`회원가입 실패: ${error.message}`);
    return;
  }

  currentUser = data.user || null;
  setSyncButtons();
  if (currentUser) {
    await pushRemoteState({ silent: true });
    remoteReady = true;
    setSyncStatus(`${fields.email} 회원가입 및 로그인 완료`);
  } else {
    setSyncStatus("회원가입 완료. 이메일 확인이 필요하면 메일함을 확인해 주세요.");
  }
}

async function loginWithPassword() {
  if (!supabaseClient) return;
  const fields = getAuthFields();
  if (!fields) return;

  setSyncStatus("로그인 중...");
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: fields.email,
    password: fields.password
  });

  if (error) {
    setSyncStatus(`로그인 실패: ${error.message}`);
    return;
  }

  currentUser = data.user || null;
  setSyncButtons();
  if (currentUser) {
    await pullRemoteState({ silent: true });
    remoteReady = true;
    setSyncStatus(`${fields.email} 로그인 완료`);
    render();
  }
}

async function resetPassword() {
  if (!supabaseClient) return;
  const email = els.emailInput.value.trim();
  if (!email) {
    setSyncStatus("비밀번호를 재설정할 이메일을 입력해 주세요.");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: APP_URL
  });

  if (error) {
    setSyncStatus(`비밀번호 재설정 실패: ${error.message}`);
    return;
  }

  setSyncStatus("비밀번호 재설정 메일을 보냈습니다.");
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentUser = null;
  remoteReady = false;
  selectedIds.clear();
  setSyncButtons();
  setSyncStatus("로그아웃됨");
  render();
}

function scheduleRemoteSave() {
  window.clearTimeout(remoteSaveTimer);
  remoteSaveTimer = window.setTimeout(() => {
    pushRemoteState({ silent: true });
  }, 800);
}

async function pullRemoteState(options = {}) {
  if (!supabaseClient || !currentUser) {
    setSyncStatus("먼저 로그인해 주세요.");
    return;
  }

  if (!options.silent) setSyncStatus("서버에서 불러오는 중...");
  const { data, error } = await supabaseClient
    .from("archive_state")
    .select("data, updated_at")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    setSyncStatus(`서버 불러오기 실패: ${error.message}`);
    return;
  }

  if (data?.data) {
    suppressRemoteSave = true;
    state = normalizeState(data.data);
    selectedIds.clear();
    await saveStateToDatabase().catch(() => {});
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    render();
    suppressRemoteSave = false;
    if (!options.silent) setSyncStatus(`서버 자료를 불러왔습니다. ${state.items.length}개`);
    return;
  }

  await pushRemoteState({ silent: true });
  if (!options.silent) setSyncStatus("서버에 자료가 없어 현재 자료를 저장했습니다.");
}

async function pushRemoteState(options = {}) {
  if (!supabaseClient || !currentUser) {
    setSyncStatus("먼저 로그인해 주세요.");
    return;
  }

  if (!options.silent) setSyncStatus("서버에 저장하는 중...");
  const { error } = await supabaseClient
    .from("archive_state")
    .upsert({
      user_id: currentUser.id,
      data: {
        categories: state.categories,
        activeView: state.activeView,
        typeFilter: state.typeFilter,
        viewMode: state.viewMode,
        items: state.items
      },
      updated_at: new Date().toISOString()
    });

  if (error) {
    setSyncStatus(`서버 저장 실패: ${error.message}`);
    return;
  }

  if (!options.silent) {
    setSyncStatus(`서버에 저장했습니다. ${state.items.length}개`);
  }
}

function parseSharedParams() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || "";
  const text = params.get("text") || "";
  const url = params.get("url") || "";
  const possibleUrl = url || findUrl(text);

  if (!title && !text && !url) return;

  els.titleInput.value = title || "공유한 자료";
  els.typeInput.value = possibleUrl ? "link" : "note";
  els.urlInput.value = possibleUrl;
  els.memoInput.value = text.replace(possibleUrl, "").trim();
  els.categoryInput.value = "받은함";
  els.composer.classList.remove("collapsed");
}

function findUrl(text) {
  return findUrls(text)[0] || "";
}

function findUrls(text) {
  const normalized = text
    .replace(/\u200b/g, "")
    .replace(/(https?:\/\/)\s+/gi, "$1")
    .replace(/(www\.)\s+/gi, "$1");
  const pattern = /(?:https?:\/\/|www\.|m\.|youtu\.be\/|youtube\.com\/|naver\.me\/|bit\.ly\/|instagram\.com\/|tiktok\.com\/|x\.com\/|twitter\.com\/|smartstore\.naver\.com\/)[^\s<>"'가-힣]+/gi;
  const urls = [...normalized.matchAll(pattern)].map((match) => normalizeUrl(match[0]));
  return [...new Set(urls)];
}

function normalizeUrl(url) {
  const clean = url
    .replace(/[)\]}>,.]+$/, "")
    .replace(/^m\.(?=youtube\.com|naver\.com|instagram\.com|tiktok\.com)/i, "https://m.");

  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^(www\.|youtu\.be\/|youtube\.com\/|naver\.me\/|bit\.ly\/|instagram\.com\/|tiktok\.com\/|x\.com\/|twitter\.com\/|smartstore\.naver\.com\/)/i.test(clean)) {
    return `https://${clean}`;
  }
  return clean;
}

function textWithoutUrls(text, urls) {
  return urls.reduce((memo, url) => {
    const raw = url.replace(/^https?:\/\//, "");
    return memo
      .replace(url, "")
      .replace(raw, "")
      .replace(raw.replace(/^www\./, ""), "");
  }, text).replace(/\s+/g, " ").trim();
}

function render() {
  updateLayoutMode();
  renderCategories();
  renderCategoryOptions();
  renderHeader();
  renderItems();
  saveState();
}

function updateLayoutMode() {
  const isCompact = state.viewMode === "compact";
  document.body.classList.toggle("mobile-grid", isCompact);
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
  });
  document.querySelectorAll("[data-mobile-view-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mobileViewMode === state.viewMode);
  });
}

function renderCategories() {
  const systemViews = [
    { name: "받은함", count: countByCategory("받은함") },
    { name: "즐겨찾기", count: state.items.filter((item) => item.favorite).length },
    { name: "전체", count: currentUser ? state.items.length : 0 }
  ];

  const customViews = state.categories
    .filter((category) => category !== "받은함")
    .map((category) => ({ name: category, count: countByCategory(category) }));

  els.categoryNav.innerHTML = [...systemViews, ...customViews]
    .map((view) => {
      const active = view.name === state.activeView ? "active" : "";
      const canDelete = state.categories.includes(view.name) && view.name !== "받은함";
      const deleteButton = canDelete
        ? `<button class="category-delete" type="button" data-delete-category="${escapeHtml(view.name)}" aria-label="${escapeHtml(view.name)} 카테고리 삭제">삭제</button>`
        : "";

      return `<div class="category-row">
        <button class="category-button ${active}" type="button" data-view="${escapeHtml(view.name)}">
          <span>${escapeHtml(view.name)}</span>
          <span class="count">${view.count}</span>
        </button>
        ${deleteButton}
      </div>`;
    })
    .join("");
}

function renderCategoryOptions() {
  const options = state.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
  els.categoryInput.innerHTML = options;
  els.quickCategoryInput.innerHTML = options;
  els.categoryInput.value = state.categories.includes(els.categoryInput.value)
    ? els.categoryInput.value
    : activeSaveCategory();
  els.quickCategoryInput.value = state.categories.includes(els.quickCategoryInput.value)
    ? els.quickCategoryInput.value
    : activeSaveCategory();
}

function renderHeader() {
  const titles = {
    "받은함": "정리할 자료",
    "즐겨찾기": "중요한 자료",
    "전체": "모든 자료"
  };

  els.currentViewLabel.textContent = state.activeView;
  els.currentViewTitle.textContent = titles[state.activeView] || `${state.activeView} 자료`;
}

function renderItems() {
  const items = getVisibleItems();
  const visibleIds = new Set(items.map((item) => item.id));
  selectedIds = new Set([...selectedIds].filter((id) => visibleIds.has(id)));
  const selectedVisibleCount = items.filter((item) => selectedIds.has(item.id)).length;

  els.resultCount.textContent = selectedIds.size
    ? `${items.length}개 중 ${selectedVisibleCount}개 선택`
    : `${items.length}개`;
  els.bulkDeleteButton.disabled = selectedVisibleCount === 0;
  els.bulkDeleteButton.textContent = selectedVisibleCount
    ? `선택 ${selectedVisibleCount}개 삭제`
    : "선택 삭제";
  els.selectAllButton.disabled = items.length === 0;
  els.selectAllButton.textContent = items.length && selectedVisibleCount === items.length
    ? "선택 해제"
    : "모두 선택";

  if (!items.length) {
    const emptyTitle = currentUser ? "아직 자료가 없습니다" : "로그인이 필요합니다";
    const emptyText = currentUser
      ? "새 자료를 저장하면 여기에서 바로 찾을 수 있습니다."
      : "로그인하면 저장한 자료를 볼 수 있습니다.";
    els.itemList.innerHTML = `
      <div class="empty-state">
        <h3>${emptyTitle}</h3>
        <p>${emptyText}</p>
      </div>
    `;
    return;
  }

  els.itemList.innerHTML = items.map(renderItemCard).join("");
}

function getVisibleItems() {
  if (!currentUser) return [];

  const query = els.searchInput.value.trim().toLowerCase();
  return state.items
    .filter((item) => matchesView(item))
    .filter((item) => matchesType(item))
    .filter((item) => matchesSearch(item, query))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderItemCard(item) {
  const checked = selectedIds.has(item.id) ? "checked" : "";
  const tags = item.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
  const imagePreview = item.type === "image" && item.url
    ? `<button class="image-preview-button" type="button" data-action="open-image" data-id="${item.id}"><img class="image-preview" src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.title)}" loading="lazy" /></button>`
    : "";
  const url = item.url && item.type !== "image"
    ? `<a class="item-url" href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>`
    : "";
  const imageSaveButton = item.type === "image" && item.url
    ? `<button type="button" data-action="save-image" data-id="${item.id}">저장</button>`
    : "";

  return `
    <article class="item-card ${checked ? "selected" : ""}" data-open-detail="${item.id}" tabindex="0">
      <div class="item-head">
        <label class="select-item">
          <input type="checkbox" data-select-id="${item.id}" ${checked} />
          <span>선택</span>
        </label>
        <div class="item-title">
          <h3>${escapeHtml(item.title)}</h3>
          <div class="item-meta">
            <span class="badge">${typeLabel(item.type)}</span>
            <span class="badge">${escapeHtml(item.category)}</span>
            <span>${formatDate(item.createdAt)}</span>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" data-action="favorite" data-id="${item.id}">${item.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
          ${imageSaveButton}
          <button type="button" data-action="edit" data-id="${item.id}">수정</button>
          <button class="danger" type="button" data-action="delete" data-id="${item.id}">삭제</button>
        </div>
      </div>
      ${imagePreview}
      ${url}
      ${item.memo ? `<p class="memo">${escapeHtml(item.memo)}</p>` : ""}
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
    </article>
  `;
}

function matchesView(item) {
  if (state.activeView === "전체") return true;
  if (state.activeView === "즐겨찾기") return item.favorite;
  return item.category === state.activeView;
}

function matchesType(item) {
  if (state.typeFilter === "all") return true;
  if (state.typeFilter === "media") return item.type === "image" || item.type === "video";
  return item.type === state.typeFilter;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.content,
    item.url,
    item.category,
    item.memo,
    item.type,
    ...item.tags
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function countByCategory(category) {
  if (!currentUser) return 0;
  return state.items.filter((item) => item.category === category).length;
}

function typeLabel(type) {
  const labels = {
    link: "링크",
    note: "메모",
    image: "이미지",
    video: "영상",
    file: "파일"
  };
  return labels[type] || type;
}

function categoryForText(text) {
  const value = text.toLowerCase();
  const rules = [
    { category: "사업", words: ["사업", "마케팅", "거래", "매출", "창업", "고객", "세금", "계약"] },
    { category: "야구 영상", words: ["야구", "타격", "투수", "오타니", "mlb", "kbo", "홈런", "피칭"] },
    { category: "공부 자료", words: ["공부", "강의", "수업", "논문", "자료", "영어", "개념", "튜토리얼"] },
    { category: "구매할 것", words: ["구매", "쇼핑", "살 것", "사야", "가격", "쿠팡", "네이버쇼핑"] }
  ];

  const matched = rules.find((rule) =>
    state.categories.includes(rule.category) && rule.words.some((word) => value.includes(word))
  );
  return matched?.category || "받은함";
}

function titleFromMessage(message, url) {
  if (url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "유튜브 링크";
      if (hostname.includes("naver.com")) return "네이버 링크";
      if (hostname.includes("instagram.com")) return "인스타그램 링크";
      return `${hostname} 링크`;
    } catch {
      return "저장한 링크";
    }
  }

  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean || "카톡 메모";
}

function parseKakaoDateSeparator(line) {
  const match = line.match(/(\d{4})[년.\/-]\s*(\d{1,2})[월.\/-]\s*(\d{1,2})일?/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toIsoDate(datePart, meridiem, hourText, minuteText) {
  if (!datePart) return new Date().toISOString();
  let hour = Number(hourText || 0);
  const minute = Number(minuteText || 0);

  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;

  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function parseKakaoExport(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const messages = [];
  let currentDate = "";
  let currentMessage = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) return;

    const dateFromSeparator = parseKakaoDateSeparator(line);
    if (dateFromSeparator) {
      currentDate = dateFromSeparator;
      return;
    }

    const bracketMatch = line.match(/^\[(.+?)\]\s*\[(오전|오후)?\s*(\d{1,2}):(\d{2})\]\s*(.*)$/);
    const commaMatch = line.match(/^(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})[.\-\/]?\s*(오전|오후)?\s*(\d{1,2}):(\d{2}),?\s*(.+?)\s*:\s*(.*)$/);
    const noSenderCommaMatch = line.match(/^(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})[.\-\/]?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})\s*(.*)$/);
    const timeColonMatch = line.match(/^(오전|오후)?\s*(\d{1,2}):(\d{2})\s*,?\s*(.+?)\s*:\s*(.*)$/);
    const simpleColonMatch = line.match(/^(.{1,40}?)\s*:\s*(.+)$/);

    if (bracketMatch) {
      const [, sender, meridiem = "", hour, minute, message] = bracketMatch;
      currentMessage = {
        sender,
        message: message.trim(),
        createdAt: toIsoDate(currentDate, meridiem, hour, minute)
      };
      messages.push(currentMessage);
      return;
    }

    if (commaMatch) {
      const [, year, month, day, meridiem = "", hour, minute, sender, message] = commaMatch;
      const datePart = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      currentMessage = {
        sender,
        message: message.trim(),
        createdAt: toIsoDate(datePart, meridiem, hour, minute)
      };
      messages.push(currentMessage);
      return;
    }

    if (noSenderCommaMatch) {
      const [, year, month, day, meridiem = "", hour, minute, message] = noSenderCommaMatch;
      const datePart = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      currentMessage = {
        sender: "",
        message: message.trim(),
        createdAt: toIsoDate(datePart, meridiem, hour, minute)
      };
      messages.push(currentMessage);
      return;
    }

    if (timeColonMatch) {
      const [, meridiem = "", hour, minute, sender, message] = timeColonMatch;
      currentMessage = {
        sender,
        message: message.trim(),
        createdAt: toIsoDate(currentDate, meridiem, hour, minute)
      };
      messages.push(currentMessage);
      return;
    }

    if (simpleColonMatch && !line.includes("저장한 날짜") && !line.includes("대화 내용")) {
      const [, sender, message] = simpleColonMatch;
      currentMessage = {
        sender,
        message: message.trim(),
        createdAt: currentDate ? toIsoDate(currentDate, "", "0", "0") : new Date().toISOString()
      };
      messages.push(currentMessage);
      return;
    }

    if (currentMessage) {
      currentMessage.message = `${currentMessage.message}\n${line.trim()}`.trim();
    }
  });

  const parsedMessages = messages.filter((entry) => entry.message);
  if (parsedMessages.length) return parsedMessages;

  return lines
    .map((line) => line.trim())
    .filter((line) => line && !parseKakaoDateSeparator(line) && !line.includes("대화 내용") && !line.includes("저장한 날짜"))
    .map((message) => ({
      sender: "",
      message,
      createdAt: new Date().toISOString()
    }));
}

function previewText(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" / ")
    .slice(0, 180);
}

function buildItemsFromKakaoMessages(messages) {
  const existingKeys = new Set(state.items.map((item) => `${item.url}|${item.memo}|${item.title}`));
  const items = [];
  let linkCount = 0;
  let noteCount = 0;

  messages.forEach((entry) => {
    const urls = findUrls(entry.message);
    const baseTags = ["카톡가져오기"];

    if (urls.length) {
      urls.forEach((url) => {
        const memo = textWithoutUrls(entry.message, urls);
        const item = {
          id: crypto.randomUUID(),
          title: titleFromMessage(entry.message, url),
          type: "link",
          url,
          category: categoryForText(entry.message),
          tags: baseTags,
          memo,
          favorite: false,
          createdAt: entry.createdAt
        };
        const key = `${item.url}|${item.memo}|${item.title}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          items.push(item);
          linkCount += 1;
        }
      });
      return;
    }

    const item = {
      id: crypto.randomUUID(),
      title: titleFromMessage(entry.message, ""),
      type: "note",
      url: "",
      category: categoryForText(entry.message),
      tags: baseTags,
      memo: entry.message,
      favorite: false,
      createdAt: entry.createdAt
    };
    const key = `${item.url}|${item.memo}|${item.title}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      items.push(item);
      noteCount += 1;
    }
  });

  return { items, linkCount, noteCount };
}

function importKakaoFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.onload = () => {
    const text = String(reader.result || "");
    const messages = parseKakaoExport(text);
    const { items: importedItems, linkCount, noteCount } = buildItemsFromKakaoMessages(messages);

    if (!messages.length) {
      els.importStatus.textContent = `읽을 수 있는 카톡 메시지를 찾지 못했습니다. 파일 앞부분: ${previewText(text) || "비어 있음"}`;
      return;
    }

    if (!importedItems.length) {
      els.importStatus.textContent = `이미 저장된 자료입니다. 새로 추가된 항목은 없습니다.`;
      return;
    }

    state.items = [...importedItems, ...state.items];
    state.activeView = "받은함";
    state.typeFilter = "all";
    document.querySelectorAll("[data-filter]").forEach((tab) => tab.classList.remove("active"));
    document.querySelector('[data-filter="all"]')?.classList.add("active");
    render();
    els.importStatus.textContent = `${file.name}에서 ${importedItems.length}개를 가져왔습니다. 링크 ${linkCount}개, 메모 ${noteCount}개`;
  };

  reader.onerror = () => {
    els.importStatus.textContent = "파일을 읽는 중 문제가 생겼습니다.";
  };

  reader.readAsText(file, "utf-8");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function activeSaveCategory() {
  return state.categories.includes(state.activeView) ? state.activeView : "받은함";
}

function resetForm() {
  els.editingId.value = "";
  els.itemForm.reset();
  els.quickInput.value = "";
  els.typeInput.value = "link";
  els.urlInput.value = "";
  showPendingImagePreview("");
  els.categoryInput.value = activeSaveCategory();
  els.quickCategoryInput.value = activeSaveCategory();
  els.composer.classList.remove("advanced-open");
  els.advancedToggleButton.textContent = "\uc790\uc138\ud788";
  els.pendingImageStatus.textContent = "이미지는 선택하거나 Ctrl+V로 붙인 뒤 제목/메모를 적고 저장할 수 있습니다.";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function imageFileToStoredDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  if (file.size < 750000) return originalDataUrl;

  const image = await loadImage(originalDataUrl);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function defaultImageTitle() {
  return `붙여넣은 이미지 ${new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date())}`;
}

function showPendingImagePreview(dataUrl) {
  if (!dataUrl) {
    els.pendingImagePreview.hidden = true;
    els.pendingImagePreview.innerHTML = "";
    return;
  }

  els.pendingImagePreview.hidden = false;
  els.pendingImagePreview.innerHTML = `
    <img src="${escapeAttribute(dataUrl)}" alt="첨부한 이미지 미리보기" />
    <span>이미지가 내용에 첨부됐습니다.</span>
  `;
}

async function prepareImageForForm(file) {
  const dataUrl = await imageFileToStoredDataUrl(file);
  els.urlInput.value = dataUrl;
  els.typeInput.value = "image";
  showPendingImagePreview(dataUrl);
  els.composer.classList.remove("collapsed");
  els.composer.classList.add("advanced-open");
  els.advancedToggleButton.textContent = "\uac04\ub2e8\ud788";
  if (!els.titleInput.value.trim()) els.titleInput.value = defaultImageTitle();
  if (!els.memoInput.value.trim()) els.memoInput.value = "이미지";
  if (!els.tagsInput.value.trim()) els.tagsInput.value = "이미지";
  els.pendingImageStatus.textContent = "이미지가 첨부됐습니다. 제목, 카테고리, 태그, 메모를 정한 뒤 저장하세요.";
  els.titleInput.focus();
}

async function addPastedImage(file) {
  await prepareImageForForm(file);
}

function handlePaste(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  event.preventDefault();
  prepareImageForForm(file).catch(() => {
    els.importStatus.textContent = "이미지를 붙여넣는 중 문제가 생겼습니다.";
  });
}

function titleFromQuickText(text, url) {
  const cleanText = textWithoutUrls(text, url ? [url] : []).trim();
  const source = cleanText || url || "새 메모";
  return source.replace(/\s+/g, " ").slice(0, 48);
}

function typeFromQuickText(text, url) {
  if (url) return "link";
  return text.trim() ? "note" : els.typeInput.value;
}

function saveItem(event) {
  event.preventDefault();

  const editingId = els.editingId.value;
  const quickText = els.quickInput.value.trim();
  const quickUrl = findUrl(quickText);
  const detailUrl = els.urlInput.value.trim();
  if (!quickText && !els.titleInput.value.trim() && !detailUrl && !els.memoInput.value.trim()) return;
  const url = detailUrl || quickUrl;
  const type = els.typeInput.value && (detailUrl || !quickText)
    ? els.typeInput.value
    : typeFromQuickText(quickText, url);
  const memo = els.memoInput.value.trim() || textWithoutUrls(quickText, url ? [url] : []);
  const title = els.titleInput.value.trim() || (type === "image" ? defaultImageTitle() : titleFromQuickText(quickText, url));
  const item = {
    id: editingId || crypto.randomUUID(),
    title,
    type,
    url,
    category: els.quickCategoryInput.value || els.categoryInput.value,
    tags: els.tagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    content: quickText || (type === "image" ? "이미지 첨부" : ""),
    memo,
    favorite: false,
    createdAt: new Date().toISOString()
  };

  if (editingId) {
    const oldItem = state.items.find((entry) => entry.id === editingId);
    state.items = state.items.map((entry) =>
      entry.id === editingId
        ? { ...item, favorite: oldItem?.favorite || false, createdAt: oldItem?.createdAt || item.createdAt }
        : entry
    );
  } else {
    state.items = [item, ...state.items];
  }

  resetForm();
  render();
}

function editItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  els.editingId.value = item.id;
  els.quickInput.value = item.type === "link" && item.url
    ? (item.content || `${item.url}\n${item.memo}`.trim())
    : item.content || item.memo || item.title;
  els.titleInput.value = item.title;
  els.typeInput.value = item.type;
  els.urlInput.value = item.url;
  showPendingImagePreview(item.type === "image" ? item.url : "");
  els.categoryInput.value = item.category;
  els.quickCategoryInput.value = item.category;
  els.tagsInput.value = item.tags.join(", ");
  els.memoInput.value = item.memo;
  els.composer.classList.remove("collapsed");
  els.composer.classList.add("advanced-open");
  els.advancedToggleButton.textContent = "\uac04\ub2e8\ud788";
  els.quickInput.focus();
}

function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const ok = confirm(`"${item.title}" 자료를 삭제할까요?`);
  if (!ok) return;
  state.items = state.items.filter((entry) => entry.id !== id);
  selectedIds.delete(id);
  render();
}

function toggleVisibleSelection() {
  const visibleItems = getVisibleItems();
  if (!visibleItems.length) return;

  const allVisibleSelected = visibleItems.every((item) => selectedIds.has(item.id));
  if (allVisibleSelected) {
    visibleItems.forEach((item) => selectedIds.delete(item.id));
  } else {
    visibleItems.forEach((item) => selectedIds.add(item.id));
  }

  renderItems();
}

function toggleItemSelection(id, checked) {
  if (checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }

  renderItems();
}

function deleteSelectedItems() {
  if (!selectedIds.size) return;

  const ok = confirm(`선택한 자료 ${selectedIds.size}개를 삭제할까요?`);
  if (!ok) return;

  state.items = state.items.filter((item) => !selectedIds.has(item.id));
  selectedIds.clear();
  render();
}

function toggleFavorite(id) {
  state.items = state.items.map((item) =>
    item.id === id ? { ...item, favorite: !item.favorite } : item
  );
  render();
}

function addCategory(event) {
  event.preventDefault();
  const value = els.newCategory.value.trim();
  if (!value || state.categories.includes(value)) return;
  state.categories.push(value);
  els.newCategory.value = "";
  state.activeView = value;
  render();
}

function deleteCategory(category) {
  if (category === "받은함" || !state.categories.includes(category)) return;

  const itemCount = countByCategory(category);
  const message = itemCount
    ? `"${category}" 카테고리를 삭제할까요?\n안에 있던 자료 ${itemCount}개는 받은함으로 옮겨집니다.`
    : `"${category}" 카테고리를 삭제할까요?`;
  const ok = confirm(message);
  if (!ok) return;

  state.categories = state.categories.filter((entry) => entry !== category);
  state.items = state.items.map((item) =>
    item.category === category ? { ...item, category: "받은함" } : item
  );

  if (state.activeView === category) {
    state.activeView = "받은함";
  }

  resetForm();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function imageExtension(dataUrl) {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
  const type = match?.[1]?.toLowerCase() || "png";
  if (type === "jpeg") return "jpg";
  if (type === "svg+xml") return "svg";
  return type;
}

function filenameFromTitle(title, extension) {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40) || "image";
  return `${safeTitle}.${extension}`;
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function saveImage(item) {
  if (!item?.url) return;
  const extension = imageExtension(item.url);
  const filename = filenameFromTitle(item.title, extension);
  const blob = await dataUrlToBlob(item.url);
  const file = new File([blob], filename, { type: blob.type || `image/${extension}` });

  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: item.title
      });
      els.importStatus.textContent = "공유/저장 화면을 열었습니다.";
      return;
    } catch {
      // 사용자가 공유창을 닫으면 아래 다운로드 방식으로 이어집니다.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  els.importStatus.textContent = "이미지 다운로드를 시작했습니다. 휴대폰에서 공유창이 뜨면 사진 저장을 선택하세요.";
}

function openImageModal(item) {
  if (!item?.url) return;
  activeImageItemId = item.id;
  els.modalImage.src = item.url;
  els.modalImage.alt = item.title;
  els.imageModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  activeImageItemId = "";
  els.imageModal.hidden = true;
  els.modalImage.removeAttribute("src");
  els.modalImage.alt = "";
  document.body.classList.remove("modal-open");
}

function saveActiveModalImage() {
  const item = state.items.find((entry) => entry.id === activeImageItemId);
  saveImage(item).catch(() => {
    els.importStatus.textContent = "이미지 저장에 실패했습니다. 이미지를 길게 눌러 저장해 보세요.";
  });
}

function editActiveModalImage() {
  const itemId = activeImageItemId;
  if (!itemId) return;
  closeImageModal();
  editItem(itemId);
  els.composer.scrollIntoView({ behavior: "smooth", block: "start" });
}

function detailRow(label, value, options = {}) {
  if (!value) return "";
  const body = options.link
    ? `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`
    : `<div>${escapeHtml(value)}</div>`;
  return `
    <section class="detail-row">
      <h3>${label}</h3>
      ${body}
    </section>
  `;
}

function openDetailModal(item) {
  if (!item) return;
  activeDetailItemId = item.id;
  const content = item.content || (item.type === "link" && item.url ? item.url : "");
  const tags = item.tags?.length ? item.tags.map((tag) => `#${tag}`).join(" ") : "";
  const image = item.type === "image" && item.url
    ? `<img class="detail-image" src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.title)}" />`
    : "";

  els.detailBody.innerHTML = `
    <h2>${escapeHtml(item.title)}</h2>
    <div class="detail-meta">
      <span class="badge">${typeLabel(item.type)}</span>
      <span class="badge">${escapeHtml(item.category)}</span>
      <span>${formatDate(item.createdAt)}</span>
    </div>
    ${image}
    ${detailRow("내용", content)}
    ${detailRow("메모", item.memo && item.memo !== content ? item.memo : "")}
    ${detailRow("태그", tags)}
    ${detailRow("링크", item.type !== "image" ? item.url : "", { link: true })}
  `;
  els.detailModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeDetailModal() {
  activeDetailItemId = "";
  els.detailModal.hidden = true;
  els.detailBody.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function editActiveDetailItem() {
  const itemId = activeDetailItemId;
  if (!itemId) return;
  closeDetailModal();
  editItem(itemId);
  els.composer.scrollIntoView({ behavior: "smooth", block: "start" });
}

els.categoryNav.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("button[data-delete-category]");
  if (deleteButton) {
    deleteCategory(deleteButton.dataset.deleteCategory);
    return;
  }

  const button = event.target.closest("button[data-view]");
  if (!button) return;
  selectedIds.clear();
  state.activeView = button.dataset.view;
  render();
});

els.categoryForm.addEventListener("submit", addCategory);
els.itemForm.addEventListener("submit", saveItem);

els.kakaoImportInput.addEventListener("change", (event) => {
  importKakaoFile(event.target.files?.[0]);
  event.target.value = "";
});

els.imageImportInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    prepareImageForForm(file).catch(() => {
      els.importStatus.textContent = "이미지를 가져오는 중 문제가 생겼습니다.";
    });
  }
  event.target.value = "";
});

els.quickImageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    prepareImageForForm(file).catch(() => {
      els.pendingImageStatus.textContent = "이미지를 불러오는 중 문제가 생겼습니다.";
    });
  }
  event.target.value = "";
});

els.signupButton.addEventListener("click", signupWithPassword);
els.loginButton.addEventListener("click", loginWithPassword);
els.logoutButton.addEventListener("click", logout);
els.resetPasswordButton.addEventListener("click", resetPassword);
els.pullButton.addEventListener("click", () => pullRemoteState());
els.pushButton.addEventListener("click", () => pushRemoteState());

els.selectAllButton.addEventListener("click", toggleVisibleSelection);
els.bulkDeleteButton.addEventListener("click", deleteSelectedItems);

els.cancelEditButton.addEventListener("click", () => {
  resetForm();
  els.composer.classList.add("collapsed");
});

els.advancedToggleButton.addEventListener("click", () => {
  els.composer.classList.toggle("advanced-open");
  els.advancedToggleButton.textContent = els.composer.classList.contains("advanced-open")
    ? "\uac04\ub2e8\ud788"
    : "\uc790\uc138\ud788";
});

function syncSearchInput(source, target) {
  target.value = source.value;
  renderItems();
}

els.searchInput.addEventListener("input", () => {
  syncSearchInput(els.searchInput, els.mobileSearchInput);
});

els.mobileSearchInput.addEventListener("input", () => {
  syncSearchInput(els.mobileSearchInput, els.searchInput);
});

els.filterTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  selectedIds.clear();
  state.typeFilter = button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((tab) => tab.classList.remove("active"));
  button.classList.add("active");
  render();
});

els.viewToggle.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view-mode]");
  if (!button) return;
  selectedIds.clear();
  state.viewMode = button.dataset.viewMode;
  render();
});

function changeViewMode(viewMode) {
  selectedIds.clear();
  state.viewMode = viewMode;
  render();
}

els.itemList.addEventListener("click", (event) => {
  const checkbox = event.target.closest("input[data-select-id]");
  if (checkbox) {
    toggleItemSelection(checkbox.dataset.selectId, checkbox.checked);
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) {
    if (event.target.closest("a")) return;
    if (event.target.closest(".select-item")) return;
    const card = event.target.closest("[data-open-detail]");
    if (card) {
      const item = state.items.find((entry) => entry.id === card.dataset.openDetail);
      openDetailModal(item);
    }
    return;
  }
  const { action, id } = button.dataset;

  if (action === "favorite") toggleFavorite(id);
  if (action === "edit") editItem(id);
  if (action === "delete") deleteItem(id);
  if (action === "open-image") {
    const item = state.items.find((entry) => entry.id === id);
    openImageModal(item);
  }
  if (action === "save-image") {
    const item = state.items.find((entry) => entry.id === id);
    saveImage(item).catch(() => {
      els.importStatus.textContent = "이미지 저장에 실패했습니다. 이미지를 열고 길게 눌러 저장해 보세요.";
    });
  }
});

els.modalCloseButton.addEventListener("click", closeImageModal);
els.modalEditButton.addEventListener("click", editActiveModalImage);
els.modalSaveButton.addEventListener("click", saveActiveModalImage);
els.imageModal.addEventListener("click", (event) => {
  if (event.target === els.imageModal) closeImageModal();
});
els.detailCloseButton.addEventListener("click", closeDetailModal);
els.detailEditButton.addEventListener("click", editActiveDetailItem);
els.detailModal.addEventListener("click", (event) => {
  if (event.target === els.detailModal) closeDetailModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.imageModal.hidden) {
    closeImageModal();
  }
  if (event.key === "Escape" && !els.detailModal.hidden) {
    closeDetailModal();
  }
});

document.addEventListener("paste", handlePaste);
window.addEventListener("resize", () => {
  updateLayoutMode();
});

els.newItemButton.addEventListener("click", () => {
  resetForm();
  els.composer.classList.toggle("collapsed");
  if (!els.composer.classList.contains("collapsed")) els.quickInput.focus();
});

els.mobileAddButton.addEventListener("click", () => {
  resetForm();
  els.composer.classList.remove("collapsed");
  els.composer.scrollIntoView({ behavior: "smooth", block: "start" });
  els.quickInput.focus();
});

document.querySelectorAll("[data-mobile-view]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedIds.clear();
    state.activeView = button.dataset.mobileView === "favorites"
      ? "즐겨찾기"
      : button.dataset.mobileView === "all"
        ? "전체"
        : "받은함";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelectorAll("[data-mobile-view-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    changeViewMode(button.dataset.mobileViewMode);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

initializeStorage().finally(() => {
  initializeAuth().finally(() => {
    els.titleInput.removeAttribute("required");
    resetForm();
    render();
    parseSharedParams();
  });
});
