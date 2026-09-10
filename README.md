# Tracker Mobile

Mobilní webová aplikace pro jednoduchou videoanalýzu pohybu ve výuce fyziky.

## Aktuální MVP

Aplikace nyní umí:

- natočit nebo vybrat video v telefonu,
- přehrávat video a krokovat po jednotlivých snímcích,
- ručně zadat FPS videa,
- nastavit, zda se má při trackování postupovat po 1., 2., 5. nebo 10. snímku,
- kalibrovat měřítko označením dvou bodů známé vzdálenosti,
- ručně označovat polohu sledovaného tělesa,
- po každém označení automaticky přejít na další zvolený snímek,
- vrátit poslední bod nebo vymazat celé měření,
- zobrazit stopu pohybu přímo přes video,
- zobrazit grafy `x(t)`, `y(t)` a `y(x)`,
- spočítat jednoduchý lineární fit pro časové grafy,
- zobrazit dobu měření, posunutí a průměrnou rychlost po dráze,
- exportovat naměřená data do CSV,
- fungovat jako PWA s offline cache aplikačního rozhraní.

Všechno zpracování videa probíhá lokálně v prohlížeči. Video se nikam neodesílá.

## Ovládání

1. Vyber nebo natoč krátké video.
2. Nastav FPS.
3. V kroku **Měřítko** klepni na dva body se známou skutečnou vzdáleností.
4. V kroku **Pohyb** klepej na sledovaný objekt. Po každém bodu aplikace automaticky přeskočí dál.
5. V kroku **Grafy** přepínej mezi `x(t)`, `y(t)` a trajektorií `y(x)`.

## Další plán

- přesnější lupa při označování bodu prstem,
- volitelný počátek a natočení souřadné soustavy,
- výpočet `v_x`, `v_y`, `v`, `a_x`, `a_y`, `a`,
- parabolický a sinusový fit,
- automatické sledování objektu s ruční opravou,
- více současně sledovaných těles,
- přednastavené školní pokusy (volný pád, vrh, kmitání, kruhový pohyb, srážky),
- sdílená zadání přes odkaz/QR,
- export výsledků do školního protokolu.

## Soubory

- `index.html` – struktura aplikace,
- `styles.css` – mobilní rozhraní,
- `app.js` – video, kalibrace, trackování, fyzikální přepočet a grafy,
- `manifest.webmanifest` – PWA metadata,
- `sw.js` – offline cache aplikačního shellu.
