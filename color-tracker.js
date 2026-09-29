(() => {
  // Tracker pro téměř jednobarevné objekty.
  // Označování rámečkem zůstává stejné. Z prvního rámečku se naučí barva
  // objektu a v dalších snímcích se hledá souvislá oblast této barvy.
  // Měřicí bod je vždy střed nalezených hranic oblasti, nikoli místo nejlepší
  // pixelové shody. To výrazně omezuje poskakování bodu po rozmazaném objektu.

  const fallbackFindBestMatch = findBestMatch;

  function pixelFeatures(r, g, b) {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const total = Math.max(0.04, rr + gg + bb);
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    return {
      cr: rr / total,
      cg: gg / total,
      cb: bb / total,
      sat: max > 1e-6 ? (max - min) / max : 0,
      value: max,
      luma: 0.2126 * rr + 0.7152 * gg + 0.0722 * bb
    };
  }

  function centerWeight(x, y, width, height) {
    const nx = Math.abs((x + 0.5) / Math.max(1, width) - 0.5) * 2;
    const ny = Math.abs((y + 0.5) / Math.max(1, height) - 0.5) * 2;
    const edge = clamp(Math.max(nx, ny), 0, 1);
    const center = 1 - edge;
    return 0.18 + 1.82 * center * center;
  }

  function edgeWeight(x, y, width, height) {
    const nx = Math.abs((x + 0.5) / Math.max(1, width) - 0.5) * 2;
    const ny = Math.abs((y + 0.5) / Math.max(1, height) - 0.5) * 2;
    const edge = clamp(Math.max(nx, ny), 0, 1);
    return edge < 0.68 ? 0 : Math.pow((edge - 0.68) / 0.32, 2);
  }

  function makePrototype(template, weightFunction, preferColor = false) {
    let cr = 0, cg = 0, cb = 0, sat = 0, value = 0, luma = 0, sum = 0;
    const step = clamp(Math.floor(Math.min(template.w, template.h) / 28), 1, 3);

    for (let y = 0; y < template.h; y += step) {
      let index = (y * template.w) * 3;
      for (let x = 0; x < template.w; x += step) {
        const f = pixelFeatures(template.data[index], template.data[index + 1], template.data[index + 2]);
        let weight = weightFunction(x, y, template.w, template.h);
        if (preferColor) weight *= 0.35 + 1.65 * f.sat;
        if (weight > 0) {
          cr += f.cr * weight;
          cg += f.cg * weight;
          cb += f.cb * weight;
          sat += f.sat * weight;
          value += f.value * weight;
          luma += f.luma * weight;
          sum += weight;
        }
        index += step * 3;
      }
    }

    if (!(sum > 0)) return null;
    return {
      cr: cr / sum,
      cg: cg / sum,
      cb: cb / sum,
      sat: sat / sum,
      value: value / sum,
      luma: luma / sum
    };
  }

  function prototypeDistance(a, b) {
    if (!a || !b) return 0;
    const chroma = Math.hypot(a.cr - b.cr, a.cg - b.cg, a.cb - b.cb) / 0.55;
    const sat = Math.abs(a.sat - b.sat);
    const luma = Math.abs(a.luma - b.luma);
    if (a.sat > 0.15) return chroma * 0.72 + sat * 0.20 + luma * 0.08;
    return chroma * 0.30 + sat * 0.12 + luma * 0.58;
  }

  function similarityToPrototype(feature, prototype) {
    if (!prototype) return 0;
    const chroma = Math.hypot(
      feature.cr - prototype.cr,
      feature.cg - prototype.cg,
      feature.cb - prototype.cb
    ) / 0.55;
    const sat = Math.abs(feature.sat - prototype.sat);
    const luma = Math.abs(feature.luma - prototype.luma);

    const distance = prototype.sat > 0.15
      ? chroma * 0.72 + sat * 0.20 + luma * 0.08
      : chroma * 0.30 + sat * 0.12 + luma * 0.58;

    const tolerance = prototype.sat > 0.15 ? 0.43 : 0.34;
    const ratio = distance / tolerance;
    return Math.exp(-(ratio * ratio));
  }

  function learnColorModel(template) {
    if (template.__monoColorModel) return template.__monoColorModel;

    const object = makePrototype(template, centerWeight, true);
    const background = makePrototype(template, edgeWeight, false);
    const contrast = prototypeDistance(object, background);
    const model = {
      object,
      background,
      contrast,
      useBackground: !!background && contrast > 0.16,
      threshold: contrast > 0.30 ? 0.22 : contrast > 0.18 ? 0.27 : 0.34,
      referencePixels: 0
    };

    // Odhad počtu pixelů objektu v prvním rámečku. Pomáhá odmítnout malé
    // barevné fleky a naopak příliš velké plochy stejné barvy.
    for (let y = 0; y < template.h; y += 1) {
      let index = (y * template.w) * 3;
      for (let x = 0; x < template.w; x += 1) {
        const f = pixelFeatures(template.data[index], template.data[index + 1], template.data[index + 2]);
        const objectSim = similarityToPrototype(f, object);
        const backgroundSim = model.useBackground ? similarityToPrototype(f, background) : 0;
        const separation = model.useBackground
          ? clamp((objectSim - backgroundSim + 0.35) / 0.70, 0, 1)
          : 1;
        const sim = objectSim * (0.45 + 0.55 * separation);
        if (sim >= model.threshold) model.referencePixels += 1;
        index += 3;
      }
    }

    const area = template.w * template.h;
    model.referencePixels = clamp(
      model.referencePixels || Math.round(area * 0.45),
      Math.max(6, Math.round(area * 0.06)),
      area
    );

    template.__monoColorModel = model;
    return model;
  }

  function framePixelSimilarity(frame, x, y, model) {
    const index = (y * frame.width + x) * 4;
    const f = pixelFeatures(frame.data[index], frame.data[index + 1], frame.data[index + 2]);
    const objectSim = similarityToPrototype(f, model.object);
    if (!model.useBackground) return objectSim;

    const backgroundSim = similarityToPrototype(f, model.background);
    // Rozmazané okraje jsou směsí objektu a pozadí, proto je neodřízneme
    // natvrdo. Jen snížíme jejich váhu. Střed barevné plochy zůstane stabilní.
    const separation = clamp((objectSim - backgroundSim + 0.35) / 0.70, 0, 1);
    return objectSim * (0.40 + 0.60 * separation);
  }

  // Barevnější skóre ponecháváme i pro záložní šablonový tracker.
  scorePatch = function scorePatchColorWeighted(frame, template, x, y) {
    const tw = template.w;
    const th = template.h;
    if (x < 0 || y < 0 || x + tw > frame.width || y + th > frame.height) return Infinity;

    const model = learnColorModel(template);
    const sample = clamp(Math.floor(Math.min(tw, th) / 16), 1, 5);
    let sum = 0;
    let weightSum = 0;

    for (let yy = 0; yy < th; yy += sample) {
      for (let xx = 0; xx < tw; xx += sample) {
        const sim = framePixelSimilarity(frame, x + xx, y + yy, model);
        const weight = centerWeight(xx, yy, tw, th);
        sum += (1 - sim) * 72 * weight;
        weightSum += weight;
      }
    }

    return weightSum > 0 ? sum / weightSum : Infinity;
  };

  function weightedQuantile(histogram, fraction) {
    let total = 0;
    for (let i = 0; i < histogram.length; i += 1) total += histogram[i];
    if (!(total > 0)) return 0;
    const target = total * fraction;
    let sum = 0;
    for (let i = 0; i < histogram.length; i += 1) {
      sum += histogram[i];
      if (sum >= target) return i;
    }
    return histogram.length - 1;
  }

  function findColorArea(frame, template, model) {
    if (!state.auto.box) return null;

    const previous = boxToAnalysis(state.auto.box, frame.scale, frame.width, frame.height);
    const predictedCenterX = previous.x + previous.w / 2 + state.auto.lastShiftX * frame.scale;
    const predictedCenterY = previous.y + previous.h / 2 + state.auto.lastShiftY * frame.scale;
    const motion = Math.hypot(state.auto.lastShiftX, state.auto.lastShiftY) * frame.scale;

    const baseW = Math.max(previous.w, template.w);
    const baseH = Math.max(previous.h, template.h);
    const radiusX = Math.round(clamp(
      Math.max(28, baseW * 2.6, motion * 3.4 + baseW),
      28,
      Math.max(28, frame.width * 0.42)
    ));
    const radiusY = Math.round(clamp(
      Math.max(28, baseH * 2.6, motion * 3.4 + baseH),
      28,
      Math.max(28, frame.height * 0.42)
    ));

    const minX = Math.max(0, Math.floor(predictedCenterX - radiusX));
    const maxX = Math.min(frame.width - 1, Math.ceil(predictedCenterX + radiusX));
    const minY = Math.max(0, Math.floor(predictedCenterY - radiusY));
    const maxY = Math.min(frame.height - 1, Math.ceil(predictedCenterY + radiusY));
    if (maxX <= minX || maxY <= minY) return null;

    const roiArea = (maxX - minX + 1) * (maxY - minY + 1);
    const step = roiArea > 72000 ? 2 : 1;
    const gridW = Math.floor((maxX - minX) / step) + 1;
    const gridH = Math.floor((maxY - minY) / step) + 1;
    const gridSize = gridW * gridH;
    const similarities = new Float32Array(gridSize);
    const mask = new Uint8Array(gridSize);
    const labels = new Int32Array(gridSize);

    let cursor = 0;
    for (let gy = 0; gy < gridH; gy += 1) {
      const y = Math.min(maxY, minY + gy * step);
      for (let gx = 0; gx < gridW; gx += 1) {
        const x = Math.min(maxX, minX + gx * step);
        const sim = framePixelSimilarity(frame, x, y, model);
        similarities[cursor] = sim;
        if (sim >= model.threshold) mask[cursor] = 1;
        cursor += 1;
      }
    }

    const expectedCount = Math.max(3, model.referencePixels / (step * step));
    const minComponent = Math.max(3, Math.floor(expectedCount * 0.055));
    const queue = new Int32Array(gridSize);
    let componentId = 0;
    let best = null;

    for (let start = 0; start < gridSize; start += 1) {
      if (!mask[start] || labels[start]) continue;
      componentId += 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      labels[start] = componentId;

      let count = 0;
      let mass = 0;
      let weightedX = 0;
      let weightedY = 0;

      while (head < tail) {
        const index = queue[head++];
        const gy = Math.floor(index / gridW);
        const gx = index - gy * gridW;
        const x = minX + gx * step;
        const y = minY + gy * step;
        const sim = similarities[index];

        count += 1;
        mass += sim;
        weightedX += x * sim;
        weightedY += y * sim;

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = gy + dy;
          if (ny < 0 || ny >= gridH) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = gx + dx;
            if (nx < 0 || nx >= gridW) continue;
            const ni = ny * gridW + nx;
            if (!mask[ni] || labels[ni]) continue;
            labels[ni] = componentId;
            queue[tail++] = ni;
          }
        }
      }

      if (count < minComponent || !(mass > 0)) continue;

      const cx = weightedX / mass;
      const cy = weightedY / mass;
      const distance = Math.hypot(cx - predictedCenterX, cy - predictedCenterY);
      const spatialScale = Math.max(18, Math.max(baseW, baseH) * 1.8 + motion * 0.8);
      const proximity = Math.exp(-0.5 * Math.pow(distance / spatialScale, 2));
      const sizeRatio = (count + 1) / (expectedCount + 1);
      const sizeScore = Math.exp(-Math.abs(Math.log(sizeRatio)) * 0.68);
      const score = mass * (0.28 + 0.72 * proximity) * (0.38 + 0.62 * sizeScore);

      if (!best || score > best.score) {
        best = { id: componentId, count, mass, proximity, sizeScore, score };
      }
    }

    if (!best) return null;

    // Hranice určujeme z 4.–96. percentilu barevné hmoty. Jednotlivé
    // náhodné pixely tak nemohou posunout střed objektu o několik pixelů.
    const xHistogram = new Float64Array(gridW);
    const yHistogram = new Float64Array(gridH);
    for (let index = 0; index < gridSize; index += 1) {
      if (labels[index] !== best.id) continue;
      const gy = Math.floor(index / gridW);
      const gx = index - gy * gridW;
      const weight = similarities[index];
      xHistogram[gx] += weight;
      yHistogram[gy] += weight;
    }

    let xLo = weightedQuantile(xHistogram, 0.04);
    let xHi = weightedQuantile(xHistogram, 0.96);
    let yLo = weightedQuantile(yHistogram, 0.04);
    let yHi = weightedQuantile(yHistogram, 0.96);
    xLo = Math.max(0, xLo - 1);
    yLo = Math.max(0, yLo - 1);
    xHi = Math.min(gridW - 1, xHi + 1);
    yHi = Math.min(gridH - 1, yHi + 1);

    const left = minX + xLo * step;
    const right = Math.min(frame.width, minX + (xHi + 1) * step);
    const top = minY + yLo * step;
    const bottom = Math.min(frame.height, minY + (yHi + 1) * step);

    // Přesně podle hranic: měřený bod bude geometrický střed detekované
    // barevné oblasti. Nezávisí tedy na tom, která část míčku má nejlepší shodu.
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const detectedW = Math.max(4, right - left);
    const detectedH = Math.max(4, bottom - top);
    const minW = Math.max(4, template.w * 0.42);
    const minH = Math.max(4, template.h * 0.42);
    const maxW = Math.min(frame.width, template.w * 3.8);
    const maxH = Math.min(frame.height, template.h * 3.8);
    const boxW = clamp(detectedW, minW, maxW);
    const boxH = clamp(detectedH, minH, maxH);
    const boxX = clamp(centerX - boxW / 2, 0, Math.max(0, frame.width - boxW));
    const boxY = clamp(centerY - boxH / 2, 0, Math.max(0, frame.height - boxH));

    const averageSimilarity = best.mass / Math.max(1, best.count);
    const quality =
      averageSimilarity * 0.50 +
      best.sizeScore * 0.28 +
      best.proximity * 0.22;
    const confidence = clamp(0.15 + quality * 0.85, 0, 1);
    const inv = 1 / frame.scale;

    return {
      box: {
        x: boxX * inv,
        y: boxY * inv,
        w: boxW * inv,
        h: boxH * inv
      },
      confidence,
      error: (1 - confidence) * 72,
      colorArea: true
    };
  }

  findBestMatch = function findBestMatchMonochrome(frame) {
    const template = state.auto.template;
    if (!template || !state.auto.box) return null;

    const model = learnColorModel(template);
    const colorMatch = findColorArea(frame, template, model);

    // Jakmile existuje rozumná souvislá barevná oblast, používáme její střed.
    // Původní šablonový tracker se použije jen tehdy, když žádnou oblast
    // nenajdeme – tím se nevrací staré poskakování mezi částmi objektu.
    if (colorMatch) return colorMatch;
    return fallbackFindBestMatch(frame);
  };
})();
