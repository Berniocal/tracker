(() => {
  const originalKinematicsPoints = kinematicsPoints;

  kinematicsPoints = function kinematicsPointsWithPath() {
    const points = originalKinematicsPoints();
    let path = 0;
    let previous = null;

    return points.map((point) => {
      if (
        previous &&
        Number.isFinite(previous.xm) && Number.isFinite(previous.ym) &&
        Number.isFinite(point.xm) && Number.isFinite(point.ym)
      ) {
        path += Math.hypot(point.xm - previous.xm, point.ym - previous.ym);
      }
      previous = point;
      return { ...point, s: path };
    });
  };

  graphConfigs.s = {
    xKey: 'dt',
    yKey: 's',
    xLabel: 't [s]',
    yLabel: '|s| [m]',
    unit: 'm'
  };
})();