"""
PJUCalc — Kalkulator Penerangan Jalan Umum
Standar: SNI 7391:2008 (KOREKSI PENUH)

KOREKSI vs versi sebelumnya:
- Nilai E kolektor: 3-7 lux (bukan 11 lux)
- Nilai E arteri: 11-20 lux
- Nilai E lokal: 2-5 lux
- Nilai E bebas hambatan: 15-20 lux
- Faktor tikungan: 0.75e / 0.70e / 0.55e (Lampiran D SNI)
- Jenis lampu: SON/SOX sesuai Tabel 1 SNI + LED modern
- Auto-rekomendasi berbasis Tabel 9 SNI sebagai acuan utama
"""

from flask import Flask, render_template, request, jsonify, send_file
import math, json, io, csv
from datetime import datetime

app = Flask(__name__)

# ══════════════════════════════════════════════════════════════
#  TABEL 3 SNI 7391:2008 — Kualitas Pencahayaan Normal
#  KOREKSI: nilai E sesuai dokumen asli SNI hal. 8
# ══════════════════════════════════════════════════════════════
SNI_ROAD_CLASSES = {
    "arteri_primer": {
        "label": "Arteri Primer",
        "E_avg": 15,      # tengah range 11-20 lux (Tabel 3 SNI)
        "E_min_range": 11,
        "E_max_range": 20,
        "E_min": 4,       # E minimum lux
        "g1": "0.14-0.20",
        "uniformity": 0.14,
        "VI": "0.50-0.70",
        "glare_class": "G5-G6",
        "note": "Sistem menerus dan parsial. SON/LED sangat dianjurkan.",
    },
    "arteri_sekunder": {
        "label": "Arteri Sekunder",
        "E_avg": 15,
        "E_min_range": 11,
        "E_max_range": 20,
        "E_min": 4,
        "g1": "0.14-0.20",
        "uniformity": 0.14,
        "VI": "0.50-0.70",
        "glare_class": "G5-G6",
        "note": "Sistem menerus dan parsial. SON/LED sangat dianjurkan.",
    },
    "kolektor_primer": {
        "label": "Kolektor Primer",
        "E_avg": 5,       # KOREKSI: tengah range 3-7 lux (bukan 11)
        "E_min_range": 3,
        "E_max_range": 7,
        "E_min": 2,
        "g1": "0.14",
        "uniformity": 0.14,
        "VI": "0.50",
        "glare_class": "G4-G5",
        "note": "Sistem menerus dan parsial. SON/MBF/LED diizinkan.",
    },
    "kolektor_sekunder": {
        "label": "Kolektor Sekunder",
        "E_avg": 5,       # KOREKSI: 3-7 lux
        "E_min_range": 3,
        "E_max_range": 7,
        "E_min": 2,
        "g1": "0.14",
        "uniformity": 0.14,
        "VI": "0.50",
        "glare_class": "G4-G5",
        "note": "Sistem menerus dan parsial. SON/MBF/LED diizinkan.",
    },
    "lokal_primer": {
        "label": "Lokal Primer",
        "E_avg": 3,       # KOREKSI: tengah range 2-5 lux
        "E_min_range": 2,
        "E_max_range": 5,
        "E_min": 1,
        "g1": "0.10",
        "uniformity": 0.10,
        "VI": "0.50",
        "glare_class": "G4",
        "note": "Sistem menerus dan parsial. TL/MBF/LED diizinkan.",
    },
    "lokal_sekunder": {
        "label": "Lokal Sekunder",
        "E_avg": 3,
        "E_min_range": 2,
        "E_max_range": 5,
        "E_min": 1,
        "g1": "0.10",
        "uniformity": 0.10,
        "VI": "0.50",
        "glare_class": "G4",
        "note": "Sistem menerus dan parsial. TL/MBF/LED diizinkan.",
    },
    "bebas_hambatan": {
        "label": "Bebas Hambatan / Tol",
        "E_avg": 17,      # tengah range 15-20 lux
        "E_min_range": 15,
        "E_max_range": 20,
        "E_min": 5,
        "g1": "0.14-0.20",
        "uniformity": 0.14,
        "VI": "0.50-0.70",
        "glare_class": "G5-G6",
        "note": "Sistem menerus WAJIB. SON/LED sangat dianjurkan.",
    },
    "layang_terowongan": {
        "label": "Layang / Simpang Susun / Terowongan",
        "E_avg": 22,      # tengah range 20-25 lux
        "E_min_range": 20,
        "E_max_range": 25,
        "E_min": 8,
        "g1": "0.20",
        "uniformity": 0.20,
        "VI": "0.70",
        "glare_class": "G6",
        "note": "Sistem menerus WAJIB. Bergradasi di ujung terowongan.",
    },
    "trotoar": {
        "label": "Trotoar",
        "E_avg": 2,       # tengah range 1-4 lux
        "E_min_range": 1,
        "E_max_range": 4,
        "E_min": 0.5,
        "g1": "0.10",
        "uniformity": 0.10,
        "VI": "0.50",
        "glare_class": "G4",
        "note": "Mengacu SNI 03-2447-1991 Spesifikasi Trotoar.",
    },
}

