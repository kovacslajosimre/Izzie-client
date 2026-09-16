# Izzie kliens

Az Izzie személyes asszisztens asztali kliense: Tauri 2 + React + TypeScript,
Windowson. A backend (Python, FastAPI) egy másik repóban él
(`kovacslajosimre/Izzie`), egy otthoni szerveren, és Tailscale-en érhető el.

## A spec

A tervezési döntések nem ebben a repóban vannak, hanem a backend repóban,
ami egy Obsidian vaultban él ezen a gépen:

```
C:\\Users\\LamaLT\\Documents\\Obsidian\\Personal\\Project Izzie\\Izzie\\docs\\client.md
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

A környezet Windows, PowerShell.

```powershell
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
* Következik: 1. szelet, chatablak (lásd a spec „1. szelet” részét).

