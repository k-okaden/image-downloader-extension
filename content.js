(function () {
  const MIN_SIZE = 24; // これより小さい要素(アイコン等)は対象外
  const DEBUG = false; // trueにすると、右下に検出件数バッジを表示しConsoleにログを出す
  const FAST_INTERVAL_MS = 1000; // 軽量な再スキャン間隔(常時)
  const FULL_INTERVAL_MS = 4000; // CSSクラス経由の背景画像も拾う重い再スキャン間隔(常時)

  const processed = new WeakSet();
  const elToBtn = new Map(); // 削除検知のため通常のMapを使用
  const elToGetUrl = new Map(); // 集中ダウンロードモードで対象要素のURLを取り出すため
  const FOCUS_KEY = "d"; // 集中ダウンロードモード中にこのキーで一番大きい画像を保存
  const FOCUS_STORAGE_KEY = "focusMode";

  let attachedCount = 0;

  function log(...args) {
    if (DEBUG) console.log("[image-downloader]", ...args);
  }

  function extractBgUrl(bgImageValue) {
    if (!bgImageValue || bgImageValue === "none") return null;
    const match = /url\(["']?([^"')]+)["']?\)/.exec(bgImageValue);
    return match ? match[1] : null;
  }

  function isLikelyPhoto(url) {
    if (!url) return false;
    const lower = url.split("?")[0].toLowerCase();
    return !lower.endsWith(".svg");
  }

  function getBgUrlOfEl(el) {
    const val = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
    return extractBgUrl(val);
  }

  function ensureBadge() {
    if (!DEBUG) return null;
    let b = document.getElementById("__img_dl_badge__");
    if (!b) {
      b = document.createElement("div");
      b.id = "__img_dl_badge__";
      b.style.cssText =
        "position:fixed;bottom:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,.75);" +
        "color:#fff;font-size:11px;padding:4px 8px;border-radius:4px;font-family:sans-serif;pointer-events:none;";
      document.documentElement.appendChild(b);
    }
    return b;
  }

  function updateBadge() {
    const b = ensureBadge();
    if (b) b.textContent = `[画像DL] 検出 ${attachedCount} 件`;
  }

  function positionBtn(el, btn) {
    // position: fixed のビューポート座標をそのまま使う。
    // モーダル(position: fixed)・通常の一覧(スクロールで流れる要素)の
    // どちらでも、スクロール時にrepositionAll()で追従させれば正しい位置になる。
    const rect = el.getBoundingClientRect();
    btn.style.top = rect.top + 4 + "px";
    btn.style.left = rect.right - 30 + "px";
  }

  function onDownloadClick(e, getUrl, btn) {
    e.preventDefault();
    e.stopPropagation();
    const url = getUrl();
    if (!url) return;

    btn.classList.add("downloading");
    chrome.runtime.sendMessage({ type: "download-image", url }, (response) => {
      btn.classList.remove("downloading");
      if (!response || !response.ok) {
        btn.classList.add("error");
        setTimeout(() => btn.classList.remove("error"), 1200);
        log("ダウンロード失敗:", response && response.error);
      }
    });
  }

  function createBtn(getUrl) {
    const b = document.createElement("div");
    b.textContent = "⬇️";
    b.className = "img-downloader-btn";
    b.title = "画像をダウンロード";
    b.style.display = "flex"; // 見つけ次第すぐ表示する
    b.addEventListener("click", (e) => onDownloadClick(e, getUrl, b));
    document.documentElement.appendChild(b);
    return b;
  }

  // el: 対象要素(imgまたは背景画像を持つ要素)
  // getUrl: クリック時に最新のダウンロードURLを返す関数
  // (同じ要素が使い回されて中の画像だけ差し替わるSPAでも、
  //  getUrlはクリック時に毎回最新のURLを読みに行くので自動的に追従する)
  function attach(el, getUrl) {
    if (!el || processed.has(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      if (el.tagName === "IMG") {
        el.addEventListener("load", () => attach(el, getUrl), { once: true });
      }
      // 背景画像要素はここで諦めず、常時走っている再スキャンで後から拾う
      return;
    }
    processed.add(el);
    const btn = createBtn(getUrl);
    elToBtn.set(el, btn);
    elToGetUrl.set(el, getUrl);
    attachedCount++;
    positionBtn(el, btn);
    updateBadge();
  }

  // DOMから消えた要素のボタンを片付ける
  function removeIfTracked(el) {
    const btn = elToBtn.get(el);
    if (btn) {
      btn.remove();
      elToBtn.delete(el);
      elToGetUrl.delete(el);
      processed.delete(el);
      attachedCount--;
      updateBadge();
    }
  }
  function cleanupRemovedNode(node) {
    if (node.nodeType !== 1) return;
    removeIfTracked(node);
    if (node.querySelectorAll) {
      node.querySelectorAll("*").forEach(removeIfTracked);
    }
  }

  function scanImages(root) {
    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => attach(img, () => img.currentSrc || img.src));
    return imgs.length;
  }

  function scanBackgroundImages(root, opts) {
    opts = opts || {};
    const candidates = new Set();

    root.querySelectorAll('[style*="background-image"]').forEach((el) => candidates.add(el));

    if (opts.full) {
      document.querySelectorAll("*").forEach((el) => {
        if (candidates.has(el) || processed.has(el)) return;
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") candidates.add(el);
      });
    }

    let count = 0;
    candidates.forEach((el) => {
      const url = getBgUrlOfEl(el);
      if (!url || !isLikelyPhoto(url)) return;
      count++;
      attach(el, () => getBgUrlOfEl(el));
    });
    return count;
  }

  // 全ボタンの位置を再計算
  let repositionTicking = false;
  function repositionAll() {
    if (repositionTicking) return;
    repositionTicking = true;
    requestAnimationFrame(() => {
      elToBtn.forEach((btn, el) => {
        if (el.isConnected) positionBtn(el, btn);
        else removeIfTracked(el); // 念のためここでも掃除
      });
      repositionTicking = false;
    });
  }

  // 初回スキャン
  const initialImgCount = scanImages(document);
  const initialBgCount = scanBackgroundImages(document, { full: true });
  log(
    `初回スキャン: img要素${initialImgCount}個 / 背景画像候補${initialBgCount}個 / ボタン設置合計${attachedCount}個`
  );
  updateBadge();

  // 動的な変化(モーダル表示・ページ送り・フィルタ切り替え等)に即座に反応
  const mo = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG") {
          attach(node, () => node.currentSrc || node.src);
        } else if (node.querySelectorAll) {
          node.querySelectorAll("img").forEach((img) => attach(img, () => img.currentSrc || img.src));
        }
        dirty = true;
      }
      for (const node of m.removedNodes) {
        cleanupRemovedNode(node);
      }
      if (m.type === "attributes") dirty = true;
    }
    if (dirty) {
      scanBackgroundImages(document, { full: false });
      repositionAll();
    }
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  // 常時バックグラウンドで動く軽量な再スキャン(モーダル表示直後など、
  // MutationObserverのタイミングだけでは拾いきれないケースの保険)
  setInterval(() => {
    scanImages(document);
    scanBackgroundImages(document, { full: false });
    repositionAll();
  }, FAST_INTERVAL_MS);

  // CSSクラス経由の背景画像も拾うための、やや重い再スキャン(低頻度で常時)
  setInterval(() => {
    scanBackgroundImages(document, { full: true });
  }, FULL_INTERVAL_MS);

  window.addEventListener("scroll", repositionAll, true);
  window.addEventListener("resize", repositionAll);

  // ---- 集中ダウンロードモード ----
  // 右上のトグルでON/OFF。ONの間は FOCUS_KEY を押すと、
  // 画面内に見えている面積が一番大きい画像をダウンロードする。
  let focusMode = false;

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function findLargestVisible() {
    let best = null;
    let bestArea = 0;
    elToGetUrl.forEach((getUrl, el) => {
      if (!el.isConnected) return;
      const area = visibleArea(el);
      if (area > bestArea && getUrl()) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function flashTarget(el, ok) {
    const r = el.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "img-downloader-flash" + (ok ? "" : " error");
    f.style.top = Math.max(r.top, 0) + "px";
    f.style.left = Math.max(r.left, 0) + "px";
    f.style.width = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0) + "px";
    f.style.height = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) + "px";
    document.documentElement.appendChild(f);
    setTimeout(() => f.remove(), 500);
  }

  function downloadLargest() {
    const el = findLargestVisible();
    if (!el) {
      log("集中ダウンロード: 対象画像なし");
      return;
    }
    const url = elToGetUrl.get(el)();
    chrome.runtime.sendMessage({ type: "download-image", url }, (response) => {
      const ok = !!(response && response.ok);
      flashTarget(el, ok);
      if (!ok) log("ダウンロード失敗:", response && response.error);
    });
  }

  function isTypingTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!focusMode) return;
      if (e.key.toLowerCase() !== FOCUS_KEY) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      downloadLargest();
    },
    true
  );

  // ---- 連続ダウンロード(集中ダウンロードモードの追加機能) ----
  // 画面内の大きい画像(3枚・6枚など)をまとめて保存 → ←/→キーで次へ、を繰り返す。
  // 進んでも新しい画像が出てこなくなったら(最後まで行ったら)自動で止まる。
  const AUTO_LARGE_RATIO = 0.4; // 一番大きい画像の面積のこの割合以上を「大きい画像」とみなす
  const AUTO_MIN_AREA = 150 * 150; // これより小さい画像(サムネイル等)は対象外
  const AUTO_WAIT_MS = 8000; // キーを押してから画像が切り替わるのを待つ最大時間
  const AUTO_SETTLE_MS = 800; // 画像の入れ替わりが落ち着いたと判断するまでの時間
  const AUTO_RETRIES = 1; // 画像が変わらなかったときにキーを押し直す回数
  const AUTO_SESSION_KEY = "__img_dl_auto__"; // ページ遷移しても続けるため、このタブのsessionStorageに状態を保存

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let auto = null; // 実行中は { dir: "left" | "right", saved: Set<url>, count, stopped }

  function collectLargeVisible() {
    // 切り替わった直後の画像もすぐ対象にするため、ここでもスキャンしておく
    scanImages(document);
    scanBackgroundImages(document, { full: false });

    const items = [];
    elToGetUrl.forEach((getUrl, el) => {
      if (!el.isConnected) return;
      const area = visibleArea(el);
      const url = getUrl();
      const r = el.getBoundingClientRect();
      if (area >= AUTO_MIN_AREA && url) items.push({ el, url, area, top: r.top, left: r.left, height: r.height });
    });
    const max = Math.max(0, ...items.map((i) => i.area));
    const large = items.filter((i) => i.area >= max * AUTO_LARGE_RATIO);

    // 同じURLの画像が重なっていることがあるので1つにまとめる
    const seen = new Set();
    const unique = large.filter((i) => !seen.has(i.url) && seen.add(i.url));

    // 読む順に並べる: 上の行から、同じ行の中は進む方向に合わせて(→なら左から、←なら右から)
    unique.sort((a, b) => {
      if (Math.abs(a.top - b.top) > Math.min(a.height, b.height) / 2) return a.top - b.top;
      return auto && auto.dir === "left" ? b.left - a.left : a.left - b.left;
    });
    return unique;
  }

  const signatureOf = (items) => items.map((i) => i.url).sort().join("\n");

  function downloadUrl(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "download-image", url }, (response) => {
        resolve(!!(response && response.ok));
      });
    });
  }

  // 矢印キーはページ本体(MAIN world)側で押したことにする(main-world.js)。
  // isolated worldから送ると、keyCodeを見るサイトでは反応しないため。
  function pressArrow(dir) {
    window.dispatchEvent(
      new CustomEvent("__img_dl_press_key__", { detail: dir === "left" ? "ArrowLeft" : "ArrowRight" })
    );
  }

  // 画面内の大きい画像の組み合わせが before から変わり、落ち着くまで待つ
  async function waitForChange(before) {
    const deadline = Date.now() + AUTO_WAIT_MS;
    let sig = before;
    while (Date.now() < deadline) {
      if (!auto || auto.stopped) return null;
      await sleep(200);
      sig = signatureOf(collectLargeVisible());
      if (sig && sig !== before) break;
    }
    if (!sig || sig === before) return null;

    let stableSince = Date.now();
    while (Date.now() - stableSince < AUTO_SETTLE_MS && Date.now() < deadline + AUTO_WAIT_MS) {
      if (!auto || auto.stopped) return null;
      await sleep(200);
      const next = signatureOf(collectLargeVisible());
      if (next !== sig) {
        sig = next;
        stableSince = Date.now();
      }
    }
    return sig;
  }

  function saveAutoSession() {
    try {
      if (auto && !auto.stopped) {
        sessionStorage.setItem(
          AUTO_SESSION_KEY,
          JSON.stringify({ dir: auto.dir, saved: [...auto.saved].slice(-500), count: auto.count })
        );
      } else {
        sessionStorage.removeItem(AUTO_SESSION_KEY);
      }
    } catch (e) {}
  }

  async function runAuto(dir, resume) {
    if (auto && !auto.stopped) return;
    auto = {
      dir,
      saved: new Set(resume ? resume.saved : []),
      count: resume ? resume.count : 0,
      stopped: false
    };
    const me = auto;
    renderAuto();

    while (!me.stopped) {
      const items = collectLargeVisible();
      const fresh = items.filter((i) => !me.saved.has(i.url));

      for (const item of fresh) {
        if (me.stopped) break;
        const ok = await downloadUrl(item.url);
        if (item.el.isConnected) flashTarget(item.el, ok);
        me.saved.add(item.url);
        if (ok) me.count++;
        saveAutoSession();
        renderAuto();
      }
      if (me.stopped) break;

      // 次へ進む。画像が変わらなければ押し直し、それでもだめなら終了
      const before = signatureOf(items);
      let after = null;
      for (let i = 0; i <= AUTO_RETRIES && !me.stopped; i++) {
        saveAutoSession(); // キーでページ遷移しても続きから再開できるように
        pressArrow(dir);
        after = await waitForChange(before);
        if (after) break;
      }
      if (me.stopped) break;

      const hasNew = after && collectLargeVisible().some((i) => !me.saved.has(i.url));
      if (!hasNew) {
        stopAuto(`完了: ${me.count}枚`);
        break;
      }
    }
  }

  function stopAuto(message) {
    if (!auto) return;
    auto.stopped = true;
    saveAutoSession();
    renderAuto(message || `停止: ${auto.count}枚`);
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && auto && !auto.stopped) {
        e.preventDefault();
        e.stopPropagation();
        stopAuto();
      }
    },
    true
  );

  // 右上のトグル(ページ内オーバーレイ)
  // 拡張機能のUIとして描画されるので、ページのCSSに影響されないようShadow DOMに入れる
  let toggleInput = null;
  let ui = null;
  function createToggle() {
    const host = document.createElement("div");
    host.id = "__img_dl_focus_toggle__";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; position: fixed; top: 8px; right: 8px; z-index: 2147483647; }
        .panel { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 14px;
          background: rgba(0,0,0,.65); color: #fff; font: 12px/1 sans-serif;
          user-select: none; box-shadow: 0 1px 4px rgba(0,0,0,.4); opacity: .7; transition: opacity .15s; }
        .panel:hover, .panel.on { opacity: 1; }
        label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        input { display: none; }
        .sw { position: relative; width: 26px; height: 14px; border-radius: 7px; background: #888; transition: background .15s; }
        .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
          border-radius: 50%; background: #fff; transition: transform .15s; }
        input:checked + .sw { background: #2e9e4f; }
        input:checked + .sw::after { transform: translateX(12px); }
        .auto { display: none; align-items: center; gap: 4px; padding-left: 6px; border-left: 1px solid rgba(255,255,255,.3); }
        .panel.on .auto, .panel.running .auto { display: flex; }
        button { all: unset; cursor: pointer; padding: 3px 7px; border-radius: 9px; background: rgba(255,255,255,.18); }
        button:hover { background: rgba(255,255,255,.32); }
        .stop { display: none; background: #c83a3a; }
        .stop:hover { background: #e04848; }
        .panel.running .stop { display: inline-block; }
        .panel.running .go { display: none; }
        .status:empty { display: none; }
      </style>
      <div class="panel">
        <label title="ONの間、${FOCUS_KEY.toUpperCase()}キーで画面内の一番大きい画像を保存">
          <input type="checkbox"><span class="sw"></span><span>集中DL (${FOCUS_KEY.toUpperCase()})</span>
        </label>
        <span class="auto">
          <button class="go" data-dir="left" title="画面内の大きい画像を全部保存して←キーで次へ、を繰り返す">◀ 連続</button>
          <button class="go" data-dir="right" title="画面内の大きい画像を全部保存して→キーで次へ、を繰り返す">連続 ▶</button>
          <button class="stop" title="連続ダウンロードを止める(Escキーでも止まります)">停止</button>
          <span class="status"></span>
        </span>
      </div>`;
    toggleInput = shadow.querySelector("input");
    toggleInput.addEventListener("change", () => {
      chrome.storage.local.set({ [FOCUS_STORAGE_KEY]: toggleInput.checked });
    });
    shadow.querySelectorAll(".go").forEach((b) =>
      b.addEventListener("click", () => runAuto(b.dataset.dir))
    );
    shadow.querySelector(".stop").addEventListener("click", () => stopAuto());
    ui = { panel: shadow.querySelector(".panel"), status: shadow.querySelector(".status") };
    document.documentElement.appendChild(host);
    return host;
  }

  createToggle();

  let statusTimer = null;
  function renderAuto(message) {
    const running = !!(auto && !auto.stopped);
    ui.panel.classList.toggle("running", running);
    clearTimeout(statusTimer);
    if (running) {
      ui.status.textContent = `${auto.dir === "left" ? "◀" : "▶"} ${auto.count}枚`;
    } else {
      ui.status.textContent = message || "";
      if (message) statusTimer = setTimeout(() => (ui.status.textContent = ""), 5000);
    }
  }

  function applyFocusMode(on) {
    focusMode = !!on;
    toggleInput.checked = focusMode;
    ui.panel.classList.toggle("on", focusMode);
  }

  // ON/OFFは全タブ共通で保存し、他タブでの切り替えにも追従する
  chrome.storage.local.get(FOCUS_STORAGE_KEY, (res) => applyFocusMode(res[FOCUS_STORAGE_KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[FOCUS_STORAGE_KEY]) {
      applyFocusMode(changes[FOCUS_STORAGE_KEY].newValue);
    }
  });

  // ←/→キーでページ自体が切り替わるサイトでは、遷移後のページで続きから再開する
  try {
    const saved = JSON.parse(sessionStorage.getItem(AUTO_SESSION_KEY) || "null");
    if (saved && (saved.dir === "left" || saved.dir === "right")) {
      setTimeout(() => runAuto(saved.dir, saved), AUTO_SETTLE_MS);
    }
  } catch (e) {}
})();
