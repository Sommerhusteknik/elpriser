Mit første test projekt hos <a href="sommerhusteknik.dk">sommerhusteknik.dk</a>

Dashboardet viser elpriser for hele i dag og hele i morgen, når næste døgn er
offentliggjort hos elprisenligenu.dk (normalt ca. kl. 13). Der hentes automatisk
nye priser hvert femte minut. Datoer, klokkeslæt og tariffer følger dansk tid,
og grafen understøtter både time- og kvarterspriser samt sommer-/vintertid.

Den svage, stiplede linje gennem hele grafen markerer **dagens laveste totalpris**
inkl. moms og de viste tariffer. Nøgletallene for billigste, dyreste og gennemsnit
gælder kun i dag, også når morgendagens priser vises. Afviklede timer dæmpes i
grafen, mens den aktuelle time fortsat fremhæves.

Siden, kortene og selve grafen har gennemsigtig baggrund og kan indlejres som
webside/iframe over et baggrundsfoto i DAKboard. Vælg også gennemsigtig baggrund
for DAKboard-blokken; tekstfarverne egner sig bedst til et lyst foto.

Hvis morgendagens priser endnu ikke er udgivet, vises kun i dag. Andre hentefejl
vises i statusfeltet; ved fejl på dagens priser beholdes senest hentede graf.
Der vises aldrig opdigtede eksempelpriser.

Kør regressionstests med `node --test tests/dashboard.test.cjs` (kræver Node.js).