# ══════════════════════════════════════════════════════════════
#  TABEL 1 SNI 7391:2008 — Jenis Lampu PJU
#  + LED modern sebagai tambahan (tidak ada di SNI 2008)
# ══════════════════════════════════════════════════════════════
LAMP_TYPES = {
    # LED (tidak tercantum SNI 2008, ditambahkan karena efisiensi terbaik saat ini)
    "led_40w":  {"label":"LED 40W","watt":40,"lumen":4800,"efficacy":120,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":850000,"sni_type":"LED*"},
    "led_60w":  {"label":"LED 60W","watt":60,"lumen":7800,"efficacy":130,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":1200000,"sni_type":"LED*"},
    "led_80w":  {"label":"LED 80W","watt":80,"lumen":10400,"efficacy":130,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":1550000,"sni_type":"LED*"},
    "led_100w": {"label":"LED 100W","watt":100,"lumen":13500,"efficacy":135,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":1900000,"sni_type":"LED*"},
    "led_150w": {"label":"LED 150W","watt":150,"lumen":20000,"efficacy":133,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":2800000,"sni_type":"LED*"},
    "led_200w": {"label":"LED 200W","watt":200,"lumen":27000,"efficacy":135,"CRI":70,"CCT":"5700K","lifespan_hours":50000,"mf":0.80,"harga_unit":3500000,"sni_type":"LED*"},
    # SON — Sodium Tekanan Tinggi (SANGAT DIANJURKAN Tabel 1 SNI)
    "son_70w":  {"label":"SON 70W","watt":70,"lumen":6500,"efficacy":110,"CRI":25,"CCT":"2100K","lifespan_hours":20000,"mf":0.70,"harga_unit":480000,"sni_type":"SON"},
    "son_150w": {"label":"SON 150W","watt":150,"lumen":16500,"efficacy":110,"CRI":25,"CCT":"2100K","lifespan_hours":20000,"mf":0.70,"harga_unit":750000,"sni_type":"SON"},
    "son_250w": {"label":"SON 250W","watt":250,"lumen":27500,"efficacy":110,"CRI":25,"CCT":"2100K","lifespan_hours":20000,"mf":0.70,"harga_unit":1050000,"sni_type":"SON"},
    "son_400w": {"label":"SON 400W","watt":400,"lumen":44000,"efficacy":110,"CRI":25,"CCT":"2100K","lifespan_hours":20000,"mf":0.70,"harga_unit":1400000,"sni_type":"SON"},
    # SOX — Sodium Tekanan Rendah (DIANJURKAN Tabel 1 SNI)
    "sox_35w":  {"label":"SOX 35W","watt":35,"lumen":4550,"efficacy":130,"CRI":0,"CCT":"1800K","lifespan_hours":10000,"mf":0.75,"harga_unit":380000,"sni_type":"SOX"},
    "sox_55w":  {"label":"SOX 55W","watt":55,"lumen":7700,"efficacy":140,"CRI":0,"CCT":"1800K","lifespan_hours":10000,"mf":0.75,"harga_unit":450000,"sni_type":"SOX"},
    "sox_90w":  {"label":"SOX 90W","watt":90,"lumen":13500,"efficacy":150,"CRI":0,"CCT":"1800K","lifespan_hours":10000,"mf":0.75,"harga_unit":580000,"sni_type":"SOX"},
    "sox_135w": {"label":"SOX 135W","watt":135,"lumen":22500,"efficacy":167,"CRI":0,"CCT":"1800K","lifespan_hours":10000,"mf":0.75,"harga_unit":720000,"sni_type":"SOX"},
    "sox_180w": {"label":"SOX 180W","watt":180,"lumen":31500,"efficacy":175,"CRI":0,"CCT":"1800K","lifespan_hours":10000,"mf":0.75,"harga_unit":850000,"sni_type":"SOX"},
    # MBF/U — Merkuri Tekanan Tinggi (masih dapat digunakan)
    "mbf_125w": {"label":"MBF/U 125W","watt":125,"lumen":6000,"efficacy":50,"CRI":45,"CCT":"4000K","lifespan_hours":24000,"mf":0.65,"harga_unit":320000,"sni_type":"MBF/U"},
    "mbf_250w": {"label":"MBF/U 250W","watt":250,"lumen":13000,"efficacy":52,"CRI":45,"CCT":"4000K","lifespan_hours":24000,"mf":0.65,"harga_unit":520000,"sni_type":"MBF/U"},
    "mbf_400w": {"label":"MBF/U 400W","watt":400,"lumen":22000,"efficacy":55,"CRI":45,"CCT":"4000K","lifespan_hours":24000,"mf":0.65,"harga_unit":720000,"sni_type":"MBF/U"},
}

# ══════════════════════════════════════════════════════════════
#  TABEL 9 SNI 7391:2008 — Jarak antar tiang (e) meter
#  Indeks lebar: [4m, 5m, 6m, 7m, 8m, 9m, 10m, 11m]
# ══════════════════════════════════════════════════════════════
TABEL9_SNI = {
    # TIPE A — SOX (distribusi luas)
    "sox_35w": {4:[32,32,32,None,None,None,None,None], 5:[35,35,35,35,35,34,32,None], 6:[42,40,38,36,33,31,30,29]},
    "sox_55w": {6:[42,40,38,36,33,32,30,28]},
    "sox_90w": {8:{"6lux":[60,60,58,55,52,50,48,46],"10lux":[36,35,35,33,31,30,29,28]}},
    "sox_135w":{10:{"20lux":[46,45,45,44,43,41,40,39],"20lux_b":[None,None,25,24,23,22,21,20]}},
    "sox_180w":{10:{"30lux":[None,None,37,36,35,33,32,31],"30lux_b":[None,None,None,None,22,21,20,20]}},
    # TIPE B — SON/MBF (distribusi terarah)
    "son_70w":  {6:{"6lux":[48,47,46,44,43,41,39,37],"6lux_b":[34,33,32,31,30,28,26,24]}},
    "son_150w": {8:[None,None,48,47,45,43,41,39]},
    "son_250w": {10:{"20lux":[None,None,None,None,55,53,50,47],"20lux_b":[None,None,36,35,33,32,30,28]}},
    "son_400w": {12:[None,None,None,None,39,38,37,36]},
    "mbf_125w": {5:[33,32,32,31,30,29,28,27], 6:[34,33,32,31,30,28,26,24]},
    "mbf_250w": {8:[None,None,48,47,45,43,41,39]},
    "mbf_400w": {10:[None,None,36,35,33,32,30,28]},
}

POLE_HEIGHTS = {
    "4m":  {"label":"4 m","height":4,"arm_length":1.0,"harga_unit":1200000},
    "5m":  {"label":"5 m","height":5,"arm_length":1.0,"harga_unit":1600000},
    "6m":  {"label":"6 m","height":6,"arm_length":1.5,"harga_unit":1800000},
    "7m":  {"label":"7 m","height":7,"arm_length":1.5,"harga_unit":2200000},
    "8m":  {"label":"8 m","height":8,"arm_length":1.5,"harga_unit":2500000},
    "9m":  {"label":"9 m","height":9,"arm_length":2.0,"harga_unit":2800000},
    "10m": {"label":"10 m","height":10,"arm_length":2.0,"harga_unit":3200000},
    "12m": {"label":"12 m","height":12,"arm_length":2.5,"harga_unit":4000000},
    "14m": {"label":"14 m","height":14,"arm_length":3.0,"harga_unit":5000000},
}

# Faktor tikungan sesuai Lampiran D SNI 7391:2008
# (bukan -20% flat seperti versi lama)
CURVE_FACTORS = {
    "lurus":   1.00,
    "r305":    0.75,  # radius >= 305m: Gambar D.2
    "outer":   0.70,  # radius < 305m sisi luar: Gambar D.3
    "inner":   0.55,  # radius < 305m sisi dalam: Gambar D.4
}

# ══════════════════════════════════════════════════════════════
#  ENGINE PERHITUNGAN
# ══════════════════════════════════════════════════════════════

def calc_uf(pole_height, road_width, arrangement):
    """
    Faktor utilisasi (UF) — pendekatan empiris CIE/SNI
    Digunakan untuk LED yang tidak ada di Tabel 9 SNI
    """
    r = road_width / pole_height
    if   r <= 0.5: uf = 0.55
    elif r <= 0.8: uf = 0.52
    elif r <= 1.0: uf = 0.48
    elif r <= 1.3: uf = 0.44
    elif r <= 1.6: uf = 0.40
    elif r <= 2.0: uf = 0.35
    else:          uf = 0.30
    if   arrangement == "opposite":    uf *= 1.05
    elif arrangement == "single_side": uf *= 0.85
    elif arrangement == "median":      uf *= 1.10
    return min(uf, 0.60)


def lookup_tabel9(lamp_key, pole_height, road_width):
    """
    Lookup jarak dari Tabel 9 SNI 7391:2008.
    Returns spacing (m) atau None jika tidak ditemukan.
    """
    tbl = TABEL9_SNI.get(lamp_key)
    if not tbl: return None
    rows = tbl.get(pole_height)
    if rows is None: return None
    # Index lebar: 4m=0, 5m=1, ... 11m=7
    w_idx = min(max(round(road_width) - 4, 0), 7)
    if isinstance(rows, dict):
        # Ambil baris pertama yang ada nilai
        for row in rows.values():
            if isinstance(row, list) and w_idx < len(row) and row[w_idx] is not None:
                return float(row[w_idx])
        return None
    elif isinstance(rows, list):
        if w_idx < len(rows) and rows[w_idx] is not None:
            return float(rows[w_idx])
    return None


def calc_spacing(lamp_key, lamp, pole_height, road_width, arrangement, E_target):
    """
    Hitung jarak tiang:
    1. Coba lookup Tabel 9 SNI (untuk SON/SOX/MBF)
    2. Fallback formula S=(Φ×UF×MF)/(E×W) untuk LED
    """
    sp = lookup_tabel9(lamp_key, pole_height, road_width)
    if sp is not None:
        return round(sp, 1), "Tabel 9 SNI"
    # Formula fallback
    uf  = calc_uf(pole_height, road_width, arrangement)
    mf  = lamp["mf"]
    sp  = (lamp["lumen"] * uf * mf) / (E_target * road_width)
    sp  = min(sp, pole_height * 4)
    sp  = max(sp, 10)
    return round(sp, 1), "Formula UF/MF"


def calc_segment(seg, sni, lamp, lamp_key, pole, arrangement, curve_factor):
    ph   = pole["height"]
    E    = sni["E_avg"]
    mf   = lamp["mf"]

    # ── Persimpangan ──
    if seg.get("type") == "intersection":
        w     = float(seg.get("width_start", 7))
        itype = seg.get("intersection_type", "4way")
        area  = w*w if itype=="4way" else (w*w*0.75 if itype=="3way" else math.pi*(w*1.5)**2)
        Ei    = E * 1.5   # SNI 4.4.4: persimpangan lebih tinggi
        uf_v  = 0.45
        np    = max(math.ceil((Ei*area)/(lamp["lumen"]*uf_v*mf)), 3 if itype=="3way" else 4)
        Ea    = (np*lamp["lumen"]*uf_v*mf)/area
        return {
            "type":"Persimpangan","length":0,"width_start":w,"width_end":w,
            "spacing":0,"total_poles":int(np),"E_actual":round(Ea,2),
            "E_required":round(Ei,1),"compliant":Ea>=Ei*0.95,
            "zones":None,"method":"E×1.5 (SNI 4.4.4)","curve_factor":1.0,
        }

    length      = float(seg.get("length",200))
    width_start = float(seg.get("width_start",7))
    width_end   = float(seg.get("width_end",width_start))

    # ── Taper — zona per 50m ──
    if seg.get("type") == "taper":
        n_zones = max(1, math.ceil(length / 50))
        zones, total = [], 0
        for i in range(n_zones):
            w   = width_start + (width_end - width_start)*(i+0.5)/n_zones
            zl  = length / n_zones
            sp, method = calc_spacing(lamp_key, lamp, ph, w, arrangement, E)
            sp  = max(round(sp * curve_factor, 1), 10)
            np  = math.ceil(zl/sp)+1
            if arrangement != "single_side": np *= 2
            Ea  = (lamp["lumen"] * calc_uf(ph,w,arrangement) * mf) / (sp * w)
            zones.append({"zone":i+1,"length":round(zl,1),"width_start":round(width_start+(width_end-width_start)*i/n_zones,1),
                          "width_end":round(width_start+(width_end-width_start)*(i+1)/n_zones,1),
                          "spacing":sp,"poles":int(np),"E_actual":round(Ea,2)})
            total += np
        return {
            "type":"Taper","length":length,"width_start":width_start,"width_end":width_end,
            "spacing":zones[0]["spacing"],"total_poles":int(total),
            "E_actual":zones[len(zones)//2]["E_actual"],"E_required":E,
            "compliant":True,"zones":zones,"method":method,"curve_factor":curve_factor,
        }

    # ── Lurus / Tikungan ──
    w       = width_start
    sp, method = calc_spacing(lamp_key, lamp, ph, w, arrangement, E)
    sp      = max(round(sp * curve_factor, 1), 10)
    np      = math.ceil(length / sp) + 1
    if arrangement != "single_side": np *= 2
    Ea      = (lamp["lumen"] * calc_uf(ph,w,arrangement) * mf) / (sp * w)
    type_label = {"straight":"Lurus","curve":"Tikungan"}.get(seg.get("type","straight"),"Lurus")

    return {
        "type":type_label,"length":length,"width_start":w,"width_end":w,
        "spacing":sp,"total_poles":int(np),"E_actual":round(Ea,2),
        "E_required":E,"compliant":Ea>=E*0.95,"zones":None,
        "method":method,"curve_factor":curve_factor,
    }


def run_calculation(payload):
    rc          = payload["road_class"]
    lamp_key    = payload["lamp_key"]
    pole_key    = payload["pole_key"]
    arrangement = payload["arrangement"]
    curve_type  = payload.get("curve_type","lurus")
    segments    = payload.get("segments",[])

    sni         = SNI_ROAD_CLASSES[rc]
    lamp        = LAMP_TYPES[lamp_key]
    pole        = POLE_HEIGHTS[pole_key]
    curve_factor= CURVE_FACTORS.get(curve_type, 1.0)

    results = []
    for i, seg in enumerate(segments):
        r = calc_segment(seg, sni, lamp, lamp_key, pole, arrangement, curve_factor)
        r["segment_id"]   = seg.get("id", i+1)
        r["segment_name"] = seg.get("name", f"Segmen {i+1}")
        results.append(r)

    total_poles  = sum(r["total_poles"] for r in results)
    total_length = sum(r["length"] for r in results)

    b_lampu  = total_poles * lamp["harga_unit"]
    b_tiang  = total_poles * pole["harga_unit"]
    b_kabel  = total_length * 35000 * 1.1
    b_ins    = total_poles * 500000
    b_total  = b_lampu + b_tiang + b_kabel + b_ins

    daya_kw     = total_poles * lamp["watt"] / 1000
    kwh_bln     = daya_kw * 12 * 30
    b_listrik   = kwh_bln * 1699

    return {
        "segments": results,
        "summary": {
            "total_poles":       total_poles,
            "total_length":      total_length,
            "lamp":              {**lamp, "key": lamp_key},
            "lamp_key":          lamp_key,
            "pole":              {**pole, "key": pole_key},
            "pole_key":          pole_key,
            "road_class":        sni,
            "road_class_key":    rc,
            "arrangement":       arrangement,
            "curve_type":        curve_type,
            "curve_factor":      curve_factor,
            "biaya_lampu":       round(b_lampu),
            "biaya_tiang":       round(b_tiang),
            "biaya_kabel":       round(b_kabel),
            "biaya_instalasi":   round(b_ins),
            "biaya_total":       round(b_total),
            "daya_total_kw":     round(daya_kw, 2),
            "kwh_per_bulan":     round(kwh_bln, 1),
            "biaya_listrik_bln": round(b_listrik),
        },
        "metadata": {
            "generated_at": datetime.now().strftime("%d %B %Y, %H:%M WIB"),
            "standard":     "SNI 7391:2008",
        }
    }


# ══════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/options")
def api_options():
    return jsonify({
        "road_classes": SNI_ROAD_CLASSES,
        "lamp_types":   LAMP_TYPES,
        "pole_heights": POLE_HEIGHTS,
        "curve_types": {
            "lurus": "Jalan Lurus (faktor 1.00×e)",
            "r305":  "Tikungan radius ≥305m (faktor 0.75×e)",
            "outer": "Tikungan <305m, sisi luar (faktor 0.70×e)",
            "inner": "Tikungan <305m, sisi dalam (faktor 0.55×e)",
        },
        "arrangements": {
            "single_side": "Satu Sisi / Kiri-Kanan",
            "staggered":   "Selang-Seling (Zigzag)",
            "opposite":    "Berhadapan",
            "median":      "Median (Tengah Jalan)",
        }
    })


@app.route("/api/recommend", methods=["POST"])
def api_recommend():
    data        = request.json
    rc          = data.get("road_class","kolektor_primer")
    road_width  = float(data.get("road_width", 7))
    arrangement = data.get("arrangement","staggered")

    sni = SNI_ROAD_CLASSES[rc]
    E   = sni["E_avg"]

    # Pilih tinggi tiang berdasarkan lebar jalan (panduan umum SNI)
    if road_width <= 5:   rec_pole = "5m"
    elif road_width <= 7: rec_pole = "6m"
    elif road_width <= 9: rec_pole = "8m"
    elif road_width <= 12:rec_pole = "10m"
    else:                 rec_pole = "12m"

    ph = POLE_HEIGHTS[rec_pole]["height"]

    # Coba Tabel 9 SNI dulu (SON/SOX), lalu LED
    best_lamp, best_sp, best_source = None, 0, ""
    for lk in ["son_150w","son_70w","son_250w","sox_90w","sox_55w","led_80w","led_100w","led_60w"]:
        sp = lookup_tabel9(lk, ph, road_width)
        if sp and sp >= 15:
            best_lamp, best_sp, best_source = lk, sp, "Tabel 9 SNI"
            break
    if not best_lamp:
        for lk in ["led_80w","led_100w","led_60w","led_150w"]:
            uf  = calc_uf(ph, road_width, arrangement)
            lmp = LAMP_TYPES[lk]
            sp  = min((lmp["lumen"]*uf*lmp["mf"])/(E*road_width), ph*4)
            if sp >= 15:
                best_lamp, best_sp, best_source = lk, round(sp,1), "Formula UF/MF"
                break
    if not best_lamp:
        best_lamp, best_sp, best_source = "led_80w", ph*2.5, "Default"

    lbl = LAMP_TYPES[best_lamp]["label"]
    return jsonify({
        "lamp_key":  best_lamp,
        "pole_key":  rec_pole,
        "spacing":   round(best_sp,1),
        "source":    best_source,
        "reason": (f"Untuk jalan {sni['label']} lebar {road_width}m: "
                   f"{lbl} · Tiang {POLE_HEIGHTS[rec_pole]['label']} · "
                   f"e≈{round(best_sp,1)}m ({best_source})")
    })


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    try:
        result = run_calculation(request.json)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/export/json", methods=["POST"])
def api_export_json():
    result   = run_calculation(request.json)
    buf      = io.BytesIO(json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"))
    buf.seek(0)
    fname    = f"PJU_Laporan_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    return send_file(buf, mimetype="application/json", as_attachment=True, download_name=fname)


@app.route("/api/export/csv", methods=["POST"])
def api_export_csv():
    result = run_calculation(request.json)
    s      = result["summary"]
    buf    = io.StringIO()
    w      = csv.writer(buf)
    w.writerow(["LAPORAN PJU","SNI 7391:2008"])
    w.writerow(["Tanggal", result["metadata"]["generated_at"]])
    w.writerow(["Kelas Jalan", s["road_class"]["label"]])
    w.writerow(["Lampu", s["lamp"]["label"]]);w.writerow(["Tiang", s["pole"]["label"]])
    w.writerow([])
    w.writerow(["Segmen","Tipe","Panjang(m)","Lebar(m)","Jarak(m)","Faktor","Jml Tiang","E Aktual","E SNI","Status","Metode"])
    for seg in result["segments"]:
        w.writerow([seg["segment_name"],seg["type"],seg["length"] or "-",
                    seg["width_start"],seg["spacing"] or "Var",seg.get("curve_factor",1),
                    seg["total_poles"],f"{seg['E_actual']} lux" if seg["E_actual"] else "-",
                    f"{seg['E_required']} lux","OK" if seg["compliant"] else "Cek",
                    seg.get("method","-")])
        if seg.get("zones"):
            for z in seg["zones"]:
                w.writerow(["  Zona "+str(z["zone"]),"",z["length"],f"{z['width_start']}-{z['width_end']}",
                            z["spacing"],"",z["poles"],f"{z['E_actual']} lux","","",""])
    w.writerow([]);w.writerow(["RINGKASAN"])
    w.writerow(["Total Tiang",s["total_poles"]]);w.writerow(["Total Panjang(m)",s["total_length"]])
    w.writerow(["Daya(kW)",s["daya_total_kw"]]);w.writerow(["Biaya Total(Rp)",s["biaya_total"]])
    w.writerow(["Listrik/Bulan(Rp)",s["biaya_listrik_bln"]])
    out  = io.BytesIO(("\ufeff"+buf.getvalue()).encode("utf-8"))
    out.seek(0)
    return send_file(out, mimetype="text/csv", as_attachment=True,
                     download_name=f"PJU_{datetime.now().strftime('%Y%m%d')}.csv")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
