# Selezione Verme con Ray Casting

Per selezionare un verme con il mouse, si costruisce un raggio 3D a partire dalle coordinate del cursore sullo schermo e si testa la sua intersezione con la bounding sphere di ogni verme.

Il codice è in `src/core/utilities.js` (`buildRay`, `raySphereIntersect`) e in `src/main.js` (loop di picking).

---

## 1. Conversione da Pixel a NDC

Le coordinate del mouse $(x_m, y_m)$ in pixel vengono convertite nel sistema **NDC** (Normalized Device Coordinates) $[-1, 1]^2$:

$$x_{NDC} = \frac{x_m}{w_{canvas}} \cdot 2 - 1$$

$$y_{NDC} = -\!\left(\frac{y_m}{h_{canvas}} \cdot 2 - 1\right)$$

```javascript
// src/core/utilities.js — buildRay
const ndcX =  (mouseX / canvas.clientWidth)  * 2 - 1;
const ndcY = -(mouseY / canvas.clientHeight) * 2 + 1;
```

L'asse Y è invertito perché nel DOM le coordinate crescono verso il basso, mentre in NDC (e OpenGL) crescono verso l'alto.

---

## 2. Unprojection — da NDC a Spazio Mondo

La pipeline di rendering trasforma i punti mondo → clip space → NDC tramite la matrice $\mathbf{VP} = \mathbf{P} \cdot \mathbf{V}$. Per costruire il raggio è necessario fare l'operazione inversa. Dato un punto in coordinate omogenee NDC:

$$\mathbf{p}_{clip} = \begin{pmatrix} x_{NDC} \\ y_{NDC} \\ z_{NDC} \\ 1 \end{pmatrix}$$

la sua posizione nel spazio mondo si ottiene applicando la matrice inversa $\mathbf{VP}^{-1}$ e dividendo per la componente $w$ (divisione prospettica inversa):

$$\tilde{\mathbf{p}}_{world} = \mathbf{VP}^{-1} \cdot \mathbf{p}_{clip} = \begin{pmatrix} \tilde{x} \\ \tilde{y} \\ \tilde{z} \\ \tilde{w} \end{pmatrix} \qquad \Rightarrow \qquad \mathbf{p}_{world} = \begin{pmatrix} \tilde{x}/\tilde{w} \\ \tilde{y}/\tilde{w} \\ \tilde{z}/\tilde{w} \end{pmatrix}$$

```javascript
// src/core/utilities.js — buildRay (funzione interna unproject)
function unproject(z) {
    const v = [ndcX, ndcY, z, 1.0];
    const x = M[0]*v[0] + M[4]*v[1] + M[8] *v[2] + M[12]*v[3];
    const y = M[1]*v[0] + M[5]*v[1] + M[9] *v[2] + M[13]*v[3];
    const z2= M[2]*v[0] + M[6]*v[1] + M[10]*v[2] + M[14]*v[3];
    const w = M[3]*v[0] + M[7]*v[1] + M[11]*v[2] + M[15]*v[3];
    return [x/w, y/w, z2/w];
}
```

La moltiplicazione è eseguita in forma espansa rispettando il layout **column-major** di WebGL: l'elemento $M[i + 4j]$ è la riga $i$, colonna $j$ della matrice (accesso per colonne consecutive). La divisione per $w$ inverte la divisione prospettica che la GPU aveva applicato durante la proiezione.

---

## 3. Costruzione del Raggio

Il raggio è definito da due punti: uno sul piano vicino del frustum ($z_{NDC} = -1$) e uno sul piano lontano ($z_{NDC} = +1$):

$$\mathbf{o} = \text{unproject}(-1) \qquad \mathbf{f} = \text{unproject}(+1)$$

```javascript
// src/core/utilities.js — buildRay
const near = unproject(-1);
const far  = unproject( 1);

const dx = far[0]-near[0];
const dy = far[1]-near[1];
const dz = far[2]-near[2];
const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
return { origin: near, dir: [dx/len, dy/len, dz/len] };
```

Il raggio è quindi $\mathbf{r}(t) = \mathbf{o} + t \cdot \hat{\mathbf{d}}$ con $t \geq 0$ e $\hat{\mathbf{d}}$ normalizzato.

