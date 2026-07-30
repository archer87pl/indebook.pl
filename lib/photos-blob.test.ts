import { beforeEach, describe, expect, it, vi } from "vitest";

// Magazyn zdjęć na Vercel Blob — wariant produkcyjny (na self-hoście działa
// dysk, pokryty w photos.test.ts). Atrapa SDK musi być hoistowana, bo inaczej
// test wyszedłby do prawdziwego API z tokenem ze środowiska.

const puts: { name: string; contentType?: string; access?: string }[] = [];
const dels: string[] = [];
let putError: Error | null = null;
let delError: Error | null = null;

vi.mock("@vercel/blob", () => ({
  put: async (name: string, file: File, opts: { access: string; contentType: string }) => {
    if (putError) throw putError;
    puts.push({ name, contentType: opts.contentType, access: opts.access });
    return { url: `https://blob.vercel-storage.com/${name}` };
  },
  del: async (ref: string) => {
    if (delError) throw delError;
    dels.push(ref);
  },
}));

const { __testing } = await import("./photos");

// Do wariantu Blob dochodzimy przez selektor magazynu — tak jak produkcja,
// czyli po obecności tokenu. Dzięki temu test pokrywa też sam wybór.
const blobStorage = (() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
  const storage = __testing.photoStorage();
  vi.unstubAllEnvs();
  return storage;
})();

const jpg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
  puts.length = 0;
  dels.length = 0;
  putError = null;
  delError = null;
});

describe("wybór magazynu", () => {
  it("token Vercel Blob wybiera magazyn zdalny, jego brak — dysk", () => {
    // na Vercelu nie ma trwałego dysku, na self-hoście nie ma tokenu
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
    expect(__testing.photoStorage()).not.toBe(__testing.diskStorage);

    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(__testing.photoStorage()).toBe(__testing.diskStorage);
  });
});

describe("blobStorage.save", () => {
  it("zapisuje plik publicznie i oddaje jego adres", async () => {
    // zdjęcia obiektu są z definicji publiczne — trafiają na stronę WWW
    const url = await blobStorage.save(jpg(), "p3-abc.jpg");

    expect(puts[0]).toMatchObject({ name: "p3-abc.jpg", access: "public" });
    expect(url).toContain("p3-abc.jpg");
  });

  it("przekazuje typ treści z pliku", async () => {
    // bez tego przeglądarka dostałaby octet-stream i pobierała zdjęcie
    // zamiast je pokazać
    await blobStorage.save(jpg(), "p3-abc.jpg");

    expect(puts[0].contentType).toBe("image/jpeg");
  });

  it("błąd magazynu leci do wołającego, który pokaże komunikat", async () => {
    putError = new Error("Blob: token wygasł");

    await expect(blobStorage.save(jpg(), "p3-abc.jpg")).rejects.toThrow(/token wygasł/);
  });
});

describe("blobStorage.remove", () => {
  it("kasuje plik po jego adresie", async () => {
    await blobStorage.remove("https://blob.vercel-storage.com/p3-abc.jpg");

    expect(dels).toEqual(["https://blob.vercel-storage.com/p3-abc.jpg"]);
  });

  it("ścieżka dyskowa nie jest kasowana w Blobie", async () => {
    // rekordy z czasów self-hostu mają ścieżkę, nie URL — próba usunięcia
    // takiej „referencji" byłaby żądaniem do API o bezsensowną nazwę
    await blobStorage.remove("/uploads/p3-abc.jpg");

    expect(dels).toEqual([]);
  });

  it("awaria usuwania nie wywraca akcji — wpis w bazie i tak znika", async () => {
    // osierocony plik w magazynie jest mniejszym problemem niż zablokowana
    // możliwość usunięcia zdjęcia z panelu
    delError = new Error("Blob: 500");

    await expect(
      blobStorage.remove("https://blob.vercel-storage.com/p3-abc.jpg")
    ).resolves.toBeUndefined();
  });
});
