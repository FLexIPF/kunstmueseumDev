# Gelato Template TODO (Poster / Framed / Canvas)

Diese Liste ist auf deine aktuellen Werke abgestimmt und deckt alle relevanten Seitenverhaeltnisse ab.

## Vorgehen pro Template
1. In Gelato neues Template anlegen.
2. Nur die in `recommended_sizes` genannten Groessen aktivieren.
3. Sample-Bild aus `samples/<template_name>/` hochladen und kurz pruefen.
4. Template-ID notieren.
5. Danach mit dem Script testen (`--live-template-preview --debug-variants`).

## Template-Liste

### poster_portrait_narrow
- Produkttyp: `poster`
- Ziel-Ratio: `0.58 - 0.68`
- Aktivieren: `Vertical: 28x43, 70x100`
- Beispielwerk: `Figuren in der Masse` (59x99)
- Upload-Datei: `samples/poster_portrait_narrow/03_Figuren_in_der_Masse.jpg.jpg`
- Hinweis: Spezialcluster fuer sehr schmale Hochformate (59x99, 75x115).

### poster_portrait_standard
- Produkttyp: `poster`
- Ziel-Ratio: `0.70 - 0.85`
- Aktivieren: `Vertical: 21x30, 30x40, 40x50, 50x70, 70x100, A3, A2`
- Beispielwerk: `amrunden Tisch` (40x50)
- Upload-Datei: `samples/poster_portrait_standard/amrundenTisch.jpg`
- Hinweis: Groesster Cluster, deckt den Hauptteil der Werke ab.

### poster_square
- Produkttyp: `poster`
- Ziel-Ratio: `0.95 - 1.05`
- Aktivieren: `Square: 25x25, 30x30, 35x35, 40x40, 45x45, 50x50, 70x70`
- Beispielwerk: `gefangen im Geist` (50x50)
- Upload-Datei: `samples/poster_square/gefangen im Geist.jpg`
- Hinweis: Nur fuer quadratische Werke.

### poster_landscape_standard
- Produkttyp: `poster`
- Ziel-Ratio: `1.20 - 1.45`
- Aktivieren: `Horizontal: 30x40, 40x50, 45x60, 50x70, 60x80, 70x100, 75x100, A3, A2`
- Beispielwerk: `Hedonistische Helden` (70x50)
- Upload-Datei: `samples/poster_landscape_standard/Hedonistische Helden.jpg`
- Hinweis: Standard-Querformat fuer viele Felix-Werke.

### poster_landscape_wide
- Produkttyp: `poster`
- Ziel-Ratio: `1.50 - 1.65`
- Aktivieren: `Horizontal: 28x43, 60x90, 30x45`
- Beispielwerk: `Zeit rieselt` (160x100)
- Upload-Datei: `samples/poster_landscape_wide/Zeit rieselt .jpg`
- Hinweis: Wichtig fuer sehr breite Werke (160x100, 115x75).

### framed_portrait_narrow
- Produkttyp: `framed`
- Ziel-Ratio: `0.58 - 0.68`
- Aktivieren: `Vertical: 28x43, 70x100`
- Beispielwerk: `Figuren in der Masse` (59x99)
- Upload-Datei: `samples/framed_portrait_narrow/03_Figuren_in_der_Masse.jpg.jpg`
- Hinweis: Spezialcluster fuer sehr schmale Hochformate (59x99, 75x115).

### framed_portrait_standard
- Produkttyp: `framed`
- Ziel-Ratio: `0.70 - 0.85`
- Aktivieren: `Vertical: 21x30, 30x40, 40x50, 50x70, 70x100, A3, A2`
- Beispielwerk: `amrunden Tisch` (40x50)
- Upload-Datei: `samples/framed_portrait_standard/amrundenTisch.jpg`
- Hinweis: Groesster Cluster, deckt den Hauptteil der Werke ab.

### framed_square
- Produkttyp: `framed`
- Ziel-Ratio: `0.95 - 1.05`
- Aktivieren: `Square: 25x25, 30x30, 35x35, 40x40, 45x45, 50x50, 70x70`
- Beispielwerk: `gefangen im Geist` (50x50)
- Upload-Datei: `samples/framed_square/gefangen im Geist.jpg`
- Hinweis: Nur fuer quadratische Werke.

### framed_landscape_standard
- Produkttyp: `framed`
- Ziel-Ratio: `1.20 - 1.45`
- Aktivieren: `Horizontal: 30x40, 40x50, 45x60, 50x70, 60x80, 70x100, 75x100, A3, A2`
- Beispielwerk: `Hedonistische Helden` (70x50)
- Upload-Datei: `samples/framed_landscape_standard/Hedonistische Helden.jpg`
- Hinweis: Standard-Querformat fuer viele Felix-Werke.

### framed_landscape_wide
- Produkttyp: `framed`
- Ziel-Ratio: `1.50 - 1.65`
- Aktivieren: `Horizontal: 28x43, 60x90, 30x45`
- Beispielwerk: `Zeit rieselt` (160x100)
- Upload-Datei: `samples/framed_landscape_wide/Zeit rieselt .jpg`
- Hinweis: Wichtig fuer sehr breite Werke (160x100, 115x75).

### canvas_portrait_narrow
- Produkttyp: `canvas`
- Ziel-Ratio: `0.58 - 0.68`
- Aktivieren: `Vertical: 20x30, 30x45, 60x90`
- Beispielwerk: `Figuren in der Masse` (59x99)
- Upload-Datei: `samples/canvas_portrait_narrow/03_Figuren_in_der_Masse.jpg.jpg`
- Hinweis: Spezialcluster fuer sehr schmale Hochformate (59x99, 75x115).

### canvas_portrait_standard
- Produkttyp: `canvas`
- Ziel-Ratio: `0.70 - 0.85`
- Aktivieren: `Vertical: 20x25, 30x40, 40x50, 45x60, 60x80, 60x75`
- Beispielwerk: `amrunden Tisch` (40x50)
- Upload-Datei: `samples/canvas_portrait_standard/amrundenTisch.jpg`
- Hinweis: Groesster Cluster, deckt den Hauptteil der Werke ab.

### canvas_square
- Produkttyp: `canvas`
- Ziel-Ratio: `0.95 - 1.05`
- Aktivieren: `Square: 20x20, 30x30, 50x50, 60x60`
- Beispielwerk: `gefangen im Geist` (50x50)
- Upload-Datei: `samples/canvas_square/gefangen im Geist.jpg`
- Hinweis: Nur fuer quadratische Werke.

### canvas_landscape_standard
- Produkttyp: `canvas`
- Ziel-Ratio: `1.20 - 1.45`
- Aktivieren: `Horizontal: 20x30, 30x40, 40x60, 45x60, 50x70, 60x80, 70x100`
- Beispielwerk: `Hedonistische Helden` (70x50)
- Upload-Datei: `samples/canvas_landscape_standard/Hedonistische Helden.jpg`
- Hinweis: Standard-Querformat fuer viele Felix-Werke.

### canvas_landscape_wide
- Produkttyp: `canvas`
- Ziel-Ratio: `1.50 - 1.65`
- Aktivieren: `Horizontal: 20x30, 30x45, 50x75, 60x90`
- Beispielwerk: `Zeit rieselt` (160x100)
- Upload-Datei: `samples/canvas_landscape_wide/Zeit rieselt .jpg`
- Hinweis: Wichtig fuer sehr breite Werke (160x100, 115x75).

## Dateien in diesem Ordner
- `template_matrix.csv` = tabellarische Uebersicht aller Templates
- `samples/` = sofort nutzbare Upload-Bilder pro Template