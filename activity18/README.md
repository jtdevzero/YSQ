# Éjfél után · Activity 18+

Magyar nyelvű, Activity-jellegű, egy közös eszközön játszható partijáték felnőtteknek.

Játszható változat: https://jtdevzero.github.io/YSQ/activity18/

- 840 egyedi, 2–3 szavas feladvány: 60 bemelegítő, 180 csípős, 180 merész, 300 külön szex témájú kifejezés és 120 kreatív, abszurd lap.
- „Csak pikáns” pakli: 360 csípős és merész lap, bemelegítő feladványok nélkül. Ez az alapértelmezett pakli.
- „Szex témájú” pakli: 300 külön kifejezés intimitásról, vágyról, szexualitásról és védekezésről.
- „Vegyes” pakli: három erősség; a magasabb szintek a lazább lapokat is tartalmazzák. A külön szex témájú lapok nem kerülnek bele.
- „Abszurd éjszaka” pakli: 120 új lap képtelen szereplőkkel és helyzetekkel, például „Vámpír a véradáson”, „Adóellenőr a Holdon”.
- Témaszűrők: buli és káosz, randi és flört, hálószobai humor, test és vágy, intim kellékek, védekezés és egészség, abszurd világ. Több kijelölésnél bármelyik választott témába illő lap bekerülhet.
- Módhoz illő lapok: minden lap külön besorolást kapott körülíráshoz, mutogatáshoz és rajzoláshoz. A játék az aktuális típushoz megfelelő lapot választ; a többi lapot megőrzi későbbre. Ha nincs megfelelő lap egy kijelölt típushoz, a beállításoknál jelzi.
- 2–6 csapat, 30/60/90 másodperces időkeret, csapatonként 3/5/8 kör.
- Automatikus előadóváltás: csapatonként megadható 2–12 játékos neve, a sorrend körönként lép. Nevek nélkül az 1. és 2. játékost váltja. Több játékosnál, mint körnél nem mindenki kerül sorra.
- Nyílt kör: mindenki találgathat az előadón kívül. Alapból az utolsó teljes kör minden csapatfordulója nyílt; minden körre bekapcsolható vagy kikapcsolható. A Megvan gomb megállítja az órát, a házigazda kijelöli a megfejtő csapatot, majd a játék folytatódik. A pontválasztás menthető, megszakítható és visszavonható.
- Fordított Activity: a kijelölt játékos találgat, a saját csapat többi tagja együtt mutogat. A mutogatáshoz alkalmas lapokat használja; ezeken a lapokon a nyílt pontozás kikapcsol. Szerepcserekor külön felfedés védi a lapot a találgatók elől. A szerepátadás alatt az idő tovább telik.
- Káoszkör: kapcsolható, módhoz illő extra szabály minden lapnál, például legfeljebb öt szó, ülve mutogatás vagy rajzolás ügyetlenebb kézzel. A szabály visszavonáskor és újratöltéskor is megmarad.
- Kétlapos kihívás: két különböző, az aktuális módhoz illő lapot kell egy közös jelenetben vagy rajzban előadni. A teljes pár megfejtése 1 pont, passz 0; visszavonás és mentés mindkét lapot megőrzi. Legalább két megfelelő lap szükséges minden kijelölt módhoz.
- Külön nehézségszűrés: mind a 840 lap önálló könnyű/közepes/nehéz besorolást kapott, a pikánsságtól függetlenül. A témaszűréssel együtt működik.
- Saját pakli: 1–200 saját, soronként 2–8 szavas feladvány, választható módbesorolással és nehézséggel. Soronkénti felülírás: `Titkos randi | könnyű`. Helyi szerkesztőmentés, JSON-export/import és egyszerű szövegfájl-import. A folyamatban lévő játék és a visszavágó megőrzi az induláskori paklit.
- Körülírás, mutogatás és rajzolás; alapból minden megfejtés vagy passz után vált a kijelölt típusok között. A körönkénti váltás külön választható.
- Érintéses rajzvászon és a feladványt elrejtő csapatnézet.
- Megfejtésenként 1 pont, büntetés nélküli passz, utolsó lap visszavonása.
- Automatikus helyi mentés, szünet és visszavágó. Minden csapat ugyanannyi kört kap.
- Offline/PWA támogatás: az „Offline játékra kész” jelzés után a teljes játék internet nélkül újranyitható ezen az eszközön. A böngészőből kezdőképernyőre is telepíthető, ha azt a böngésző támogatja. A gyorsítótár kizárólag a játék saját alkönyvtárára vonatkozik. Új verzió a játék összes lapjának bezárása és újranyitása után lép életbe; futó játékot nem tölt újra.
- Nincs regisztráció, külső betűtípus, követőkód vagy szerveroldali adatkezelés.

Példák: „Eljegyzési hagymakarika”, „Csipkés alibi”, illetve a külön csomagban „Nemi vágy”, „Szexuális előjáték”, „Vízbázisú síkosító”. A mentett játékok megőrzik a korábbi paklijukat és váltási módjukat; az új paklit, témaszűrést és módhoz igazított lapválasztást új játék indításával kapjátok meg.

## Indítás

Nem igényel telepítést vagy buildet. A fájlokat HTTP-kiszolgálón keresztül nyisd meg; az ES-modulok miatt a `file://` megnyitás nem támogatott.

```sh
python3 -m http.server 4173
```

Ezután: http://localhost:4173

## GitHub Pages

A `jtdevzero/YSQ` repó a **main** ág gyökerét teszi közzé. A játék külön `activity18/` könyvtárból működik. Minden hivatkozás relatív, ezért más projektoldalra vagy alkönyvtárba is áthelyezhető.

Önálló repóban a **Settings → Pages** részén válaszd a **Deploy from a branch**, **main**, **/(root)** beállításokat. A `.nojekyll` fájl miatt a forrás változtatás nélkül kerül közzétételre.

## Ellenőrzés

Node.js 22 vagy újabb verzióval:

```sh
npm test
```

A tesztek a pontozást, a határidőt, a szünetet, a visszavonást, a mentett állást, az azonos körszámot, a döntetlent, a nyíltköri pontelosztást, az előadóváltást, a fordított lapok szerepeit, a kétlapos visszavonást és újrakeverést, a külön nehézségszűrést, a saját pakli beolvasását, valamint az offline gyorsítótár és frissítés működését ellenőrzik.

## Adatok

A böngésző `localStorage` tárában a csapat- és játékosnevek, a beállítások és a játékállás szerepel, beleértve a függőben lévő nyíltköri pontválasztást. A saját pakli szerkesztőjének szövege, módbesorolása és nehézsége külön helyi mentést kap. A lap szövege egyszerű szövegként jelenik meg, nem végrehajtható HTML-ként. Az „Új játék” véglegesítése törli a mentett játékállást; a saját paklit megőrzi. A saját pakli csak a kifejezett fájlexporttal kerül ki az eszközről. A böngésző webhelyadatainak törlése a játékot, a saját paklit és az offline gyorsítótárat is törli. Ha a helyi tárolás tiltva van, a játék mentés nélkül használható. A böngésző bezárása nem garantálja a folyamatban lévő kör megállítását: visszatéréskor az eredeti határidő számít. A Szünet gombbal állítsátok meg az órát.

A 18+ jelölés önbevallásos korhatárnyilatkozat, nem személyazonosításon alapuló ellenőrzés. A pikáns csomagok felnőttes humorúak és kétértelműek; a külön szex témájú pakli rövid kifejezéseket tartalmaz intimitásról, szexualitásról és védekezésről.
