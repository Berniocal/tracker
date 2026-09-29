(() => {
  // Barevně orientované porovnání pro automatický tracker.
  // Označování objektu ani průběh trackeru se nemění – mění se pouze skóre,
  // podle kterého se v dalším snímku hledá nejpodobnější oblast.

  function pixelFeatures(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const total = r + g + b;
    const norm = 255 / Math.max(24, total);
    return {
      cr: clamp(r * norm, 0, 255),
      cg: clamp(g * norm, 0, 255),
      cb: clamp(b * norm, 0, 255),
      sat: max > 0 ? ((max - min) / max) * 255 : 0,
      value: max,
      luma: 0.2126 * r + 0.7152 * g + 0.0722 * b
    };
  }

  function centerWeight(x, y, width, height) {
    const nx = Math.abs((x + 0.5) / Math.max(1, width) - 0.5) * 2;
    const ny = Math.abs((y + 0.5) / Math.max(1, height) - 0.5) * 2;
    const edge = clamp(Math.max(nx, ny), 0, 1);
    const center = 1 - edge;
    return 0.35 + 1.65 * center * center;
  }

  function templateColorAnchor(template, sample) {
    // Barevný podpis zůstává ukotvený k původně označenému objektu.
    // Adaptace šablony tak může pomáhat textuře, ale tracker barevně neodriftuje
    // postupně do pozadí.
    if (template.__colorAnchor) return template.__colorAnchor;

    let cr = 0, cg = 0, cb = 0, sat = 0, luma = 0, weightSum = 0;
    for (let yy = 0; yy < template.h; yy += sample) {
      let ti = (yy * template.w) * 3;
      for (let xx = 0; xx < template.w; xx += sample) {
        const f = pixelFeatures(template.data[ti], template.data[ti + 1], template.data[ti + 2]);
        const weight = centerWeight(xx, yy, template.w, template.h);
        cr += f.cr * weight;
        cg += f.cg * weight;
        cb += f.cb * weight;
        sat += f.sat * weight;
        luma += f.luma * weight;
        weightSum += weight;
        ti += sample * 3;
      }
    }

    const inv = 1 / Math.max(1e-9, weightSum);
    template.__colorAnchor = {
      cr: cr * inv,
      cg: cg * inv,
      cb: cb * inv,
      sat: sat * inv,
      luma: luma * inv
    };
    return template.__colorAnchor;
  }

  scorePatch = function scorePatchColorWeighted(frame, template, x, y) {
    const tw = template.w;
    const th = template.h;
    if (x < 0 || y < 0 || x + tw > frame.width || y + th > frame.height) return Infinity;

    const sample = clamp(Math.floor(Math.min(tw, th) / 16), 1, 5);
    const anchor = templateColorAnchor(template, sample);

    let localError = 0;
    let localWeight = 0;
    let cr = 0, cg = 0, cb = 0, sat = 0, luma = 0, signatureWeight = 0;

    for (let yy = 0; yy < th; yy += sample) {
      let fi = ((y + yy) * frame.width + x) * 4;
      let ti = (yy * tw) * 3;

      for (let xx = 0; xx < tw; xx += sample) {
        const fr = frame.data[fi];
        const fg = frame.data[fi + 1];
        const fb = frame.data[fi + 2];
        const tr = template.data[ti];
        const tg = template.data[ti + 1];
        const tb = template.data[ti + 2];

        const current = pixelFeatures(fr, fg, fb);
        const reference = pixelFeatures(tr, tg, tb);
        const weight = centerWeight(xx, yy, tw, th);

        const chromaDiff = (
          Math.abs(current.cr - reference.cr) +
          Math.abs(current.cg - reference.cg) +
          Math.abs(current.cb - reference.cb)
        ) / 3;
        const saturationDiff = Math.abs(current.sat - reference.sat);
        const brightnessDiff = Math.abs(current.luma - reference.luma);
        const rawDiff = (
          Math.abs(fr - tr) +
          Math.abs(fg - tg) +
          Math.abs(fb - tb)
        ) / 3;

        const colorful = clamp(Math.max(current.sat, reference.sat) / 180, 0, 1);
        const darkReliability = clamp(Math.min(current.value, reference.value) / 55, 0, 1);
        const colorWeight = (0.38 + 0.36 * colorful) * (0.55 + 0.45 * darkReliability);
        const brightnessWeight = 0.10 + 0.32 * (1 - colorful);

        // Barevnost dominuje. Jas a přesná textura mají jen pomocnou roli.
        const pixelError =
          chromaDiff * colorWeight +
          saturationDiff * 0.12 +
          brightnessDiff * brightnessWeight +
          rawDiff * 0.08;

        localError += pixelError * weight;
        localWeight += weight;

        cr += current.cr * weight;
        cg += current.cg * weight;
        cb += current.cb * weight;
        sat += current.sat * weight;
        luma += current.luma * weight;
        signatureWeight += weight;

        fi += sample * 4;
        ti += sample * 3;
      }
    }

    if (!(localWeight > 0) || !(signatureWeight > 0)) return Infinity;

    const inv = 1 / signatureWeight;
    const meanCr = cr * inv;
    const meanCg = cg * inv;
    const meanCb = cb * inv;
    const meanSat = sat * inv;
    const meanLuma = luma * inv;

    const regionChromaDiff = (
      Math.abs(meanCr - anchor.cr) +
      Math.abs(meanCg - anchor.cg) +
      Math.abs(meanCb - anchor.cb)
    ) / 3;
    const regionSatDiff = Math.abs(meanSat - anchor.sat);
    const regionLumaDiff = Math.abs(meanLuma - anchor.luma);
    const anchorColorful = clamp(anchor.sat / 180, 0, 1);

    const regionError =
      regionChromaDiff * 0.72 +
      regionSatDiff * 0.14 +
      regionLumaDiff * (0.08 + 0.28 * (1 - anchorColorful));

    // Větší část výsledku tvoří celková barevnost oblasti. Pixelová shoda
    // zůstává jako pojistka proti přeskočení na jiný stejně barevný předmět.
    return (localError / localWeight) * 0.42 + regionError * 0.58;
  };
})();
