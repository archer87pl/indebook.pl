import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Lokalizowane odpowiedniki nawigacji Next — same dokładają prefiks języka.
// W komponentach gościa importuj Link stąd zamiast z "next/link".
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
