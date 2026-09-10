# Tracker Mobile

Mobilní webová aplikace pro jednoduchou videoanalýzu pohybu ve výuce fyziky.

## Aktuální pracovní postup

1. Natočit nebo vybrat video.
2. Nastavit FPS a krok mezi analyzovanými snímky.
3. Kalibrovat měřítko dvěma body známé vzdálenosti.
4. Polohu tělesa označovat ručně nebo použít automatické sledování objektu.
5. Zobrazit polohu, rychlost, zrychlení, trajektorii a vektory přímo přes video.
6. Exportovat data do CSV.

## Ovládání na telefonu

- **Pinch dvěma prsty** přibližuje a oddaluje video (1× až 8×).
- **Pohyb obou prstů při pinch gestu** posouvá přiblížené video.
- Tlačítka **− / + / 1× / Celé** umožňují ovládat zoom i bez gesta.
- Oranžové body měřítka lze po označení znovu chytit a táhnout.
- Modré body trajektorie lze znovu chytit a opravit. Při výběru bodu aplikace skočí na jeho snímek.
- Zoom mění pouze zobrazení. Naměřené body jsou vždy uložené v souřadnicích původního videa, takže přiblížení nemění kalibraci ani výpočty.

## Automatické sledování

V části **Pohyb** je blok Automatické sledování:

1. Přesuň video na snímek, kde je sledovaný objekt dobře vidět.
2. Stiskni **Označit objekt**.
3. Tažením vytvoř rámeček těsně kolem objektu.
4. Stiskni **Sledovat**.
5. Aplikace postupuje po zvoleném kroku snímků, hledá nejpodobnější oblast poblíž předchozí polohy a automaticky ukládá střed objektu.

Sledování používá lokální obrazové porovnávání přímo v prohlížeči. Video se nikam neposílá a není potřeba externí služba ani CDN.

Aplikace zobrazuje **shodu** nalezeného obrazu s označeným vzorem. Výchozí minimální shoda je 52 % a lze ji upravit posuvníkem. Pokud shoda klesne pod nastavenou mez, sledování se zastaví místo toho, aby pokračovalo na pravděpodobně špatném objektu. V daném snímku lze objekt znovu označit a pokračovat.

Tracker při hledání používá předchozí polohu i poslední směr pohybu. Při dobré shodě se vzor objektu mírně průběžně aktualizuje, aby zvládl menší změny vzhledu.

První verze je nejvhodnější pro výrazné objekty, které se mezi snímky výrazně nemění: barevný míček, vozík, značka na tělese apod. Rychlé otáčení, velká změna velikosti, zakrytí nebo objekt velmi podobný pozadí mohou vyžadovat nové ruční označení.

## Grafy a výpočty

Aplikace počítá:

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

Směr šipky odpovídá složkám vektoru. Délka je úměrná velikosti veličiny. Aplikace automaticky volí grafické měřítko podle naměřených dat.

## Soubory

- `index.html` – struktura aplikace
- `styles.css` – responzivní mobilní vzhled a dotykové ovládání
- `app.js` – video, zoom/pan, kalibrace, ruční a automatický tracking, fyzikální výpočty, vektory a grafy
- `manifest.webmanifest` – PWA metadata
- `sw.js` – offline cache
- `icon.svg` – ikona aplikace

## Další plánované kroky

- lupa při přesném posouvání bodu,
- nastavitelný počátek a natočení souřadnic,
- vyhlazení dat před derivováním,
- odolnější automatický tracker pro rotaci, změnu velikosti a krátké zakrytí objektu,
- přednastavené školní pokusy (volný pád, šikmý vrh, pohyb po kružnici apod.).

Aplikace je navržená jako PWA a video se zpracovává lokálně v zařízení.
