# Akselera.Tech Internal Chat

Aplikasi chat internal berbasis web untuk percakapan langsung antar pengguna.

## Status dan URL aplikasi

- URL lokal: http://localhost:3000 setelah aplikasi dijalankan.
- URL publik: belum tersedia; aplikasi belum dikonfigurasi untuk deployment produksi.

## Teknologi

- **Next.js 16, React 19, TypeScript** untuk UI dan API Route Handler.
- **Neon PostgreSQL** sebagai database terkelola dan kompatibel dengan pola serverless.
- **Ably** untuk pengiriman event realtime. Jika `ABLY_API_KEY` tidak diatur, aplikasi menggunakan polling database.
- **Vercel** adalah target hosting yang disarankan karena dukungan Next.js langsung dan deployment terhubung dengan Git. Deployment belum dilakukan.

## Paket gratis

Untuk demo atau proyek kecil, layanan dapat dimulai dengan paket gratis Neon, Ably, dan Vercel Hobby. Neon menyediakan PostgreSQL terkelola, Ably menyediakan kuota realtime, dan Vercel menjalankan aplikasi Next.js serta deployment dari Git. Kuota, batas pemakaian, dan ketentuan kelayakan paket dapat berubah; periksa ketentuan masing-masing layanan sebelum deployment. Jika batas Ably tidak sesuai kebutuhan, aplikasi tetap dapat berjalan dengan polling.

## Menjalankan secara lokal

1. Siapkan database PostgreSQL di Neon dan salin pooled connection string.
2. Buat `.env.local` di root project:

   ```env
   DATABASE_URL=postgresql://...
   ABLY_API_KEY=...
   ```

   `ABLY_API_KEY` opsional untuk mode polling. Jangan menambahkan secret ke variabel `NEXT_PUBLIC_*` atau meng-commit `.env.local`.
3. Jalankan:

   ```bash
   npm install
   npm run dev
   ```

4. Buka http://localhost:3000.

## Akun sampel

Akun berikut dibuat otomatis saat database pertama kali diinisialisasi. Password bersama untuk ketiga akun adalah `password123`.

| Nama | Email | Password |
| --- | --- | --- |
| Alice | `alice@akselera.tech` | `password123` |
| Bob | `bob@akselera.tech` | `password123` |
| Charlie | `charlie@akselera.tech` | `password123` |

Akun dan password ini hanya untuk demo. Jangan gunakan sebagai kredensial produksi.

## Struktur database

Tabel dibuat otomatis oleh aplikasi saat API pertama kali mengakses database.

| Tabel | Kolom penting | Relasi dan batasan |
| --- | --- | --- |
| `users` | `id` (PK), `name`, `email` (unik), `password_salt`, `password_hash`, `created_at` | Akun pengguna. Password disimpan sebagai hash `scrypt` dengan salt. |
| `sessions` | `token_hash` (PK), `user_id`, `expires_at`, `created_at` | `user_id` mereferensikan `users.id` dengan cascade delete. Token session mentah tidak disimpan. |
| `conversations` | `id` (PK), `user_a_id`, `user_b_id`, `created_at`, `updated_at` | Kedua ID mereferensikan `users.id`; `user_a_id < user_b_id` dan pasangan pengguna unik. |
| `conversation_members` | `conversation_id`, `user_id` (PK gabungan) | Kedua kolom mereferensikan tabel masing-masing dengan cascade delete; menetapkan anggota yang boleh mengakses percakapan. |
| `messages` | `id` (PK), `conversation_id`, `sender_id`, `body`, `created_at`, `is_read` | Percakapan mereferensikan `conversations.id` dengan cascade delete; pengirim mereferensikan `users.id`; panjang `body` dibatasi 1 sampai 4000 karakter. |
| `presence` | `user_id` (PK), `last_seen_at` | `user_id` mereferensikan `users.id` dengan cascade delete. |

## Keamanan akses data

Koneksi database dan query hanya berada di kode server (`lib/server` dan API Route Handler); kredensial database tidak dikirim ke browser. Setiap endpoint data memvalidasi session dari cookie HttpOnly, lalu query percakapan dan pesannya membatasi hasil melalui keanggotaan `conversation_members` milik pengguna yang terautentikasi. Query menggunakan parameter SQL, bukan interpolasi input. `proxy.ts` mengarahkan permintaan halaman `/chat` tanpa cookie session ke `/login` sebagai lapisan awal; validasi otorisasi tetap dilakukan oleh API karena keberadaan cookie saja tidak membuktikan session masih valid.

## Hal yang belum selesai

- Deployment produksi belum dilakukan, sehingga URL publik belum tersedia.
- Akun demo masih dibuat otomatis ketika database diinisialisasi; sebelum membuka aplikasi untuk penggunaan produksi, proses provisioning akun demo perlu dinonaktifkan atau diganti.
- Belum ada rangkaian test otomatis untuk alur autentikasi, hak akses percakapan, dan realtime.
- Perlu menetapkan pemantauan pemakaian dan batas layanan untuk paket hosting gratis sebelum penggunaan lebih luas.

## AI tools dan instruksi proyek

GitHub Copilot digunakan sebagai asisten pengembangan. `AGENTS.md` berisi instruksi agen untuk repository, sedangkan `CLAUDE.md` merujuk ke instruksi yang sama; keduanya adalah file konfigurasi/instruksi, bukan bukti bahwa Claude digunakan sebagai tool.