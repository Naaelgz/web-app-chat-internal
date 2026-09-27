# Akselera.Tech Internal Chat

Aplikasi chat internal berbasis web untuk percakapan langsung antar pengguna.

## Status dan URL aplikasi

- URL lokal: http://localhost:3000 setelah aplikasi dijalankan.
- URL publik: https://web-app-chat-internal.vercel.app

## Tech

- **Next.js 16, React 19, TypeScript** untuk UI dan API Route Handler.
- **Neon PostgreSQL** sebagai database terkelola dengan driver serverless yang cocok untuk API Next.js. Neon dipilih agar aplikasi mendapat PostgreSQL tanpa mengelola server database sendiri; dibanding Supabase, kebutuhan proyek ini hanya database sehingga layanan database terpisah lebih sederhana dan tidak membawa layanan tambahan yang tidak digunakan.
- **Ably** untuk pengiriman event realtime. Ably mengelola koneksi dan distribusi event, sedangkan koneksi WebSocket yang terus terbuka tidak cocok dijalankan langsung pada fungsi serverless Vercel. Jika `ABLY_API_KEY` tidak diatur, aplikasi menggunakan polling database sebagai fallback.
- **Vercel** adalah hosting yang disarankan karena dukungan Next.js langsung dan deployment terhubung dengan Git.

Untuk demo atau proyek kecil, dapat dimulai dengan Neon, Ably, dan Vercel. Neon menyediakan PostgreSQL terkelola, Ably menyediakan kuota realtime, dan Vercel menjalankan aplikasi Next.js serta deployment dari Git. Pemakaian kuota dibatasi dengan polling fallback setiap 60 detik, heartbeat presence setiap 30 detik, dan penghentian request berkala saat tab tersembunyi; saat tab kembali terlihat, data langsung diperbarui. Kuota, batas pemakaian, dan ketentuan kelayakan paket dapat berubah.

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

Koneksi database dan query hanya berada di kode server (`lib/server` dan API Route Handler); kredensial database tidak dikirim ke browser. Setiap endpoint data memvalidasi session dari cookie HttpOnly, lalu query percakapan dan pesannya membatasi hasil melalui `conversation_members` milik pengguna yang terautentikasi. Query menggunakan parameter SQL, bukan interpolasi input. `proxy.ts` mengarahkan permintaan halaman `/chat` tanpa cookie session ke `/login` sebagai lapisan awal; validasi tetap dilakukan oleh API karena keberadaan cookie saja tidak membuktikan session masih valid.

## Hal yang belum selesai

- Belum ada rangkaian test otomatis untuk alur autentikasi, hak akses percakapan, dan realtime.

## AI tools dan instruksi proyek

GitHub Copilot digunakan untuk pembuatan dan perbaikan proyek serta Claude digunakan untuk review proyek.