import { randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Zapisuje zdjęcie w Vercel Blob i zwraca jego publiczny URL.
 * `dir` grupuje pliki per obiekt, np. "p1" → uploads/p1/<losowa>.jpg
 */
export async function savePhotoFile(file: File, dir: string): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Dozwolone formaty: JPG, PNG, WebP.");
  if (file.size === 0) throw new Error("Pusty plik.");
  if (file.size > MAX_SIZE) throw new Error("Zdjęcie może mieć maksymalnie 8 MB.");

  const name = `uploads/${dir}/${randomBytes(8).toString("hex")}${ext}`;
  const { url } = await put(name, file, {
    access: "public",
    contentType: file.type,
  });
  return url;
}

/** Usuwa zdjęcie z Vercel Blob. `ref` to pełny URL zwrócony przez savePhotoFile. */
export async function deletePhotoFile(ref: string): Promise<void> {
  if (!/^https?:\/\//.test(ref)) return; // ignoruj stare, lokalne ścieżki
  await del(ref).catch(() => {});
}