---

## 4. Test di Intersezione Raggio-Sfera

Per ogni verme si definisce una bounding sphere con centro $\mathbf{c}$ e raggio $R = 1.2$. Il centro è spostato verso l'alto rispetto alla posizione del verme per coprire meglio il corpo:

```javascript
// src/main.js — render (loop di picking)
const center = [worm.position[0], worm.position[1] + 1.0, worm.position[2]];
if (raySphereIntersect(ray, center, 1.2)) { ... }
```

### Equazione

Sostituendo $\mathbf{r}(t) = \mathbf{o} + t\hat{\mathbf{d}}$ nell'equazione della sfera $|\mathbf{r}(t) - \mathbf{c}|^2 = R^2$, con $\mathbf{oc} = \mathbf{o} - \mathbf{c}$:

$$|\mathbf{oc} + t\hat{\mathbf{d}}|^2 = R^2$$

$$t^2 \underbrace{|\hat{\mathbf{d}}|^2}_{=1} + 2t(\hat{\mathbf{d}} \cdot \mathbf{oc}) + |\mathbf{oc}|^2 - R^2 = 0$$

Equazione di secondo grado con $b = \hat{\mathbf{d}} \cdot \mathbf{oc}$ e $c = |\mathbf{oc}|^2 - R^2$:

$$\Delta = b^2 - c$$

- $\Delta < 0$: nessuna intersezione (raggio passa fuori dalla sfera)
- $\Delta \geq 0$: il raggio colpisce la sfera

```javascript
// src/core/utilities.js — raySphereIntersect
function raySphereIntersect(ray, center, radius) {
    const ox = ray.origin[0] - center[0];
    const oy = ray.origin[1] - center[1];
    const oz = ray.origin[2] - center[2];
    const b = ox*ray.dir[0] + oy*ray.dir[1] + oz*ray.dir[2];
    const c = ox*ox + oy*oy + oz*oz - radius*radius;
    return (b*b - c) >= 0;
}
```

Per il picking basta verificare il segno del discriminante — non serve calcolare i valori di $t$ né i punti di intersezione effettivi.

---

## 5. Selezione del Verme più Vicino

Tra tutti i vermi che intersecano il raggio, viene scelto quello più vicino alla camera confrontando le distanze quadrate (evita una radice quadrata per verme):

```javascript
// src/main.js — render
let minDist = Infinity;
for (const worm of worms) {
    const center = [worm.position[0], worm.position[1] + 1.0, worm.position[2]];
    if (raySphereIntersect(ray, center, 1.2)) {
        const dx = worm.position[0] - eye[0];
        const dz = worm.position[2] - eye[2];
        const dist = dx*dx + dz*dz;   // distanza quadrata nel piano XZ
        if (dist < minDist) { minDist = dist; hoveredWorm = worm; }
    }
}
canvas.style.cursor = hoveredWorm ? 'pointer' : 'default';
```

Il confronto avviene solo nel piano XZ perché tutti i vermi si trovano alla stessa altezza (Y≈0) e la profondità verticale non è discriminante.

---

## 6. Click per Selezione

Il click sul canvas seleziona il verme attualmente in hover:

```javascript
// src/main.js
canvas.addEventListener('click', () => {
    selectedWorm = hoveredWorm;
    rebuildSelectionGui();
});
```

`hoveredWorm` è aggiornato ogni frame nel loop di rendering. Il click lo congela in `selectedWorm`, aprendo il pannello laterale con l'attività neurale in tempo reale.

---

## Note sulla Matrice Inversa

La matrice $\mathbf{VP}^{-1}$ è calcolata ogni frame con `m4.inverse(viewProjectionMatrix)`:

```javascript
// src/main.js — render
const inverseVP = m4.inverse(viewProjectionMatrix);
const ray = buildRay(mouse.x, mouse.y, canvas, inverseVP);
```

Viene ricalcolata ogni frame perché la camera può muoversi. Se la camera fosse statica si potrebbe cacherarla, ma il costo è trascurabile rispetto al rendering.
