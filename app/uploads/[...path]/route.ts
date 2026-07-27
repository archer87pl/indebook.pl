// Serwowanie zdjęć zapisanych na dysku (self-host bez Vercel Blob).
//
// Katalog `public` jest kopiowany przy budowaniu obrazu, a Next w trybie
// standalone NIE serwuje plików dopisanych tam później — sprawdzone na żywo:
// plik istnieje w kontenerze, a żądanie zwraca 404. Dlatego uploady mają
// własną trasę czytającą z dysku w czasie żądania.
//
// Na Vercelu ta trasa jest martwa: zdjęcia mają wtedy absolutne adresy Bloba.
//
// Świadomie bez własnego Cache-Control: sprawdzone na żywo — Next i tak
// nadpisuje go na trasach route handlerów (`public, max-age=0`), więc
// deklarowanie `immutable` byłoby tylko mylącym martwym kodem. Nazwy plików
// są losowe, więc buforowanie warto dołożyć na reverse proxy przed aplikacją.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { photoPathOnDisk } from "@/lib/photos";

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const relative = path.join("/");

  const extension = relative.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE[extension];
  // tylko formaty, które sami zapisujemy — trasa nie jest czytnikiem plików
  if (!contentType) return new Response("Not found", { status: 404 });

  let target: string;
  try {
    target = photoPathOnDisk(relative); // rzuca przy wyjściu poza katalog
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  try {
    const info = await stat(target);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(target)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
    },
  });
}
