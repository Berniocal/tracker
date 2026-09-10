# Tracker Mobile

Mobilní webová aplikace pro jednoduchou videoanalýzu pohybu ve výuce fyziky.

## Aktuální pracovní postup

1. Natočit nebo vybrat video.
2. Nastavit FPS, krok mezi analyzovanými snímky a případně jen vybraný časový úsek.
3. Kalibrovat měřítko dvěma body známé vzdálenosti.
4. Polohu tělesa označovat ručně nebo použít automatické sledování objektu.
5. Volitelně nastavit vlastní počátek a natočení souřadnicové soustavy.
6. Projít naměřené body jeden po druhém a ručně opravit chybně nalezené body.
7. Zobrazit polohu, rychlost, zrychlení, trajektorii a vektory přímo přes video.
8. Exportovat data do CSV.

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

První verze je nejvhodnější pro výrazné objekty, které se mezi snímky výrazně nemění: barevný míček, vozík, značka na tělese apod. Rychlé otáčení, velká změna velikosti, zakrytí nebo rozmazání mohou vyžadovat ruční opravu.

## Kontrola bod po bodu

V části **Pohyb** je blok **Kontrola bod po bodu**.

- Tlačítky **Předchozí** a **Další** lze postupně procházet všechny body ve zvoleném měřeném úseku.
- Aplikace vždy skočí přesně na snímek daného bodu.
- Bod vytvořený automatikou lze normálně prstem chytit a přesunout.
- Ručně opravený automatický bod je označen jako **ručně opravený**.
- U vybraného bodu se zobrazí `x`, `y`, `vx`, `vy` a velikost rychlosti `|v|`.

To umožňuje opravit jednotlivé snímky, ve kterých je rychlý nebo rozmazaný objekt automatickým trackerem určen nepřesně.

## Souřadnicová soustava

V části **Pohyb** lze zapnout vlastní souřadnicovou soustavu.

- Výchozí režim zůstává stejný jako dosud: počátek je v prvním naměřeném bodě, osa `x` míří doprava a osa `y` nahoru.
- Tlačítkem **Nastavit osy** se zobrazí počátek `O`, osa `x` a kolmá osa `y`.
- Počátek lze táhnout; spolu s ním se přesune celá soustava bez změny natočení.
- Koncový bod osy `x` lze táhnout a tím soustavu otáčet. Osa `y` zůstává vždy kolmá.
- Po změně os se okamžitě přepočítají `x`, `y`, složky rychlosti a zrychlení, grafy i CSV data.
- Vektory rychlosti a zrychlení se ve videu dál kreslí ve skutečném směru pohybu, i když jsou jejich složky počítané v natočených osách.

To je praktické například pro pohyb na nakloněné rovině: osu `x` lze natočit podél roviny.

## Rychlost se znaménkem

Aplikace rozlišuje mezi velikostí rychlosti a jejími složkami:

- `|v| = sqrt(vx² + vy²)` je velikost rychlosti a je vždy nezáporná,
- `vx` a `vy` mohou být kladné i záporné podle směru pohybu vzhledem ke zvoleným osám.

Pokud se těleso pohybuje proti kladnému směru osy `x`, zobrazí se například `vx = -1,2 m/s`. V souhrnu pohybu se proto kromě dráhy/času zobrazuje také průměrná `vx` a `vy` se znaménkem.

## Grafy a výpočty

Aplikace počítá:

- `x(t)`, `y(t)`
- `vx(t)`, `vy(t)`
- velikost rychlosti `|v|(t) = sqrt(vx² + vy²)`
- `ax(t)`, `ay(t)`
- velikost zrychlení `|a|(t) = sqrt(ax² + ay²)`
- trajektorii `y(x)`

Rychlosti se určují z časových diferencí polohy; ve vnitřních bodech se používá centrální diference. Zrychlení se stejným způsobem počítá z rychlosti. Pro smysluplné zrychlení jsou potřeba alespoň tři body.

CSV export obsahuje čas, polohu, složky rychlosti, velikost rychlosti, složky zrychlení a velikost zrychlení.

## Vektory přes video

V části Pohyb lze zapnout:

- zelený vektor rychlosti `v⃗`,
- červený vektor zrychlení `a⃗`,
- zobrazení pouze u aktuálního bodu nebo u všech naměřených bodů,
- ruční zvětšení či zmenšení délky šipek.

Směr šipky odpovídá skutečnému směru v obraze. Délka je úměrná velikosti veličiny. Aplikace automaticky volí grafické měřítko podle naměřených dat.

## Soubory

- `index.html` – struktura aplikace
- `styles.css` – responzivní mobilní vzhled a dotykové ovládání
- `app.js` – video, zoom/pan, kalibrace, ruční a automatický tracking, fyzikální výpočty, vektory a grafy
- `coordinates.js` – vlastní počátek, natočení os a transformace dat do zvolené soustavy
- `segment.js` – výběr měřeného úseku, rozpoznání začátku pohybu a souhrn pohybu
- `point-review.js` – procházení bodů, ruční opravy automatických bodů a rychlost se znaménkem
- `manifest.webmanifest` – PWA metadata
- `sw.js` – offline cache
- `icon.svg` – ikona aplikace

## Další plánované kroky

- lupa při přesném posouvání bodu,
- vyhlazení dat před derivováním,
- odolnější automatický tracker pro rotaci, změnu velikosti a krátké zakrytí objektu,
- přednastavené školní pokusy (volný pád, šikmý vrh, pohyb po kružnici apod.).

Aplikace je navržená jako PWA a video se zpracovává lokálně v zařízení.
