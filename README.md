<div align="center">
  <h1>MENTARI MOD</h1>
  <p><em>Manajemen Terpadu Pembelajaran Daring — v3.0 Revised • Tuning by Rixz</em></p>
</div>

## Tentang MENTARI MOD

**MENTARI MOD** (**Tuning by Rixz**) adalah ekstensi browser untuk platform **MENTARI** (*Manajemen Terpadu Pembelajaran Daring*) Universitas Pamulang dengan tema **Deep Space Purple**. Ekstensi ini membantu mahasiswa melihat forum diskusi, quiz, dan kuesioner yang belum dikerjakan dari satu popup, serta mempermudah penggunaan MENTARI dengan berbagai shortcut.

Proyek ini berakar dari proyek [MENTARI MOD](https://github.com/lukman754/Mentari-Unpam) di bawah lisensi MIT (`LICENSE`), lalu dioptimasi ulang dan di-tuning oleh **Rixz**.

## ✨ Fitur Utama

### 🧭 Popup Mentari Mod

Tombol **Mentari Mod** muncul di header MENTARI. Klik untuk membuka popup yang berisi beberapa tab:

| Tab | Fungsi |
| --- | --- |
| **Forum** | Daftar quiz, forum diskusi, dan kuesioner yang belum selesai di **semua pertemuan** dari semua mata kuliah. Ada juga link cepat ke halaman presensi. |
| **Riwayat** | Riwayat topik dan balasan forum yang sudah kamu kirim, dikelompokkan per mata kuliah. Setiap topik punya link langsung ke halaman forumnya. |
| **Mahasiswa** | Daftar mahasiswa per kelas, lengkap dengan NIM dan peringkat jumlah peserta. |
| **Pengaturan** | Pengaturan tampilan dan konfigurasi popup. |

### 📚 Pelacakan Forum Diskusi

- Forum yang belum dibalas ditandai di tab **Forum**, dari semua pertemuan sekaligus, tanpa perlu membuka pertemuan satu per satu.
- Isi topik bisa dibaca langsung di popup.
- Balasan bisa dikirim langsung dari popup. Form balasan mendukung pemilihan tujuan balasan dan lampiran.

### 🗂️ Riwayat Forum per Mata Kuliah

- Menampilkan semua topik yang pernah kamu balas, dari semua pertemuan, dikelompokkan per mata kuliah.
- Riwayat diambil dari server MENTARI, jadi balasan yang dikirim lewat Mentari Mod maupun langsung di MENTARI ikut muncul.
- Data dimuat saat mata kuliah dibuka. Tombol refresh di tab Riwayat memuat ulang data.

### 📝 Kuesioner

- Kuesioner yang belum diisi tampil di tab **Forum**.
- Di halaman kuesioner (termasuk navigasi SPA tanpa reload), fitur **Smart Kuesioner** otomatis menganalisis teks pertanyaan dan opsi jawaban:
  - Jika API Key sudah dikonfigurasi, pertanyaan (termasuk soal pemahaman/materi) dijawab oleh AI dengan validasi opsi ketat.
  - Jika AI tidak tersedia, sistem memakai heuristik semantik lokal yang membedakan pertanyaan positif dan negatif/kendala (misalnya memilih **"Tidak"** untuk pertanyaan kendala, serta skala tertinggi/terendah yang sesuai).
  - Panel HUD mengambang menampilkan mode aktif, progres pengisian, serta tombol **Batal** / **Kirim Sekarang** / **Isi Ulang**.
- Gunakan fitur ini dengan bijak dan pastikan jawabannya sesuai dengan kondisi kamu.

### ⚡ QuickSurvey

Di halaman survei my.unpam, panel QuickSurvey membantu mengisi survei dengan cepat. Ada empat mode:
- **Isi Otomatis Cerdas**: menganalisis pertanyaan & opsi memakai AI/heuristik lokal dan mengisi kolom teks wajib.
- **Bintang 1–5**: memberi rating sesuai skala yang dipilih untuk semua pertanyaan.
- **Setuju**: memilih opsi setuju di semua pertanyaan.
- **Random (Aman) / Acak Total**: memilih jawaban acak terarah atau penuh.

### 🤖 Konfigurasi AI & Keamanan

- Mendukung **Mentari Route**, **Google Gemini**, **Groq**, **OpenAI**, **OpenRouter**, dan endpoint **Custom (OpenAI-compatible)**.
- API Key disimpan terpisah di `chrome.storage.local` dan dikonfigurasi melalui halaman khusus ekstensi **Pengaturan API AI** (`options_ui`), sehingga *content script* di halaman web tidak pernah menerima plaintext API Key (hanya `https://*/*` serta host *loopback* `localhost`/`127.0.0.1`/`::1` yang diizinkan).
- Seluruh request AI dijalankan melalui Service Worker ekstensi. Jika memakai endpoint **Custom** atau penyedia yang belum diberi izin host, buka **Pengaturan API AI** (atau popup ikon **Mentari Mod**) lalu klik **Izinkan Akses Host**.
- Pada halaman ujian/quiz, **Quiz Helper** tidak mengisi otomatis jawaban *fallback* lokal dan menyediakan tombol **Ulangi Analisis AI** serta **Pengaturan API** bila request AI gagal.

### 🗓️ Presensi

Di halaman my.unpam, popup presensi menampilkan kelas dan item presensi. Ada juga link cepat ke halaman presensi dari tab Forum.

### 📋 Salin Topik Forum

Di halaman topik forum, tombol **Salin Topik** menyalin isi topik ke clipboard, misalnya untuk ditempel ke catatan.

### 🐔 Mentari Fox Playground

Panel kecil di halaman dashboard MENTARI berisi pet mini yang bisa kamu ajak main (rubah dan ayam). Mode malam dan siang berganti otomatis mengikuti jam perangkat: malam dimulai pukul 18.00 dan berakhir pukul 05.59. Tombol 🌙 atau tombol **N** tetap bisa dipakai untuk mengubahnya secara manual.

### 🎨 Tampilan

- Popup dan semua komponen memakai tema full-dark **Deep Starry Galaxy Space Purple** (`#080614` / `#0D091F` / `#15102E` dengan aksen nebula ungu `#7C3AED` dan taburan micro-starfield statis).
- Halaman login MENTARI mendapat kartu informasi versi (**Tuning by Rixz**) dan tampilan latar WebP yang ringan.

## 🔄 Perbedaan & Optimasi (Tuning by Rixz)

- Seluruh antarmuka diubah ke tema full-dark **Deep Starry Galaxy Space Purple** yang konsisten dan kontras tinggi.
- Gambar latar dikompresi dari PNG (1.28 MB) menjadi WebP (~81 KB) dan timer polling `setInterval` di dashboard/login diganti `MutationObserver` + `requestAnimationFrame`.
- Dilengkapi **MentariFetchGuard** untuk mencegah badai HTTP 429 saat membuka shortcut.
- Transport AI & penyimpanan API Key terpusat di Service Worker + `chrome.storage.local` melalui modul bersama (`aiProtocol.js` & `aiClient.js`), serta kanal perintah terisolasi dari skrip halaman.
- Tab **Riwayat**, Smart Kuesioner, dan Quiz Helper paralel cepat dengan cache per-pengguna dan validasi opsi ketat.

## 🛠️ Cara Instalasi

### Windows / macOS (Microsoft Edge, Chrome, Brave)

Untuk hasil paling optimal tanpa peringatan manifest di Edge/Chrome:

```
1. Buka edge://extensions/ (Edge) atau chrome://extensions/ (Chrome/Brave)
2. Aktifkan "Developer mode" (Mode Pengembang)
3. Klik "Load unpacked" lalu pilih folder root proyek ini (yang berisi manifest.json)
4. Tekan Alt+Shift+M kapan saja di halaman MENTARI untuk membuka/menutup panel Mentari Mod
```

*(Untuk membuat file `.zip` distribusi rilis, jalankan `python scripts/build-chromium.py` — hasilnya tersimpan di `dist/mentari-mod-edge-chrome-v3.0.zip`.)*

### Mises Browser (iOS / Android)

```
1. Unduh Mises Browser dari App Store atau Play Store
2. Buka Mises Browser di perangkat Anda
3. Ketuk menu (tiga titik) di pojok kanan atas
4. Pilih "Extensions"
5. Aktifkan "Developer Mode"
6. Klik "+ (from .zip/.crx/.user.js)"
7. Pilih file ZIP Mentari Mod
8. Refresh halaman MENTARI
```

## ❓ FAQ

**Di halaman mana ekstensi ini bekerja?**
Di halaman MENTARI (`mentari.unpam.ac.id`) dan my.unpam (`my.unpam.ac.id`). Di halaman lain, ekstensi tidak aktif.

**Apakah ekstensi ini mengerjakan quiz atau forum secara otomatis?**
Tidak. Tab Forum hanya menampilkan daftar yang belum selesai dan memudahkan kamu membalas. Pengisian kuesioner dan QuickSurvey hanya berjalan saat kamu menekan tombolnya atau membuka halamannya, dan tetap menjadi tanggung jawab kamu.

**Popup tidak bisa dibuka atau daftar forum kosong. Apa yang harus dilakukan?**
Muat ulang halaman MENTARI, lalu klik tombol refresh di popup. Pastikan kamu sudah login.

**Riwayat tidak menampilkan balasan terbaru?**
Tekan tombol refresh di tab Riwayat. Data diambil ulang dari server MENTARI.

**Kenapa tombol Mentari Mod tidak muncul di header?**
Pastikan ekstensi sudah aktif di `chrome://extensions/` dan halaman sudah dimuat ulang. Tombol hanya muncul di halaman MENTARI yang punya header dengan tombol tema.

## 📄 Atribusi dan Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

- Proyek asli: [MENTARI MOD](https://github.com/lukman754/Mentari-Unpam) oleh [Lukman Muludin](https://github.com/lukman754) (MIT License).
- Basis fork v2: [mentari-modv2](https://github.com/alfinasinaja/mentari-modv2) oleh [Alfinas Sandi](https://github.com/alfinasinaja).
- Tuning v3.0, tema Deep Starry Galaxy Space Purple & optimasi: **Tuning by Rixz**.

## ⚠️ Disclaimer

Mentari Mod adalah proyek independen. Proyek ini **tidak berafiliasi secara resmi** dengan Universitas Pamulang maupun pengelola platform MENTARI. Penggunaan ekstensi sepenuhnya menjadi tanggung jawab pengguna.

---

<div align="center">
  <p>v3.0 Revised • Tuning by Rixz • Fork of Alfinas Sandi</p>
</div>