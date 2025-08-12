import React from 'react';
import { createWorld } from '../ecs';
import { GameLoop } from '../systems/Loop';
import { FogOfWarSystem } from '../systems/FogOfWarSystem';
import { SanctumSystem } from '../systems/SanctumSystem';
import { SceneRoot } from '../render/three/SceneRoot';
import { SanctumPanel } from './panels/SanctumPanel';
import { DebugPanel } from './panels/DebugPanel';

export function App(): React.JSX.Element {
  const renderRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!renderRef.current) return;

    const world = createWorld();
    const loop = new GameLoop(world);
    const scene = new SceneRoot(renderRef.current);

    loop.addFixedSystem(SanctumSystem);
    loop.addRenderSystem((_w, _dt) => scene.render());
    loop.addRenderSystem(FogOfWarSystem);

    const onResize = (): void => {
      const el = renderRef.current!;
      scene.resize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);
    onResize();

    loop.start();
    return () => {
      window.removeEventListener('resize', onResize);
      loop.stop();
    };
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, background: '#000' }} id="render-root" ref={renderRef} />
      <div style={{ width: 360, padding: 12, background: '#111', color: '#eee', overflow: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>Polyfantasy</h2>
        <SanctumPanel />
        <DebugPanel />
      </div>
    </div>
  );
}


