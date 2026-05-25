# PJUCalc — Kalkulator Penerangan Jalan Umum
## Standar: SNI 7391:2008 (Koreksi Penuh)

### Struktur Proyek
```
pjucalc/
├── app.py                    ← Backend Flask + Engine SNI
├── requirements.txt
├── templates/
│   └── index.html            ← Halaman utama
└── static/
    ├── css/style.css
    └── js/main.js
```

### Cara Menjalankan di VS Code

```bash
# 1. Buka folder pjucalc di VS Code
# 2. Buka Terminal (Ctrl + `)
pip install -r requirements.txt

# 3. Jalankan server
python app.py

# 4. Buka browser
# http://localhost:5000
```

---

### Koreksi SNI 7391:2008 vs Versi Sebelumnya

| Parameter | Versi Lama (SALAH) | Versi Baru (BENAR) |
|-----------|-------------------|-------------------|
| E Kolektor Primer | 11 lux | **3–7 lux** (Tabel 3 SNI) |
| E Kolektor Sekunder | 7 lux | **3–7 lux** |
| E Arteri | 20 / 15 lux | **11–20 lux** |
| E Lokal | 5 lux | **2–5 lux** |
| E Bebas Hambatan | — | **15–20 lux** |
| E Terowongan | — | **20–25 lux** |
| Faktor Tikungan | −20% flat | **0.75e / 0.70e / 0.55e** (Lampiran D) |
| Auto-Rekomendasi | Formula UF saja | **Tabel 9 SNI** + fallback formula |
| Jenis Lampu | LED/HPS/MH | **SON/SOX/MBF** (Tabel 1) + LED modern |

---

### Tabel 3 SNI 7391:2008 — Kualitas Pencahayaan Normal

| Kelas Jalan | E rata-rata | g1 (Emin/Emaks) |
|------------|-------------|-----------------|
| Trotoar | 1–4 lux | 0.10 |
| Lokal Primer/Sekunder | 2–5 lux | 0.10 |
| **Kolektor Primer/Sekunder** | **3–7 lux** | **0.14** |
| Arteri Primer/Sekunder | 11–20 lux | 0.14–0.20 |
| Bebas Hambatan / Tol | 15–20 lux | 0.14–0.20 |
| Layang / Terowongan | 20–25 lux | 0.20 |

### Faktor Tikungan — Lampiran D SNI 7391:2008

| Kondisi | Faktor | Gambar SNI |
|---------|--------|-----------|
| Jalan Lurus | 1.00 × e | — |
| Radius ≥ 305m | 0.75 × e | Gambar D.2 |
| Radius < 305m, sisi luar | 0.70 × e | Gambar D.3 |
| Radius < 305m, sisi dalam | 0.55 × e | Gambar D.4 |

### Formula Utama

```
S = (Φ × UF × MF) / (E_avg × W)   ← untuk LED (tidak ada di Tabel 9 SNI)
Tabel 9 SNI                         ← acuan utama untuk SON/SOX/MBF
```

### Fitur Visualisasi Berskala

- Canvas otomatis menyesuaikan skala berdasarkan panjang total jalan
- Mendukung panjang hingga **puluhan km** tanpa distorsi
- Tiang lampu diplot menggunakan **skala meter → piksel** yang konsisten
- Tombol Zoom In / Zoom Out / Fit untuk mengatur tampilan
- Scroll horizontal untuk melihat jalan panjang
- Ruler/penggaris dengan interval otomatis (10m / 50m / 100m / 500m / 1km / 5km)

### API Endpoints

| Method | URL | Fungsi |
|--------|-----|--------|
| GET | `/api/options` | Data referensi SNI |
| POST | `/api/recommend` | Auto-rekomendasi (Tabel 9 SNI) |
| POST | `/api/calculate` | Kalkulasi kebutuhan PJU |
| POST | `/api/export/json` | Download laporan JSON |
| POST | `/api/export/csv` | Download laporan CSV |
