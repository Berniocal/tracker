# Tracker Mobile

Mobilní webová aplikace pro jednoduchou videoanalýzu pohybu ve výuce fyziky.

## Aktuální pracovní postup

1. Natočit nebo vybrat video.
2. Nastavit FPS a krok mezi analyzovanými snímky.
3. Kalibrovat měřítko dvěma body známé vzdálenosti.
4. Ručně označovat polohu sledovaného tělesa v jednotlivých snímcích.
5. Zobrazit polohu, rychlost, zrychlení, trajektorii a vektory přímo přes video.
6. Exportovat data do CSV.

## Ovládání na telefonu

- **Pinch dvěma prsty** přibližuje a oddaluje video (1× až 8×).
- **Pohyb obou prstů při pinch gestu** posouvá přiblížené video.
- Tlačítka **− / + / 1× / Celé** umožňují ovládat zoom i bez gesta.
- Oranžové body měřítka lze po označení znovu chytit a táhnout.
- Modré body trajektorie lze znovu chytit a opravit. Při výběru bodu aplikace skočí na jeho snímek.
- Zoom mění pouze zobrazení. Naměřené body jsou vždy uložené v souřadnicích původního videa, takže přiblížení nemění kalibraci ani výpočty.

## Grafy a výpočty

Aplikace nyní počítá:

- `x(t)`, `y(t)`
- `vx(t)`, `vy(t)`
- celkovou rychlost `v(t) = sqrt(vx² + vy²)`
- `ax(t)`, `ay(t)`
- celkové zrychlení `a(t) = sqrt(ax² + ay²)`
- trajektorii `y(x)`

Rychlosti se určují z časových diferencí polohy; ve vnitřních bodech se používá centrální diference. Zrychlení se stejným způsobem počítá z rychlosti. Pro smysluplné zrychlení jsou potřeba alespoň tři body.

CSV export obsahuje čas, polohu, složky rychlosti, velikost rychlosti, složky zrychlení a velikost zrychlení.

## Vektory přes video

V části Pohyb lze zapnout:

- zelený vektor rychlosti `v⃗`,
- červený vektor zrychlení `a⃗`,
- zobrazení pouze u aktuálního bodu nebo u všech naměřených bodů,
- ruční zvětšení či zmenšení délky šipek.

Směr šipky odpovídá složkám vektoru. Délka je úměrná velikosti veličiny. Aplikace automaticky volí grafické měřítko podle naměřených dat a zobrazuje použitý přepočet v pixelech.

## Soubory

- `index.html` – struktura aplikace
- `styles.css` – responzivní mobilní vzhled a dotykové ovládání
- `app.js` – video, zoom/pan, kalibrace, tracking, fyzikální výpočty, vektory a grafy
- `manifest.webmanifest` – PWA metadata
- `sw.js` – offline cache
- `icon.svg` – ikona aplikace

## Další plánované kroky

- lupa při přesném posouvání bodu,
- nastavitelný počátek a natočení souřadnic,
- vyhlazení dat před derivováním,
- automatické sledování označeného objektu s možností ruční opravy,
- přednastavené školní pokusy (volný pád, šikmý vrh, pohyb po kružnici apod.).

Aplikace je navržená jako PWA a video se zpracovává lokálně v zařízení.
