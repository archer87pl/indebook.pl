import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** Zapisuje zdjęcie do /public/uploads/<dir>/ i zwraca publiczną ścieżkę. */
export async function savePhotoFile(file: File, dir: string): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Dozwolone formaty: JPG, PNG, WebP.");
  if (file.size === 0) throw new Error("Pusty plik.");
  if (file.size > MAX_SIZE) throw new Error("Zdjęcie może mieć maksymalnie 8 MB.");

  const name = `${randomBytes(8).toString("hex")}${ext}`;
  const targetDir = join(process.cwd(), "public", "uploads", dir);
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${dir}/${name}`;
}

export async function deletePhotoFile(publicPath: string): Promise<void> {
  // publicPath ma format /uploads/<dir>/<name> — nie pozwól wyjść poza uploads
  if (!/^\/uploads\/[\w-]+\/[\w-]+\.\w+$/.test(publicPath)) return;
  await unlink(join(process.cwd(), "public", publicPath)).catch(() => {});
}
