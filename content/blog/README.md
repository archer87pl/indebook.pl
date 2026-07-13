# Blog — jak dodać artykuł

Każdy artykuł to jeden plik `.md` w tym katalogu. Nazwa pliku (bez `.md`)
staje się adresem: `nazwa-pliku.md` → `/blog/nazwa-pliku`.

Publikacja: **commit pliku + wdrożenie** (strony są generowane statycznie przy
`next build`). Nowy artykuł nie wymaga zmian w kodzie.

## Szablon

```markdown
---
title: Tytuł artykułu
date: 2026-07-14
excerpt: Jedno–dwa zdania zajawki (widoczne na liście i w wynikach Google).
tag: Sprzedaż
author: Zespół Rezio
cover: /blog/nazwa-obrazka.jpg
draft: false
---

Treść w **Markdown**: nagłówki (## i ###), listy, **pogrubienia**,
[linki](/rejestracja), tabele, cytaty (>) i bloki kodu.
```

## Pola nagłówka (frontmatter)

| Pole | Wymagane | Opis |
|---|---|---|
| `title` | tak | Tytuł artykułu |
| `date` | tak | Data `YYYY-MM-DD` (sortowanie i wyświetlanie) |
| `excerpt` | zalecane | Zajawka na liście i w meta description |
| `tag` | nie | Etykieta kategorii (np. „Finanse”) |
| `author` | nie | Autor (domyślnie „Rezio”) |
| `cover` | nie | Ścieżka do obrazka w `public/`, np. `/blog/foto.jpg`; brak = tekstura |
| `draft` | nie | `true` = szkic, niewidoczny na produkcji |

Obrazki wgrywaj do `public/blog/` i podawaj ścieżką `/blog/...`.
