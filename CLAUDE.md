# Izzie kliens

Az Izzie személyes asszisztens asztali kliense: Tauri 2 + React + TypeScript,
Ubuntun. A backend (Python, FastAPI) egy másik repóban él
(`kovacslajosimre/Izzie`), egy otthoni szerveren, és Tailscale-en érhető el.

## A spec

A tervezési döntések nem ebben a repóban vannak, hanem a backend repóban,
ami ezen a gépen e repó mellett él:

```
../Izzie/docs/client.md
```

* **Minden feladat előtt olvasd el** a vonatkozó részt.
* A spec az irányadó. Ha ütközik a kóddal, vagy rossz ötletnek tartod, azt
jelezd, ne térj el tőle csendben.
* **A specet ne szerkeszd.** Az egy másik repó, a döntések egy külön
beszélgetésben születnek. Ha a spec módosítására van szükség, írd le, mit
és miért.
* A backend API-ját a `docs/client.md` és a backend `app/main.py`-ja írja
le; a backend kódjához ne nyúlj.

## Munkamód

* A kommunikáció magyarul folyik. A döntések mögötti indoklás is kell, nem
csak az eredmény.
* Kódírás előtt terv: mit, hova, miért, milyen tesztekkel. Jóváhagyás után
implementálj.
* Ne építs előre olyat, amit a spec nem kér.

## Kód

* TypeScript, szigorú típusokkal. `any` csak indoklással.
* A tiszta logika (pl. a stream bontása) Reacttől és hálózattól független
modulban él, és tesztelve van.
* Kommentek és azonosítók angolul vagy ékezet nélkül; a felhasználói
felület szövegei magyarul, ékezetekkel.
* Rust-kódhoz (`src-tauri/`) csak akkor nyúlj, ha a spec kifejezetten kéri.

## Titkok

* A szerver címe és a token a `.env.local`-ban van. **Soha ne commitold**,
ne írd ki a tartalmát, és ne tedd a kódba.
* A `.env.example` csak a változók nevét tartalmazza, érték nélkül.

## Parancsok

A környezet Ubuntu, bash.

```bash
npm install          # függőségek
npm test             # tesztek (Vitest)
npm run tauri dev    # fejlesztői indítás
npx tsc --noEmit     # típusellenőrzés
```

A `tauri dev` indításához és leállításához a felhasználó kell (ablakot
nyit, valódi szerverhez csatlakozik). A teszteket és a típusellenőrzést
futtathatod magad.

## Git

* Commit előtt `git status`, és csak a feladathoz tartozó fájlokat add
hozzá. `git add .` és `git add -A` nem használható.
* Commit üzenet magyarul, ékezetek nélkül.
* Push csak akkor, ha a felhasználó kéri.

## Jelenlegi állapot

* Kész: Tauri + React + TS váz, `Izzie` ablakcímmel,
`com.kovacslajosimre.izzie` identifierrel.
* Kész: 1. szelet, chatablak. Stream-bontó modul (`src/sse.ts`,
Vitesttel tesztelve), hálózati réteg (`src/chatClient.ts`), a chat UI
(`src/App.tsx`). A sablon `greet` parancsa (Rust és UI oldalon is)
törölve. A füstpróba (2026-09-16) rendben lefutott.
* Kész: 2. szelet (szerver és kliens rész is). Szerveroldali
időkorlátok a Gemini-hívásokon (másik repó). Kliensoldalon a
`chatClient.ts`-ben egy belső időzítő (`IDLE_TIMEOUT_MS`, `AbortSignal.any`
a felhasználói leállítással), ami megkülönbözteti az `aborted` és a
`timeout` végkimenetelt; az `App.tsx`-ben egy meglévő állapotból
levezetett, animált „Izzie gondolkodik…” jelzés az első token
megérkezéséig. A füstpróba (2026-09-17) rendben lefutott.
* 2026 októberében a fejlesztés Windowsról Ubuntura költözött.
* Kész: 3. szelet kliens része,
előzmény betöltése indításkor. A szerver `GET /history`-ja a másik
repóban kész. Tiszta átalakító modul (`src/history.ts`, Vitesttel
tesztelve): alakellenőrzés, session-elválasztók, `srv-<id>`/`sep-<id>`
azonosítók, magyar dátumformázás (`timeZone` paraméterrel tesztelve, a
mikroszekundumos időbélyeget ezredmásodpercre vágja). `fetchHistory()` a
`chatClient.ts`-ben, 15 s-os teljes időkorláttal és új `timeout`
hibafajtával. Az `App.tsx`-ben külön előzmény-állapot (betöltés, siker,
hiba); betöltés közben a küldés tiltva, hibánál működik. A StrictMode
dupla effektjét `AbortController` és felülíró `setHistory` kezeli. A
füstpróba (2026-10-24) rendben lefutott.
* Következik: a következő szelet (pl. token az operációs rendszer
jelszótárában).

