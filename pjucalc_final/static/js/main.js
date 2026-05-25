/* ═══════════════════════════════════════════════
   PJUCalc — main.js (UPDATED)
   Visualisasi berskala: mendukung panjang hingga puluhan km
   Data SNI dikoreksi sesuai SNI 7391:2008
═══════════════════════════════════════════════ */

// ── State ──
let segments = [];
let segmentCounter = 0;
let lastResult = null;
let OPTIONS = {};

// State zoom/pan canvas
let canvasState = {
  pxPerMeter: 2,   // default: 2px per meter
  minPxPerMeter: 0.05,
  maxPxPerMeter: 20,
  data: null,
};

// ── Init ──
document.addEventListener("DOMContentLoaded", async () => {
  await loadOptions();
  bindUI();
  updateSNIInfo();
  addSegment("straight");
});

async function loadOptions() {
  try {
    const res = await fetch("/api/options");
    OPTIONS = await res.json();
  } catch(e) { console.warn("Gagal load options:", e); }
}

// ── Bind UI ──
function bindUI() {
  document.getElementById("road_class").addEventListener("change", updateSNIInfo);
  document.getElementById("btn_recommend").addEventListener("click", autoRecommend);
  document.getElementById("btn_calculate").addEventListener("click", calculate);
  document.getElementById("btn_export_json").addEventListener("click", exportJSON);
  document.getElementById("btn_export_csv").addEventListener("click", exportCSV);
  document.getElementById("btn_export_print").addEventListener("click", doPrint);
  document.getElementById("btn_zoom_in").addEventListener("click", () => zoomCanvas(1.5));
  document.getElementById("btn_zoom_out").addEventListener("click", () => zoomCanvas(1/1.5));
  document.getElementById("btn_zoom_fit").addEventListener("click", zoomFit);
  document.querySelectorAll(".btn-add").forEach(btn => {
    btn.addEventListener("click", () => addSegment(btn.dataset.type));
  });

  // Drag-to-pan canvas
  const vp = document.getElementById("canvas_viewport");
  let dragging = false, startX = 0, startSL = 0;
  vp.addEventListener("mousedown", e => { dragging = true; startX = e.pageX; startSL = vp.scrollLeft; });
  window.addEventListener("mouseup", () => { dragging = false; });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    vp.scrollLeft = startSL - (e.pageX - startX);
  });
}

// ── SNI Info Box ──
function updateSNIInfo() {
  const cls = document.getElementById("road_class").value;
  if (!OPTIONS.road_classes) return;
  const sni = OPTIONS.road_classes[cls];
  if (!sni) return;
  const box = document.getElementById("sni_info");
  box.querySelector(".sni-row:nth-child(1) strong").textContent =
    `${sni.E_min_range}–${sni.E_max_range} lux (avg ${sni.E_avg})`;
  box.querySelector(".sni-row:nth-child(2) strong").textContent = `${sni.E_min} lux`;
  box.querySelector(".sni-row:nth-child(3) strong").textContent = sni.g1;
  const noteEl = document.getElementById("sni_note");
  if (noteEl) noteEl.querySelector("span").textContent = sni.note || "";
}

// ── Segment Management ──
function addSegment(type) {
  const id = ++segmentCounter;
  segments.push({ id, type, name: defaultName(type, id) });
  renderSegments();
}
function deleteSegment(id) {
  segments = segments.filter(s => s.id !== id);
  renderSegments();
}
function defaultName(type, id) {
  return ({ straight:"Jalan Lurus", taper:"Jalan Taper", curve:"Tikungan", intersection:"Persimpangan" }[type] || type) + " " + id;
}
function typeName(type) {
  return { straight:"Lurus", taper:"Taper", curve:"Tikungan", intersection:"Persimpangan" }[type] || type;
}

