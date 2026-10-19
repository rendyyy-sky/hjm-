// @ts-nocheck
(function () {
  "use strict";

  var P = 4;
  var START_ROWS = 15;
  var KEY = "cekih-skor-v2";
  var THEME_KEY = "cekih-tema";
  var HIST_KEY = "cekih-riwayat-v1";
  var UNDO_LIMIT = 100;
  var DENOMS = [500, 250, 100, 50, 10, 5];

  var CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';

  var coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) {}
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var typing = false;
  var active = null;
  var prevTotals = null;

  function blankRows(n) {
    var rows = [];
    for (var i = 0; i < n; i++) rows.push(["", "", "", ""]);
    return rows;
  }

  var state = {
    names: ["Pemain 1", "Pemain 2", "Pemain 3", "Pemain 4"],
    rows: blankRows(START_ROWS),
    mode: "high"
  };

  /* ---------- Simpan dan muat ---------- */
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && Array.isArray(s.names) && s.names.length === P && Array.isArray(s.rows) && s.rows.length > 0) {
        state.names = s.names.map(function (n) { return String(n); });
        state.rows = s.rows.map(function (r) {
          var out = [];
          for (var c = 0; c < P; c++) out.push(r && r[c] != null ? String(r[c]) : "");
          return out;
        });
        if (s.mode === "low") state.mode = "low";
      }
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var history = [];
  try {
    var hraw = localStorage.getItem(HIST_KEY);
    if (hraw) {
      var h = JSON.parse(hraw);
      if (Array.isArray(h)) history = h;
    }
  } catch (e) {}
  function saveHistory() {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch (e) {}
  }

  /* ---------- Urungkan ---------- */
  var undoStack = [];
  var lastGroup = null;
  var focusSeq = 0;

  function copyRows(rows) { return rows.map(function (r) { return r.slice(); }); }

  function pushUndo(group) {
    if (group && group === lastGroup) return;
    lastGroup = group || null;
    undoStack.push(copyRows(state.rows));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    updateUndoUI();
  }

  function updateUndoUI() {
    var none = undoStack.length === 0;
    $("undoBtn").disabled = none;
    $("undoDock").disabled = none;
  }

  function undo() {
    if (!undoStack.length) return;
    var keep = active ? { r: +active.dataset.r, c: +active.dataset.c } : null;
    state.rows = undoStack.pop();
    lastGroup = null;
    save();
    prevTotals = null;
    renderBody();
    updateUndoUI();
    if (keep) {
      var el = cellEl(Math.min(keep.r, state.rows.length - 1), keep.c);
      if (el) el.focus();
    } else {
      dock.hidden = true;
    }
    toast("Poin terakhir diurungkan");
  }

  /* ---------- Pemberitahuan singkat ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- Elemen ---------- */
  var body = document.getElementById("body");
  var dock = document.getElementById("dock");
  var where = document.getElementById("where");

  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function fmt(n) { return n.toLocaleString("id-ID"); }
  function signed(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n)); }
  function cellEl(r, c) { return $("c-" + r + "-" + c); }
  function pname(c) { return state.names[c] || "Pemain " + (c + 1); }

  /* ---------- Tabel ---------- */
  function renderBody() {
    body.innerHTML = "";
    state.rows.forEach(function (row, r) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.className = "rn";
      th.scope = "row";
      th.textContent = "R" + (r + 1);
      tr.appendChild(th);
      for (var c = 0; c < P; c++) {
        var td = document.createElement("td");
        td.className = "p" + c;
        var inp = document.createElement("input");
        inp.className = "cell";
        inp.type = "text";
        inp.id = "c-" + r + "-" + c;
        inp.setAttribute("inputmode", coarse && !typing ? "none" : "numeric");
        inp.setAttribute("autocomplete", "off");
        inp.setAttribute("aria-label", "Ronde " + (r + 1) + ", " + pname(c));
        inp.dataset.r = r;
        inp.dataset.c = c;
        inp.value = row[c];
        if (row[c].charAt(0) === "-") inp.classList.add("neg");
        td.appendChild(inp);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
    refresh();
  }

  /* ---------- Total, peringkat, kartu pemain ---------- */
  function pop(el) {
    if (reduceMotion || !el.animate) return;
    el.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.1)" }, { transform: "scale(1)" }],
      { duration: 280, easing: "ease-out" }
    );
  }

  function refresh() {
    var totals = [];
    for (var c = 0; c < P; c++) {
      var t = 0;
      for (var r = 0; r < state.rows.length; r++) t += num(state.rows[r][c]);
      totals.push(t);
    }

    var allEqual = totals.every(function (t) { return t === totals[0]; });

    for (c = 0; c < P; c++) {
      var tot = totals[c];

      var foot = $("tot" + c);
      foot.textContent = fmt(tot);
      foot.classList.toggle("neg", tot < 0);

      var big = $("ptot" + c);
      big.textContent = fmt(tot);
      big.classList.toggle("neg", tot < 0);
      if (prevTotals && prevTotals[c] !== tot) pop(big);

      var last = "";
      for (r = state.rows.length - 1; r >= 0; r--) {
        var v = state.rows[r][c];
        if (v !== "" && v !== "-") { last = signed(num(v)); break; }
      }
      $("plast" + c).textContent = last ? "Ronde terakhir " + last : "Belum ada poin";

      var better = 0;
      for (var k = 0; k < P; k++) {
        if (k === c) continue;
        if (state.mode === "high" ? totals[k] > tot : totals[k] < tot) better++;
      }
      var rank = better + 1;
      var chip = $("rank" + c);
      var card = chip.parentNode;
      if (allEqual) {
        chip.hidden = true;
        card.classList.remove("lead");
      } else {
        chip.hidden = false;
        if (rank === 1) chip.innerHTML = CROWN + "Memimpin";
        else chip.textContent = "Peringkat " + rank;
        card.classList.toggle("lead", rank === 1);
      }
    }
    prevTotals = totals;
  }

  function setCell(r, c, v) {
    state.rows[r][c] = v;
    var el = cellEl(r, c);
    if (el) {
      el.value = v;
      el.classList.toggle("neg", v.charAt(0) === "-");
    }
    refresh();
    save();
  }

  function clean(v) {
    v = v.replace(/[^\d-]/g, "");
    var neg = v.charAt(0) === "-";
    v = v.replace(/-/g, "");
    if (v.length > 7) v = v.slice(0, 7);
    return (neg ? "-" : "") + v;
  }

  /* ---------- Sel yang dipilih ---------- */
  function markRow() {
    var rows = body.querySelectorAll("tr.on");
    for (var i = 0; i < rows.length; i++) rows[i].classList.remove("on");
    if (active) active.closest("tr").classList.add("on");
  }

  function label() {
    if (!active) return;
    var r = +active.dataset.r;
    var c = +active.dataset.c;
    where.innerHTML = "Ronde <b>" + (r + 1) + "</b> &middot; <b></b>";
    where.lastChild.textContent = pname(c);
  }

  function advance() {
    if (!active) return;
    var r = +active.dataset.r;
    var c = +active.dataset.c;
    if (c < P - 1) c++;
    else if (r < state.rows.length - 1) { r++; c = 0; }
    var next = cellEl(r, c);
    if (next) {
      next.focus();
      try { next.select(); } catch (e) {}
    }
  }

  body.addEventListener("input", function (e) {
    var t = e.target;
    if (!t.classList.contains("cell")) return;
    var v = clean(t.value);
    if (v !== t.value) t.value = v;
    pushUndo("ketik-" + focusSeq + "-" + t.dataset.r + "-" + t.dataset.c);
    setCell(+t.dataset.r, +t.dataset.c, v);
  });

  body.addEventListener("focusin", function (e) {
    var t = e.target;
    if (!t.classList.contains("cell")) return;
    active = t;
    focusSeq++;
    dock.hidden = false;
    markRow();
    label();
  });

  body.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.classList.contains("cell")) {
      e.preventDefault();
      advance();
    }
  });

  document.addEventListener("focusout", function (e) {
    var to = e.relatedTarget;
    if (to && to.closest && (to.closest("#dock") || to.closest("#body"))) return;
    setTimeout(function () {
      var a = document.activeElement;
      if (!a || !a.closest || !(a.closest("#dock") || a.closest("#body"))) {
        dock.hidden = true;
        active = null;
        markRow();
      }
    }, 0);
  });

  /* ---------- Nama pemain ---------- */
  [].forEach.call(document.querySelectorAll(".pname"), function (inp) {
    var p = +inp.dataset.p;
    inp.value = state.names[p];
    $("th" + p).textContent = pname(p);
    inp.addEventListener("input", function () {
      state.names[p] = inp.value;
      $("th" + p).textContent = pname(p);
      save();
    });
    inp.addEventListener("change", function () {
      [].forEach.call(document.querySelectorAll('.cell[data-c="' + p + '"]'), function (el) {
        el.setAttribute("aria-label", "Ronde " + (+el.dataset.r + 1) + ", " + pname(p));
      });
    });
  });

  /* ---------- Tombol poin ---------- */
  var chips = $("chips");

  function addChip(val) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip " + (val < 0 ? "neg" : "pos");
    b.dataset.val = val;
    b.textContent = (val < 0 ? "−" : "+") + Math.abs(val);
    chips.appendChild(b);
  }

  DENOMS.forEach(function (d) { addChip(-d); });
  var gap = document.createElement("span");
  gap.className = "gap";
  chips.appendChild(gap);
  DENOMS.slice().reverse().forEach(function (d) { addChip(d); });

  dock.addEventListener("mousedown", function (e) {
    if (e.target.closest("button")) e.preventDefault();
  });

  chips.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b || !active) return;
    pushUndo(null);
    setCell(+active.dataset.r, +active.dataset.c, String(b.dataset.val));
    advance();
  });

  $("clear").addEventListener("click", function () {
    if (!active) return;
    pushUndo(null);
    setCell(+active.dataset.r, +active.dataset.c, "");
  });

  $("flip").addEventListener("click", function () {
    if (!active) return;
    var r = +active.dataset.r;
    var c = +active.dataset.c;
    var v = state.rows[r][c];
    v = v.charAt(0) === "-" ? v.slice(1) : "-" + v;
    pushUndo(null);
    setCell(r, c, v);
  });

  var typeBtn = $("typeMode");
  typeBtn.hidden = !coarse;
  typeBtn.addEventListener("click", function () {
    typing = !typing;
    typeBtn.setAttribute("aria-pressed", String(typing));
    [].forEach.call(document.querySelectorAll(".cell"), function (el) {
      el.setAttribute("inputmode", coarse && !typing ? "none" : "numeric");
    });
    if (active) {
      var keep = active;
      keep.blur();
      keep.focus();
    }
  });

  /* ---------- Aturan pemenang ---------- */
  function applyMode() {
    $("modeHigh").setAttribute("aria-pressed", String(state.mode === "high"));
    $("modeLow").setAttribute("aria-pressed", String(state.mode === "low"));
    refresh();
  }
  $("modeHigh").addEventListener("click", function () { state.mode = "high"; save(); applyMode(); });
  $("modeLow").addEventListener("click", function () { state.mode = "low"; save(); applyMode(); });

  /* ---------- Ronde dan reset ---------- */
  $("addRound").addEventListener("click", function () {
    pushUndo(null);
    state.rows.push(["", "", "", ""]);
    save();
    renderBody();
    var el = cellEl(state.rows.length - 1, 0);
    if (el) el.focus();
  });

  var resetAsk = $("resetAsk");
  var resetBox = $("resetBox");
  resetAsk.addEventListener("click", function () { resetAsk.hidden = true; resetBox.hidden = false; });
  $("resetNo").addEventListener("click", function () { resetBox.hidden = true; resetAsk.hidden = false; });
  $("resetYes").addEventListener("click", function () {
    pushUndo(null);
    state.rows = blankRows(START_ROWS);
    save();
    active = null;
    dock.hidden = true;
    prevTotals = null;
    renderBody();
    resetBox.hidden = true;
    resetAsk.hidden = false;
  });

  $("undoBtn").addEventListener("click", undo);
  $("undoDock").addEventListener("click", undo);
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undo();
    }
  });

  /* ---------- Selesai: pemenang dan riwayat ---------- */
  var finish = $("finish");
  var pending = null;

  function computeResult() {
    var totals = [];
    for (var c = 0; c < P; c++) {
      var t = 0;
      for (var r = 0; r < state.rows.length; r++) t += num(state.rows[r][c]);
      totals.push(t);
    }
    var order = [0, 1, 2, 3].sort(function (a, b) {
      return state.mode === "high" ? totals[b] - totals[a] : totals[a] - totals[b];
    });
    var best = totals[order[0]];
    var winners = order.filter(function (i) { return totals[i] === best; });
    return { totals: totals, order: order, winners: winners };
  }

  function hasAnyScore() {
    return state.rows.some(function (row) {
      return row.some(function (v) { return v !== "" && v !== "-"; });
    });
  }

  function winnerText(names, winners) {
    return winners.map(function (i) { return names[i] || "Pemain " + (i + 1); }).join(" & ");
  }

  function openFinish() {
    if (!hasAnyScore()) { toast("Belum ada poin yang diisi"); return; }
    var res = computeResult();
    pending = res;
    var lead = res.winners[0];
    finish.style.setProperty("--wc", "var(--p" + lead + ")");
    $("finName").textContent = winnerText(state.names, res.winners);
    $("finSub").textContent =
      (res.winners.length > 1 ? "Seri dengan " : "Menang dengan ") + fmt(res.totals[lead]) + " poin (" +
      (state.mode === "high" ? "tertinggi menang" : "terendah menang") + ")";
    var list = $("finList");
    list.innerHTML = "";
    res.order.forEach(function (i, idx) {
      var li = document.createElement("li");
      li.className = "fin-row p" + i + (res.totals[i] === res.totals[lead] ? " top" : "");
      var rk = document.createElement("span");
      rk.className = "fin-rank";
      var place = 1;
      for (var k = 0; k < P; k++) {
        if (k !== i && (state.mode === "high" ? res.totals[k] > res.totals[i] : res.totals[k] < res.totals[i])) place++;
      }
      rk.textContent = String(place);
      var badge = document.createElement("span");
      badge.className = "badge";
      badge.innerHTML = '<svg class="suit"><use href="#s-' + ["spade", "heart", "diamond", "club"][i] + '"/></svg>';
      var nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = pname(i);
      var sc = document.createElement("span");
      sc.className = "sc" + (res.totals[i] < 0 ? " neg" : "");
      sc.textContent = fmt(res.totals[i]);
      li.appendChild(rk); li.appendChild(badge); li.appendChild(nm); li.appendChild(sc);
      list.appendChild(li);
    });
    if (finish.showModal) { try { finish.showModal(); } catch (e) { finish.setAttribute("open", ""); } }
    else finish.setAttribute("open", "");
  }

  function closeFinish() {
    if (finish.close) { try { finish.close(); } catch (e) { finish.removeAttribute("open"); } }
    else finish.removeAttribute("open");
  }

  $("finishBtn").addEventListener("click", openFinish);
  $("finBack").addEventListener("click", closeFinish);
  finish.addEventListener("click", function (e) { if (e.target === finish) closeFinish(); });

  $("finSave").addEventListener("click", function () {
    if (!pending) return;
    var rows = copyRows(state.rows);
    while (rows.length > 1 && rows[rows.length - 1].every(function (v) { return v === "" || v === "-"; })) rows.pop();
    history.unshift({
      id: Date.now(),
      date: new Date().toISOString(),
      names: state.names.slice(),
      rows: rows,
      totals: pending.totals,
      winners: pending.winners,
      mode: state.mode
    });
    if (history.length > 50) history.length = 50;
    saveHistory();
    pushUndo(null);
    state.rows = blankRows(START_ROWS);
    save();
    active = null;
    dock.hidden = true;
    prevTotals = null;
    pending = null;
    closeFinish();
    renderBody();
    renderHistory();
    toast("Permainan disimpan di riwayat");
  });

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }

  function renderHistory() {
    var list = $("histList");
    list.innerHTML = "";
    $("histEmpty").hidden = history.length > 0;
    $("histClear").hidden = history.length === 0;
    history.forEach(function (g) {
      var det = document.createElement("details");
      det.className = "hist-item";

      var sum = document.createElement("summary");
      var top = document.createElement("div");
      top.className = "hist-top";
      var win = document.createElement("span");
      win.className = "hist-win";
      win.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';
      var wn = document.createElement("span");
      wn.textContent = winnerText(g.names, g.winners);
      win.appendChild(wn);
      var dt = document.createElement("span");
      dt.className = "hist-date";
      dt.textContent = fmtDate(g.date);
      top.appendChild(win);
      top.appendChild(dt);
      sum.appendChild(top);

      var tots = document.createElement("div");
      tots.className = "hist-totals";
      for (var i = 0; i < P; i++) {
        var chip = document.createElement("span");
        chip.className = "hist-tot p" + i + (g.winners.indexOf(i) >= 0 ? " win" : "");
        var n = document.createElement("span");
        n.textContent = g.names[i] || "Pemain " + (i + 1);
        var b = document.createElement("b");
        b.textContent = fmt(g.totals[i]);
        if (g.totals[i] < 0) b.className = "neg";
        chip.appendChild(n);
        chip.appendChild(b);
        tots.appendChild(chip);
      }
      sum.appendChild(tots);
      det.appendChild(sum);

      var bodyEl = document.createElement("div");
      bodyEl.className = "hist-body";
      var wrap = document.createElement("div");
      wrap.className = "hist-scroll";
      var tbl = document.createElement("table");
      tbl.className = "hist-table";
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      var h0 = document.createElement("th");
      h0.textContent = "Ronde";
      hr.appendChild(h0);
      for (i = 0; i < P; i++) {
        var th = document.createElement("th");
        th.className = "p" + i;
        th.textContent = g.names[i] || "Pemain " + (i + 1);
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      tbl.appendChild(thead);
      var tb = document.createElement("tbody");
      g.rows.forEach(function (row, r) {
        var tr = document.createElement("tr");
        var rn = document.createElement("td");
        rn.className = "rn";
        rn.textContent = "R" + (r + 1);
        tr.appendChild(rn);
        for (var c = 0; c < P; c++) {
          var td = document.createElement("td");
          var v = row[c];
          td.textContent = v === "" || v === "-" ? "" : fmt(num(v));
          if (v.charAt(0) === "-") td.className = "neg";
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      var tf = document.createElement("tfoot");
      var fr = document.createElement("tr");
      var f0 = document.createElement("td");
      f0.textContent = "Total";
      fr.appendChild(f0);
      for (var c = 0; c < P; c++) {
        var ft = document.createElement("td");
        ft.textContent = fmt(g.totals[c]);
        if (g.totals[c] < 0) ft.className = "neg";
        fr.appendChild(ft);
      }
      tf.appendChild(fr);
      tbl.appendChild(tf);
      wrap.appendChild(tbl);
      bodyEl.appendChild(wrap);
 
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn small danger";
      del.textContent = "Hapus permainan ini";
      del.addEventListener("click", function () {
        if (del.dataset.ask !== "1") {
          del.dataset.ask = "1";
          del.textContent = "Yakin hapus? Ketuk lagi";
          setTimeout(function () { del.dataset.ask = ""; del.textContent = "Hapus permainan ini"; }, 3000);
          return;
        }
        history = history.filter(function (x) { return x.id !== g.id; });
        saveHistory();
        renderHistory();
      });
      bodyEl.appendChild(del);
      det.appendChild(bodyEl);
      list.appendChild(det);
    });
  }
 
  var histClear = $("histClear");
  histClear.addEventListener("click", function () {
    if (histClear.dataset.ask !== "1") {
      histClear.dataset.ask = "1";
      histClear.textContent = "Yakin? Ketuk lagi";
      setTimeout(function () { histClear.dataset.ask = ""; histClear.textContent = "Hapus semua"; }, 3000);
      return;
    }
    histClear.dataset.ask = "";
    histClear.textContent = "Hapus semua";
    history = [];
    saveHistory();
    renderHistory();
  });
 
  /* ---------- Tema terang atau gelap ---------- */
  var root = document.documentElement;
  try {
    var savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") root.setAttribute("data-theme", savedTheme);
  } catch (e) {}
 
  function currentTheme() {
    var a = root.getAttribute("data-theme");
    if (a) return a;
    try { return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; } catch (e) { return "dark"; }
  }
  $("themeBtn").addEventListener("click", function () {
    var next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });
 
  /* ---------- Mulai ---------- */
  applyMode();
  renderBody();
  renderHistory();
  updateUndoUI();
})();