import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __testing, deletePhotoFile, savePhotoFile } from "./photos";

const { safeJoin, photoStorage, diskStorage } = __testing;

const originalEnv = {
  UPLOADS_DIR: process.env.UPLOADS_DIR,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "rezflow-uploads-"));
  process.env.UPLOADS_DIR = root;
  delete process.env.BLOB_READ_WRITE_TOKEN; // wariant self-host
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function jpg(bytes = 4): File {
  return new File([new Uint8Array(bytes).fill(7)], "x.jpg", { type: "image/jpeg" });
}

describe("wybór magazynu", () => {
  it("bez tokenu Bloba zapisuje na dysk — self-host musi przyjąć zdjęcie", () => {
    expect(photoStorage()).toBe(diskStorage);
  });

  it("z tokenem Bloba przełącza się na Vercel Blob", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_xxx";
    expect(photoStorage()).not.toBe(diskStorage);
  });
});

describe("zapis na dysk", () => {
  it("zwraca ścieżkę /uploads/... i faktycznie tworzy plik", async () => {
    const path = await savePhotoFile(jpg(), "p1");

    expect(path).toMatch(/^\/uploads\/p1\/[a-f0-9]{16}\.jpg$/);
    const onDisk = join(root, path.slice("/uploads/".length));
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk)).toHaveLength(4);
  });

  it("zakłada katalog obiektu, gdy jeszcze nie istnieje", async () => {
    await savePhotoFile(jpg(), "p42");
    expect(existsSync(join(root, "p42"))).toBe(true);
  });

  it("dwa zdjęcia nie nadpisują się nawzajem", async () => {
    const a = await savePhotoFile(jpg(), "p1");
    const b = await savePhotoFile(jpg(), "p1");
    expect(a).not.toBe(b);
  });
});

describe("walidacja pliku", () => {
  it("odrzuca nieobsługiwany format", async () => {
    const gif = new File([new Uint8Array(4)], "x.gif", { type: "image/gif" });
    await expect(savePhotoFile(gif, "p1")).rejects.toThrow(/JPG, PNG, WebP/);
  });

  it("odrzuca pusty plik", async () => {
    await expect(savePhotoFile(jpg(0), "p1")).rejects.toThrow(/Pusty/);
  });

  it("odrzuca plik powyżej 8 MB", async () => {
    await expect(savePhotoFile(jpg(9 * 1024 * 1024), "p1")).rejects.toThrow(/8 MB/);
  });

  it("odrzuca katalog spoza wzorca — trafia do ścieżki na dysku", async () => {
    await expect(savePhotoFile(jpg(), "../../etc")).rejects.toThrow(/katalog/);
    await expect(savePhotoFile(jpg(), "p1/../..")).rejects.toThrow(/katalog/);
  });
});

describe("usuwanie", () => {
  it("kasuje plik spod wskazanej ścieżki", async () => {
    const path = await savePhotoFile(jpg(), "p1");
    const onDisk = join(root, path.slice("/uploads/".length));

    await deletePhotoFile(path);
    expect(existsSync(onDisk)).toBe(false);
  });

  it("brak pliku nie jest błędem", async () => {
    await expect(deletePhotoFile("/uploads/p1/nie-ma.jpg")).resolves.toBeUndefined();
  });

  it("ignoruje adresy Bloba zapisane wcześniej w bazie", async () => {
    await expect(
      deletePhotoFile("https://blob.vercel-storage.com/uploads/p1/a.jpg")
    ).resolves.toBeUndefined();
  });
});

describe("safeJoin", () => {
  it("nie wypuszcza poza katalog bazowy", () => {
    // ref pochodzi z bazy i idzie prosto do unlink — to jedyna bariera
    expect(() => safeJoin(root, "../../.env")).toThrow(/ścieżka/);
    expect(() => safeJoin(root, "p1/../../../secret")).toThrow(/ścieżka/);
  });

  it("przepuszcza ścieżki wewnątrz katalogu", () => {
    expect(safeJoin(root, "p1/a.jpg")).toBe(join(root, "p1", "a.jpg"));
    expect(safeJoin(root, "p1/../p2/a.jpg")).toBe(join(root, "p2", "a.jpg"));
  });

  it("usuwanie przez ścieżkę z wyjściem w górę rzuca zamiast kasować", async () => {
    const outside = join(root, "..", "poza-katalogiem.txt");
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "nie kasuj mnie");

    await expect(deletePhotoFile("/uploads/../poza-katalogiem.txt")).rejects.toThrow();
    expect(existsSync(outside)).toBe(true);
  });
});