function renderSegments() {
  const container = document.getElementById("segments_list");
  container.innerHTML = "";
  segments.forEach(seg => {
    const div = document.createElement("div");
    div.className = "segment-card";
    div.innerHTML = `
      <div class="segment-card-header">
        <span class="seg-type-badge badge-${seg.type}">${typeName(seg.type)}</span>
        <button class="seg-delete" onclick="deleteSegment(${seg.id})">✕</button>
      </div>
      ${segmentFields(seg)}`;
    container.appendChild(div);
  });
}

function segmentFields(seg) {
  const id = seg.id;
  if (seg.type === "intersection") {
    return `
      <div class="field-row">
        <div class="field-group">
          <label class="seg-label">Lebar Jalan (m)</label>
          <input type="number" id="seg_${id}_width_start" value="${seg.width_start||7}" min="3" max="50" step="0.5">
        </div>
        <div class="field-group">
          <label class="seg-label">Tipe Persimpangan</label>
          <select id="seg_${id}_intersection_type">
            <option value="4way">4 Arah (+)</option>
            <option value="3way">3 Arah (T)</option>
            <option value="roundabout">Bundaran</option>
          </select>
        </div>
      </div>`;
  }
  const showEnd = seg.type === "taper";
  return `
    <div class="field-row">
      <div class="field-group">
        <label class="seg-label">Panjang (m)</label>
        <input type="number" id="seg_${id}_length" value="${seg.length||500}" min="10" max="100000" step="10">
      </div>
      <div class="field-group">
        <label class="seg-label">Lebar ${showEnd?'Awal ':''}(m)</label>
        <input type="number" id="seg_${id}_width_start" value="${seg.width_start||7}" min="2" max="50" step="0.5">
      </div>
    </div>
    ${showEnd ? `
    <div class="field-group">
      <label class="seg-label">Lebar Akhir (m)</label>
      <input type="number" id="seg_${id}_width_end" value="${seg.width_end||14}" min="2" max="50" step="0.5">
    </div>` : ""}`;
}

function collectSegments() {
  return segments.map(seg => {
    const id = seg.id;
    const gv = key => { const el = document.getElementById(`seg_${id}_${key}`); return el ? parseFloat(el.value)||0 : 0; };
    const gs = key => { const el = document.getElementById(`seg_${id}_${key}`); return el ? el.value : ""; };
    const obj = { id, type: seg.type, name: seg.name };
    if (seg.type !== "intersection") {
      obj.length      = gv("length")      || 500;
      obj.width_start = gv("width_start") || 7;
      obj.width_end   = seg.type === "taper" ? (gv("width_end")||14) : obj.width_start;
    } else {
      obj.width_start      = gv("width_start") || 7;
      obj.intersection_type = gs("intersection_type") || "4way";
    }
    return obj;
  });
}

// ── Auto Recommend ──
async function autoRecommend() {
  const segs  = collectSegments();
  const first = segs.find(s => s.width_start);
  const width = first ? first.width_start : 7;
  const btn   = document.getElementById("btn_recommend");
  btn.textContent = "Mencari..."; btn.disabled = true;
  try {
    const res  = await fetch("/api/recommend", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        road_class:  document.getElementById("road_class").value,
        road_width:  width,
        arrangement: document.getElementById("arrangement").value,
      })
    });
    const data = await res.json();
    document.getElementById("lamp_key").value  = data.lamp_key;
    document.getElementById("pole_key").value  = data.pole_key;
    document.getElementById("rec_hint").textContent = data.reason;
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 4.8L18 8l-4 3.9 1 5.6L10 15l-5 2.5 1-5.6L2 8l5.6-.2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Auto-Rekomendasikan (Tabel 9 SNI)`;
    btn.disabled = false;
  }
}

// ── Calculate ──
async function calculate() {
  if (!segments.length) { alert("Tambahkan minimal satu segmen jalan."); return; }
  const btn = document.getElementById("btn_calculate");
  btn.textContent = "Menghitung..."; btn.disabled = true;

  const payload = {
    road_class:  document.getElementById("road_class").value,
    lamp_key:    document.getElementById("lamp_key").value,
    pole_key:    document.getElementById("pole_key").value,
    arrangement: document.getElementById("arrangement").value,
    curve_type:  document.getElementById("curve_type").value,
    segments:    collectSegments(),
  };

  try {
    const res  = await fetch("/api/calculate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const json = await res.json();
    if (json.success) {
      lastResult = { payload, result: json.data };
      renderResults(json.data);
    } else {
      alert("Error: " + json.error);
    }
  } catch(e) {
    alert("Gagal menghubungi server: " + e.message);
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3M14 3h7m0 0v7m0-7L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Hitung Kebutuhan PJU`;
    btn.disabled = false;
  }
}

