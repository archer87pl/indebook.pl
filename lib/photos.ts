import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { del, put } from "@vercel/blob";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Magazyn zdjęć — abstrakcja jak DomainProvider i ChannelProvider.
 * `name` to ścieżka względna w rodzaju "uploads/p1/ab12.jpg".
 */
interface PhotoStorage {
  save(file: File, name: string): Promise<string>;
  remove(ref: string): Promise<void>;
}

/** Vercel Blob — domyślny na Vercelu, wymaga BLOB_READ_WRITE_TOKEN. */
const blobStorage: PhotoStorage = {
  async save(file, name) {
    const { url } = await put(name, file, { access: "public", contentType: file.type });
    return url;
  },
  async remove(ref) {
    if (!/^https?:\/\//.test(ref)) return;
    await del(ref).catch(() => {});
  },
};

/** Katalog na zdjęcia w self-hoście (w Dockerze podmontowany wolumen). */
function uploadsRoot(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "public", "uploads");
}

/**
 * Sklejenie ścieżki z kontrolą wyjścia poza katalog bazowy. `ref` bierze się
 * z bazy, ale to jedyna bariera między nim a `unlink` — bez niej wpis w stylu
 * `/uploads/../../.env` kasowałby pliki spoza katalogu zdjęć.
 */
function safeJoin(base: string, relative: string): string {
  const root = resolve(base);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Nieprawidłowa ścieżka zdjęcia.");
  }
  return target;
}

/**
 * Zapis na dysk — self-host bez Vercel Blob. Zwraca ścieżkę `/uploads/...`,
 * serwowaną z katalogu `public`.
 */
const diskStorage: PhotoStorage = {
  async save(file, name) {
    // name zaczyna się od "uploads/", a katalogiem bazowym jest już .../uploads
    const relative = name.replace(/^uploads\//, "");
    const target = safeJoin(uploadsRoot(), relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));
    return `/uploads/${relative}`;
  },
  async remove(ref) {
    if (!ref.startsWith("/uploads/")) return; // URL Bloba albo obcy adres
    const target = safeJoin(uploadsRoot(), ref.slice("/uploads/".length));
    await unlink(target).catch(() => {}); // brak pliku to nie błąd
  },
};

/**
 * Wybór magazynu: Vercel Blob gdy jest token, inaczej dysk. Brak konfiguracji
 * nie wyłącza tu funkcji (jak przy Channexie), tylko przełącza na wariant
 * lokalny — inaczej self-host nie miałby jak przyjąć zdjęcia.
 */
function photoStorage(): PhotoStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? blobStorage : diskStorage;
}

/**
 * Zapisuje zdjęcie i zwraca jego publiczny adres.
 * `dir` grupuje pliki per obiekt, np. "p1" → uploads/p1/<losowa>.jpg
 */
export async function savePhotoFile(file: File, dir: string): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Dozwolone formaty: JPG, PNG, WebP.");
  if (file.size === 0) throw new Error("Pusty plik.");
  if (file.size > MAX_SIZE) throw new Error("Zdjęcie może mieć maksymalnie 8 MB.");
  if (!/^[a-z0-9_-]+$/i.test(dir)) throw new Error("Nieprawidłowy katalog zdjęć.");

  const name = `uploads/${dir}/${randomBytes(8).toString("hex")}${ext}`;
  return photoStorage().save(file, name);
}

/** Usuwa zdjęcie. `ref` to wartość zwrócona wcześniej przez savePhotoFile. */
export async function deletePhotoFile(ref: string): Promise<void> {
  await photoStorage().remove(ref);
}

/**
 * Ścieżka pliku zdjęcia na dysku dla adresu względnego z `/uploads/...`.
 * Używa jej trasa serwująca; rzuca, gdy adres wychodzi poza katalog zdjęć.
 */
export function photoPathOnDisk(relative: string): string {
  return safeJoin(uploadsRoot(), relative);
}

/** Eksport na potrzeby testów — logika ścieżek jest tu najbardziej ryzykowna. */
export const __testing = { safeJoin, diskStorage, photoStorage, uploadsRoot };
