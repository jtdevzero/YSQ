# Éjfél után · Activity 18+

Magyar nyelvű, Activity-jellegű, egy közös eszközön játszható partijáték felnőtteknek.

Játszható változat: https://jtdevzero.github.io/YSQ/activity18/

- 180 egyedi feladvány, három erősségi szint; a magasabb szintek a lazább lapokat is tartalmazzák.
- 2–6 csapat, 30/60/90 másodperces időkeret, csapatonként 3/5/8 kör.
- Körülírás, mutogatás és rajzolás; kapcsolható feladattípusok.
- Érintéses rajzvászon és a feladványt elrejtő csapatnézet.
- Megfejtésenként 1 pont, büntetés nélküli passz, utolsó lap visszavonása.
- Automatikus helyi mentés, szünet és visszavágó. Minden csapat ugyanannyi kört kap.
- Nincs regisztráció, külső betűtípus, követőkód vagy szerveroldali adatkezelés.

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

A tesztek a pontozást, a határidőt, a szünetet, a visszavonást, a mentett állást, az azonos körszámot és a döntetlent ellenőrzik.

## Adatok

A böngésző `localStorage` tárában csak a csapatnevek, a beállítások és a játékállás szerepel. Az „Új játék” véglegesítése törli a mentett állást. Ha a helyi tárolás tiltva van, a játék mentés nélkül használható. A böngésző bezárása nem garantálja a folyamatban lévő kör megállítását: visszatéréskor az eredeti határidő számít. A Szünet gombbal állítsátok meg az órát.

A 18+ jelölés önbevallásos korhatárnyilatkozat, nem személyazonosításon alapuló ellenőrzés. A feladványok felnőttes humorúak és kétértelműek, részletező szexuális leírások nélkül.