// ── Render Results ──
function renderResults(data) {
  document.getElementById("empty_state").style.display  = "none";
  document.getElementById("results_area").style.display = "block";
  const s = data.summary;

  // KPI
  document.getElementById("kpi_grid").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Titik Lampu</div>
      <div class="kpi-value">${s.total_poles.toLocaleString("id")}</div>
      <div class="kpi-unit">unit tiang lampu</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">Total Panjang Jalan</div>
      <div class="kpi-value">${s.total_length >= 1000 ? (s.total_length/1000).toFixed(2) : s.total_length.toLocaleString("id")}</div>
      <div class="kpi-unit">${s.total_length >= 1000 ? "km" : "meter"}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Daya Total</div>
      <div class="kpi-value">${s.daya_total_kw}</div>
      <div class="kpi-unit">kW — ${s.kwh_per_bulan.toLocaleString("id")} kWh/bln</div>
    </div>
    <div class="kpi-card red">
      <div class="kpi-label">Estimasi Anggaran</div>
      <div class="kpi-value">${shortRupiah(s.biaya_total)}</div>
      <div class="kpi-unit">total investasi awal</div>
    </div>`;

  // SNI warning bar
  const warns = data.segments.filter(seg => seg.compliant === false);
  const warnBar = document.getElementById("sni_warn_bar");
  if (warns.length) {
    warnBar.style.display = "block";
    warnBar.innerHTML = `⚠ ${warns.length} segmen E aktual di bawah syarat SNI. Solusi: ganti lampu ke watt lebih tinggi atau perkecil jarak tiang.`;
  } else {
    warnBar.style.display = "none";
  }

  // Tabel segmen
  const tbody = document.getElementById("segment_tbody");
  tbody.innerHTML = "";
  data.segments.forEach(seg => {
    const ok  = seg.compliant !== false;
    const sp  = seg.spacing || (seg.zones ? "Var" : "—");
    const Ea  = seg.E_actual || (seg.zones ? avg(seg.zones.map(z => z.E_actual)) : "—");
    const len = seg.length ? (seg.length >= 1000 ? (seg.length/1000).toFixed(2)+"km" : seg.length+"m") : "—";
    const cfLabel = seg.curve_factor && seg.curve_factor < 1 ? `×${seg.curve_factor}` : "1.00";

    tbody.innerHTML += `
      <tr>
        <td>${seg.segment_name}</td>
        <td>${seg.type}</td>
        <td>${len}</td>
        <td>${seg.width_start}m${seg.width_end && seg.width_end !== seg.width_start ? "→"+seg.width_end+"m" : ""}</td>
        <td>${sp !== "—" && sp !== "Var" ? sp+"m" : sp}</td>
        <td>${cfLabel}</td>
        <td><strong>${seg.total_poles.toLocaleString("id")}</strong></td>
        <td>${Ea !== "—" ? Ea+" lux" : "—"}</td>
        <td>${seg.E_required ? seg.E_required+" lux" : "—"}</td>
        <td class="method-tag">${seg.method || "—"}</td>
        <td class="${ok ? "badge-ok" : "badge-warn"}">${ok ? "✓ OK" : "⚠ Cek"}</td>
      </tr>`;
    if (seg.zones) {
      seg.zones.forEach(z => {
        tbody.innerHTML += `
          <tr style="opacity:0.6;font-size:0.68rem">
            <td style="padding-left:20px">↳ Zona ${z.zone}</td>
            <td>${z.width_start}→${z.width_end}m</td>
            <td>${z.length}m</td>
            <td colspan="2">${z.spacing}m</td>
            <td>—</td><td>${z.poles}</td>
            <td>${z.E_actual} lux</td>
            <td colspan="3">—</td>
          </tr>`;
      });
    }
  });

  // Cost
  document.getElementById("cost_breakdown").innerHTML = `
    <div class="cost-grid">
      <div class="cost-row"><span>Lampu (${s.total_poles.toLocaleString("id")} unit)</span><strong>${rupiah(s.biaya_lampu)}</strong></div>
      <div class="cost-row"><span>Tiang & Pondasi</span><strong>${rupiah(s.biaya_tiang)}</strong></div>
      <div class="cost-row"><span>Kabel & Jaringan</span><strong>${rupiah(s.biaya_kabel)}</strong></div>
      <div class="cost-row"><span>Instalasi & Komisioning</span><strong>${rupiah(s.biaya_instalasi)}</strong></div>
    </div>
    <div class="cost-total">
      <span>TOTAL INVESTASI AWAL</span>
      <strong>${rupiah(s.biaya_total)}</strong>
    </div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="cost-row"><span>Biaya Listrik / Bulan</span><strong>${rupiah(s.biaya_listrik_bln)}</strong></div>
      <div class="cost-row"><span>Konsumsi / Bulan</span><strong>${s.kwh_per_bulan.toLocaleString("id")} kWh</strong></div>
    </div>`;

  // Tech info
  const lamp = s.lamp, pole = s.pole;
  document.getElementById("tech_info").innerHTML = `
    <div class="tech-grid">
      <div class="tech-item"><label>Lampu</label><span>${lamp.label}</span></div>
      <div class="tech-item"><label>Tipe SNI</label><span>${lamp.sni_type || "—"}</span></div>
      <div class="tech-item"><label>Lumen Output</label><span>${lamp.lumen.toLocaleString("id")} lm</span></div>
      <div class="tech-item"><label>Efikasi</label><span>${lamp.efficacy} lm/W</span></div>
      <div class="tech-item"><label>MF (Faktor Pemeliharaan)</label><span>${lamp.mf}</span></div>
      <div class="tech-item"><label>CRI</label><span>${lamp.CRI}</span></div>
      <div class="tech-item"><label>Suhu Warna</label><span>${lamp.CCT}</span></div>
      <div class="tech-item"><label>Umur Rencana</label><span>${lamp.lifespan_hours.toLocaleString("id")} jam</span></div>
      <div class="tech-item"><label>Tinggi Tiang</label><span>${pole.label}</span></div>
      <div class="tech-item"><label>Kelas Jalan</label><span>${s.road_class.label}</span></div>
      <div class="tech-item"><label>E SNI Range</label><span>${s.road_class.E_min_range}–${s.road_class.E_max_range} lux</span></div>
      <div class="tech-item"><label>Standar Acuan</label><span>SNI 7391:2008</span></div>
    </div>
    <div class="tech-note">
      * LED tidak tercantum dalam SNI 7391:2008 (diterbitkan 2008). Nilai E kolektor yang benar 3–7 lux (bukan 11 lux).
      Jarak tikungan mengikuti Lampiran D SNI: radius≥305m=0.75e, sisi luar=0.70e, sisi dalam=0.55e.
      Dibuat: ${data.metadata.generated_at} · ${data.metadata.standard}
    </div>`;

  // Canvas — render berskala
  canvasState.data = data;
  zoomFit();
}

// ══════════════════════════════════════════════
//  VISUALISASI CANVAS — BERSKALA PENUH
//  Mendukung panjang hingga puluhan km
// ══════════════════════════════════════════════

function zoomFit() {
  if (!canvasState.data) return;
  const totalLen = canvasState.data.segments.reduce((a,s)=>a+(s.length||0),0) || 600;
  const vp       = document.getElementById("canvas_viewport");
  const vpW      = vp.clientWidth || 800;
  // Sesuaikan agar seluruh jalan muat di viewport dengan padding
  const pxPerM   = Math.min((vpW - 60) / totalLen, canvasState.maxPxPerMeter);
  canvasState.pxPerMeter = Math.max(pxPerM, canvasState.minPxPerMeter);
  drawRoadCanvas(canvasState.data);
}

function zoomCanvas(factor) {
  canvasState.pxPerMeter = Math.min(
    canvasState.maxPxPerMeter,
    Math.max(canvasState.minPxPerMeter, canvasState.pxPerMeter * factor)
  );
  if (canvasState.data) drawRoadCanvas(canvasState.data);
}

function drawRoadCanvas(data) {
  const canvas  = document.getElementById("road_canvas");
  const ctx     = canvas.getContext("2d");
  const dpr     = window.devicePixelRatio || 1;
  const H       = 240;
  const PAD     = 28;

  const segs     = data.segments;
  const totalLen = segs.reduce((a,s)=>a+(s.length||0),0) || 600;
  const PPM      = canvasState.pxPerMeter; // px per meter

  // Lebar canvas = skala total panjang + padding
  // Minimum 80px per persimpangan (tidak punya panjang)
  const intersectionW = segs.filter(s=>s.type==="Persimpangan").length * 80;
  const roadPxW       = totalLen * PPM;
  const W             = Math.max(roadPxW + PAD*2 + intersectionW, 400);

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#090c10";
  ctx.fillRect(0, 0, W, H);

  const roadH = 96;
  const roadY = H/2 - roadH/2;
  const arr   = data.summary.arrangement;
  let curX    = PAD;

  // ── Gambar tiap segmen ──
  segs.forEach((seg, si) => {
    // Lebar piksel segmen berdasarkan skala
    const segPxW = seg.length ? seg.length * PPM : 80;

    if (seg.type === "Persimpangan") {
      drawIntersection(ctx, curX, segPxW, roadY, roadH, seg, H);
    } else {
      drawRoadSegment(ctx, curX, roadY, segPxW, roadH, seg, arr, PPM, H);
    }

    // Garis pemisah segmen
    if (si < segs.length - 1) {
      ctx.save();
      ctx.setLineDash([3,4]);
      ctx.strokeStyle = "#2a3050";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(curX + segPxW, 0);
      ctx.lineTo(curX + segPxW, H);
      ctx.stroke();
      ctx.restore();
    }

    curX += segPxW;
  });

  // Label START/END + panah arah
  ctx.fillStyle  = "#4a5060";
  ctx.font       = "9px DM Mono, monospace";
  ctx.textAlign  = "left";
  ctx.fillText("START", PAD, H - 5);
  ctx.textAlign  = "right";
  ctx.fillText("END", W - PAD + 24, H - 5);

  ctx.strokeStyle = "#2a3050";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 11);
  ctx.lineTo(W - PAD, H - 11);
  ctx.stroke();
  // Ujung panah
  ctx.beginPath();
  ctx.moveTo(W - PAD - 7, H - 16);
  ctx.lineTo(W - PAD, H - 11);
  ctx.lineTo(W - PAD - 7, H - 6);
  ctx.stroke();

  // Update skala info dan ruler
  updateScaleInfo(PPM, totalLen);
  buildRuler(PPM, W - PAD*2, totalLen);
}

function drawRoadSegment(ctx, sx, roadY, segW, roadH, seg, arr, PPM, H) {
  const midY = roadY + roadH/2;

  // Trotoar atas
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(sx, 3, segW, roadY - 5);
  // Trotoar bawah
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(sx, roadY + roadH + 2, segW, H - roadY - roadH - 16);

  // Badan jalan
  ctx.fillStyle = "#111520";
  ctx.fillRect(sx, roadY, segW, roadH);

  // Taper — gambar trapesium
  if (seg.type === "Taper") {
    const ws = seg.width_start || 7, we = seg.width_end || 14;
    const scl = roadH / Math.max(ws, we, 1) * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle   = "#f0c040";
    const hs = ws * scl, he = we * scl;
    ctx.beginPath();
    ctx.moveTo(sx,      midY - hs/2);
    ctx.lineTo(sx+segW, midY - he/2);
    ctx.lineTo(sx+segW, midY + he/2);
    ctx.lineTo(sx,      midY + hs/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Garis tepi jalan (putih tipis)
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth   = 1.2;
  ctx.beginPath(); ctx.moveTo(sx, roadY+2);      ctx.lineTo(sx+segW, roadY+2);      ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, roadY+roadH-2); ctx.lineTo(sx+segW, roadY+roadH-2); ctx.stroke();
  ctx.restore();

  // Marka tengah
  ctx.save();
  ctx.setLineDash([Math.max(12, PPM*5), Math.max(8, PPM*3)]);
  ctx.strokeStyle = "#2a5a38";
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(sx, midY); ctx.lineTo(sx+segW, midY); ctx.stroke();
  ctx.restore();

  // ── Plot tiang lampu berskala ──
  // Jarak antar tiang dalam pixel
  const spacing  = seg.spacing || 30;
  const spacingPx = spacing * PPM;  // KUNCI: px = meter × skala

  if (spacingPx > 0) {
    let pc = 0;
    // Mulai dari tiang pertama (offset setengah spacing dari tepi)
    for (let x = sx + Math.min(spacingPx * 0.5, segW * 0.05);
             x < sx + segW - 2 && pc < seg.total_poles;
             x += spacingPx) {
      if (arr === "staggered") {
        const top = pc % 2 === 0;
        drawPole(ctx, x, top ? roadY - 14 : roadY + roadH + 14, top, roadY, roadH, spacingPx);
      } else if (arr === "opposite") {
        drawPole(ctx, x, roadY - 14,        true,  roadY, roadH, spacingPx);
        drawPole(ctx, x, roadY + roadH + 14, false, roadY, roadH, spacingPx);
      } else if (arr === "single_side") {
        drawPole(ctx, x, roadY - 14, true, roadY, roadH, spacingPx);
      } else { // median
        drawPole(ctx, x, midY, true, roadY, roadH, spacingPx);
      }
      pc++;
    }
  }

  // Label segmen
  ctx.fillStyle  = "#4a5060";
  ctx.font       = "9px DM Mono, monospace";
  ctx.textAlign  = "center";
  const cx = sx + segW/2;
  const lenLabel = seg.length >= 1000 ? (seg.length/1000).toFixed(1)+"km" : seg.length+"m";
  ctx.fillText(`${seg.type}  e=${spacing}m  ${lenLabel}`, cx, roadY - 9);
}

function drawIntersection(ctx, sx, segW, roadY, roadH, seg, H) {
  const cx  = sx + segW/2;
  const cy  = H/2;
  const rad = Math.min(segW * 0.38, roadH * 0.42);

  ctx.fillStyle = "#15172a";
  ctx.beginPath(); ctx.arc(cx, cy, rad*1.5, 0, Math.PI*2); ctx.fill();

  ctx.save();
  ctx.setLineDash([4,4]); ctx.strokeStyle = "#2a5a38"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx-rad*1.4, cy); ctx.lineTo(cx+rad*1.4, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy-rad*1.4); ctx.lineTo(cx, cy+rad*1.4); ctx.stroke();
  ctx.restore();

  // Halo cahaya
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad*1.3);
  g.addColorStop(0, "rgba(240,192,64,.1)"); g.addColorStop(1, "rgba(240,192,64,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad*1.3, 0, Math.PI*2); ctx.fill();

  const itype = seg.intersection_type || "4way";
  const corners = itype==="3way"
    ? [[-0.72,-0.72],[0.72,-0.72],[0,0.85]]
    : [[-0.72,-0.72],[0.72,-0.72],[0.72,0.72],[-0.72,0.72]];
  corners.forEach(([dx,dy]) => drawPole(ctx, cx+dx*rad*1.25, cy+dy*rad*1.25, cy+dy*rad*1.25 < H/2, roadY, roadH, 0));

  ctx.fillStyle  = "#4a5060";
  ctx.font       = "9px DM Mono, monospace";
  ctx.textAlign  = "center";
  ctx.fillText(seg.segment_name || "Persimpangan", cx, roadY - 9);
}

function drawPole(ctx, x, y, isTop, roadY, roadH, spacingPx) {
  // Cone cahaya ke badan jalan
  const lampY   = isTop ? y     : y;
  const coneBot = isTop ? roadY + roadH : roadY;
  const spread  = Math.abs(coneBot - lampY) * 0.5;

  ctx.save();
  ctx.globalAlpha = 0.065;
  ctx.fillStyle   = "#f0c040";
  ctx.beginPath();
  ctx.moveTo(x + 6, isTop ? lampY + 4 : lampY - 4);
  ctx.lineTo(x + 6 - spread, coneBot);
  ctx.lineTo(x + 6 + spread, coneBot);
  ctx.closePath();
  ctx.fill();

  // Radial glow — radius proporsional spacing tapi dibatasi
  const glowR = Math.min(Math.max(spacingPx * 0.35, 10), 60);
  const g     = ctx.createRadialGradient(x+6, lampY, 0, x+6, lampY, glowR);
  g.addColorStop(0, "rgba(240,192,64,.3)"); g.addColorStop(1, "rgba(240,192,64,0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle   = g;
  ctx.beginPath(); ctx.arc(x+6, lampY, glowR, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Stem tiang
  ctx.strokeStyle = "#8090a8"; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, isTop ? y+18 : y-18);
  ctx.lineTo(x, y);
  ctx.stroke();

  // Bracket
  ctx.strokeStyle = "#8090a8"; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, isTop ? y+2  : y-2);
  ctx.lineTo(x+6, isTop ? y-4 : y+4);
  ctx.stroke();

  // Housing lampu
  ctx.fillStyle   = "#c0c8d8";
  ctx.strokeStyle = "#8090a8"; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(x+6, isTop ? y-5 : y+5, 5, 2.5, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();

  // Titik cahaya
  ctx.save();
  ctx.shadowBlur  = 8;
  ctx.shadowColor = "#f0c040";
  ctx.fillStyle   = "#f0c040";
  ctx.beginPath();
  ctx.arc(x+6, isTop ? y-5 : y+5, 2.5, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

// ── Skala info & Ruler ──
function updateScaleInfo(PPM, totalLen) {
  const el = document.getElementById("scale_info");
  if (!el) return;
  const km = totalLen >= 1000;
  el.textContent = `Skala: 1m = ${PPM.toFixed(2)}px | Total: ${km ? (totalLen/1000).toFixed(2)+"km" : totalLen+"m"}`;
}

function buildRuler(PPM, totalPx, totalLen) {
  const ruler = document.getElementById("canvas_ruler");
  if (!ruler) return;
  ruler.innerHTML = "";
  ruler.style.width = (totalPx + 56) + "px";

  // Pilih interval skala yang wajar
  // Untuk jalan sangat panjang (>10km) pakai interval km
  // Untuk menengah pakai 100m, pendek pakai 10m
  let interval; // dalam meter
  if (totalLen > 50000)    interval = 5000;
  else if (totalLen > 10000) interval = 1000;
  else if (totalLen > 2000) interval = 500;
  else if (totalLen > 500)  interval = 100;
  else if (totalLen > 100)  interval = 50;
  else                      interval = 10;

  for (let m = 0; m <= totalLen; m += interval) {
    const px = m * PPM + 28; // offset PAD
    const mark = document.createElement("div");
    mark.className = "ruler-mark";
    mark.style.left = px + "px";
    const lbl = m >= 1000 ? (m/1000).toFixed(m%1000===0?0:1)+"km" : m+"m";
    mark.innerHTML = `<div class="tick"></div><div class="label">${lbl}</div>`;
    ruler.appendChild(mark);
  }
}

// ── Export ──
async function exportJSON() {
  if (!lastResult) return;
  const res  = await fetch("/api/export/json", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(lastResult.payload)
  });
  const blob = await res.blob();
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `PJU_Laporan_${dateStr()}.json`;
  a.click();
}

async function exportCSV() {
  if (!lastResult) return;
  const res  = await fetch("/api/export/csv", {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(lastResult.payload)
  });
  const blob = await res.blob();
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `PJU_Laporan_${dateStr()}.csv`;
  a.click();
}

function doPrint() {
  if (!lastResult) return;
  const data = lastResult.result, s = data.summary;
  document.getElementById("print_meta").innerHTML =
    `Tanggal: ${data.metadata.generated_at} · Standar: ${data.metadata.standard}<br>
     Lampu: ${s.lamp.label} · Tiang: ${s.pole.label} · Kelas: ${s.road_class.label}`;

  let rows = "";
  data.segments.forEach(seg => {
    rows += `<tr><td>${seg.segment_name}</td><td>${seg.type}</td>
      <td>${seg.length||"—"}</td><td>${seg.spacing||"Var"}</td>
      <td>${seg.total_poles}</td><td>${seg.E_actual||"—"}</td>
      <td>${seg.E_required||"—"}</td><td>${seg.method||"—"}</td>
      <td>${seg.compliant?"✓":"⚠"}</td></tr>`;
  });

  document.getElementById("print_content").innerHTML = `
    <div class="print-section"><h2>1. Ringkasan</h2>
      <table class="print-table">
        <tr><th>Parameter</th><th>Nilai</th></tr>
        <tr><td>Total Tiang</td><td>${s.total_poles.toLocaleString("id")} unit</td></tr>
        <tr><td>Total Panjang</td><td>${s.total_length >= 1000 ? (s.total_length/1000).toFixed(2)+"km" : s.total_length+"m"}</td></tr>
        <tr><td>Daya Total</td><td>${s.daya_total_kw} kW</td></tr>
        <tr><td>Konsumsi/Bulan</td><td>${s.kwh_per_bulan.toLocaleString("id")} kWh</td></tr>
        <tr><td>Listrik/Bulan</td><td>${rupiah(s.biaya_listrik_bln)}</td></tr>
        <tr><td>Total Investasi</td><td>${rupiah(s.biaya_total)}</td></tr>
      </table>
    </div>
    <div class="print-section"><h2>2. Detail Segmen</h2>
      <table class="print-table">
        <thead><tr><th>Segmen</th><th>Tipe</th><th>Panjang</th><th>Jarak(m)</th>
          <th>Tiang</th><th>E Aktual</th><th>E SNI</th><th>Metode</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="print-section"><h2>3. Biaya</h2>
      <table class="print-table">
        <tr><th>Komponen</th><th>Biaya (Rp)</th></tr>
        <tr><td>Lampu (${s.total_poles} × ${rupiah(s.lamp.harga_unit)})</td><td>${rupiah(s.biaya_lampu)}</td></tr>
        <tr><td>Tiang & Pondasi</td><td>${rupiah(s.biaya_tiang)}</td></tr>
        <tr><td>Kabel & Jaringan</td><td>${rupiah(s.biaya_kabel)}</td></tr>
        <tr><td>Instalasi</td><td>${rupiah(s.biaya_instalasi)}</td></tr>
        <tr><td><strong>TOTAL</strong></td><td><strong>${rupiah(s.biaya_total)}</strong></td></tr>
      </table>
    </div>
    <p style="margin-top:16px;font-size:8pt;color:#666">
      Perhitungan bersifat estimasi. E kolektor SNI: 3–7 lux. Faktor tikungan sesuai Lampiran D SNI 7391:2008.
    </p>`;
  window.print();
}

// ── Helpers ──
function rupiah(n)      { return "Rp " + Math.round(n).toLocaleString("id"); }
function shortRupiah(n) {
  if (n >= 1e12) return "Rp " + (n/1e12).toFixed(2)+" T";
  if (n >= 1e9)  return "Rp " + (n/1e9).toFixed(1)+" M";
  if (n >= 1e6)  return "Rp " + (n/1e6).toFixed(0)+" Jt";
  return rupiah(n);
}
function dateStr() { return new Date().toISOString().slice(0,10).replace(/-/g,""); }
function avg(arr)  { return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : 0; }
