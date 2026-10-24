# MaEste — filmek és sorozatok egyedül vagy ketten

**[Alkalmazás megnyitása](https://jtdevzero.github.io/YSQ/maeste/)**

Nyisd meg a linket, és add meg a tulajdonostól kapott közös alkalmazásjelszót. ChatGPT- vagy GitHub-fiók nem szükséges. A webapp közvetlenül a GitHub Pages címén fut.

Választhatsz filmeket vagy sorozatokat, streaming szolgáltatókat vagy a Bármelyik lehetőséget. Egyedül listát készíthetsz; páros módban a meghívólinkkel csatlakozhattok ugyanahhoz a szobához. A másik résztvevőnek is szüksége van az alkalmazásjelszóra.

Balra: kihagyás és égés; lefelé: már láttam és könyvtár; jobbra: jöhet és zöld kapu. A Kilépés gomb lezárja az adott böngészőlap hozzáférését. A listák megmaradnak az eszközön. A hozzáférés legfeljebb 12 óráig él, utána új belépés szükséges.

A filmadatokat a szerver a TMDB-től kéri. A jelszóellenőrzés és a TMDB-hitelesítés szerveroldalon történik. A nyilvános böngészős fájlok nem tartalmaznak szerveres titkokat. A közös jelszó belépési védelem; a helyi listákat és a letöltött JSON-mentéseket nem titkosítja.

## Titkosított forrásmentés

A `maeste-source-encrypted.7z` külön jelszóval titkosított forrásmentés. A forrásmentés jelszava és az alkalmazás belépési jelszava különböző. A jelszavakat külön, privát csatornán adja át a tulajdonos; egyik sem szerepel ebben a repóban. A mellékelt `.sha256` fájl a letöltés sértetlenségét ellenőrzi.

A repó eredeti, gyökérkönyvtárban található projektje változatlanul megmarad.
