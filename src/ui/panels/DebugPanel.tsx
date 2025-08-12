import React from 'react';

export function DebugPanel(): React.JSX.Element {
  const [fps, setFps] = React.useState(0);
  React.useEffect(() => {
    let last = performance.now();
    let frame = 0;
    let raf = 0;
    const loop = (): void => {
      const now = performance.now();
      frame += 1;
      if (now - last >= 1000) {
        setFps(frame);
        frame = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div>
      <h3>디버그</h3>
      <div>FPS: {fps}</div>
    </div>
  );
}


