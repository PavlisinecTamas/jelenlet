# Jelenlét – QR-kódos jelenlétellenőrzés

A BME SharkTeam csapatgyűléseire. A kivetítőn 15 másodpercenként új QR-kód
jelenik meg. A résztvevők beolvassák, kiválasztják a nevüket, és a végén a
kivetítő gépe CSV-fájlba menti, ki volt jelen és ki nem.

Sima HTML/CSS/JS: nincs build, nincs npm-függőség, nincs saját szerver.

- **Telefonos oldal:** `https://pavlisinectamas.github.io/jelenlet/` (ide visz a QR)
- **Kivetítő:** `https://pavlisinectamas.github.io/jelenlet/kivetito.html`

## Használat a gyűlésen

1. Nyisd meg a kivetítő oldalt. Add meg a gyűlés nevét (alapból a mai dátum),
   és illeszd be a névsort, soronként egy névvel. A gép megjegyzi a névsort
   a következő alkalomra. Ezután *Új gyűlés indítása*.
2. *Teljes képernyő* (kilépés: Esc). Alul látszik, hányan vannak jelen, és ki
   jelentkezett legutóbb. A résztvevő ebből látja, hogy megjött-e a jelentkezése.
3. A végén *Lezárás*. Az összesítőben a telefon nélkül érkezőket kézzel be
   lehet pipálni, majd *Letöltés (CSV)*. A fájl Excelben és Google Sheetsben is
   megnyitható: Név | Jelen (igen/nem) | Időpont | Megjegyzés.

Ha véletlenül bezárod vagy újratöltöd a kivetítőt, a *Folytatás* gombbal
ugyanott folytatható. Az eddigi jelenlét megmarad, de a kiesés alatt érkező
jelentkezések elvesznek (lásd Adatvédelem). Akit ez érint, annak nem jelenik
meg a neve a kivetítőn, úgyhogy újra beolvassa a kódot.

A telefon megjegyzi a nevet. Legközelebb elég egy gombnyomás
(„Jelen vagyok: …”), a „Nem én vagyok” gombbal pedig másik név választható.

## Hogyan működik

Nincs saját szerver: a telefonok és a kivetítő az
[ntfy.sh](https://ntfy.sh) nyilvános, ingyenes üzenettovábbítóján keresztül
beszélnek egymással, gyűlésenként egy véletlen nevű csatornán.

```
kivetítő ──névsor──▶ ntfy.sh csatorna ◀──kód + név── telefon
    ▲                       │
    └──── élő figyelés ─────┘   (a kivetítő ellenőriz és könyvel)
```

- **QR-kód:** egy link az `index.html`-re, benne a csatorna neve, a 15 mp-es
  időablak sorszáma és ezek HMAC-SHA256 aláírása. Az aláíró kulcsot a
  kivetítő minden gyűlésnél véletlenszerűen generálja, és soha nem küldi el
  sehova. Így csak a kivetítőn látott kód érvényes.
- **Érvényesség:** a kivetítő az ntfy.sh időbélyege alapján dönt. A kód a
  saját és a szomszédos 15 mp-es ablakban érvényes, vagyis egy továbbküldött
  link legfeljebb kb. 30 mp-ig használható. Aki listából választ nevet, annak
  a telefonja a kódot azonnal beküldi, és a beolvasástól számított 5 percen
  belül érkező név is érvényes. Egy beolvasással csak egy név jelölhető.
- **Szándékosan nincs:** bejelentkezés, és annak kizárása, hogy valaki más
  nevében is jelentkezzen. Zárt körben használjuk, az ilyen visszaélés
  utólag ellenőrizhető.

### Korlátok

- **Adatvédelem:** a jelentkezéseket a telefon `Cache: no` fejléccel küldi.
  Az ntfy.sh ezeket csak élőben továbbítja a kivetítőnek, nem tárolja, így
  utólag senki nem kérheti le, ki jelentkezett. Ennek ára, hogy ha a kivetítő
  épp nem kapcsolódik (a képernyőn hibaüzenet), az akkor érkező jelentkezés
  elvész. A **névsor** és a gyűlés neve viszont kb. 12 óráig tárolódik, mert
  ebből választanak a telefonok. A csatorna neve benne van a QR linkjében
  (`#c=sharkteam-…`), és aki ismeri, ezen a címen kérheti le:
  `https://ntfy.sh/<csatorna>/json?poll=1`. A csatornák listája nem nyilvános,
  és véletlen nevű csatornát kitalálni nem lehet. Az ntfy.sh-n egy elküldött
  üzenet nem törölhető: a „törlés” csak egy újabb eseményt tesz mellé.
- **Kérésszám:** az ntfy.sh IP-címenként 60 kérést enged egyszerre, utána
  5 mp-enként egyet. Egy jelentkezés 1 kérés (megjegyzett névvel) vagy
  3 kérés (névválasztással). Ha a fél csapat egy NAT-olt Wi-Fi-ről jelentkezik,
  ez elfogyhat. Ilyenkor a telefon azt kéri, hogy mobilnetről próbálja újra.
- **Hálózatfüggés:** ha az ntfy.sh nem elérhető, a rendszer sem működik.
  Ilyenkor marad a kézi pipálás az összesítőben.
- **Hamis kód:** hamisított vagy lejárt kódnál a kivetítő nem rögzít semmit,
  de a telefon nem mindig tudja ezt előre jelezni. Ellenőrizni azt lehet, hogy
  a név megjelenik-e a kivetítőn.
- **Névsor mérete:** a névsor legfeljebb kb. 150 név lehet (az ntfy.sh 4 KB-os
  üzenetkorlátja miatt).

## Fájlok

| Fájl | Szerep |
| --- | --- |
| `index.html`, `checkin.js` | telefonos oldal |
| `kivetito.html`, `kivetito.js` | kivetítő: QR, figyelés, összesítő, CSV |
| `common.js` | közös konstansok (időablak, érvényesség) és ntfy.sh segédfüggvények |
| `style.css` | stílus (a SharkTeam honlap tokenjeiből) |
| `vendor/qrcodegen.js` | [Nayuki QR Code generator](https://www.nayuki.io/page/qr-code-generator-library) (MIT), lefordítva; forrás a fájl fejlécében |

## Kipróbálás helyben

`python3 -m http.server` a repó gyökerében, majd `http://localhost:8000/kivetito.html`.
A Web Crypto miatt `localhost`-ról vagy https-ről kell megnyitni. Telefonról
tehát csak a GitHub Pages-es (https) címen működik.

## Kirakás

A `main` ágra pusholt minden változtatást a `.github/workflows/pages.yml`
kirak GitHub Pagesre (*Settings → Pages → Source: GitHub Actions*).
