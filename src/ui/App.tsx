/* eslint-disable */
// @ts-nocheck
import React from 'react';
import { createWorld, setActiveWorld, type GameWorld } from '../ecs';
import { GameLoop } from '../systems/Loop';
import { FogOfWarSystem, createFogOfWarRenderSystem } from '../systems/FogOfWarSystem';
import { SanctumSystem, createSanctumRenderSystem } from '../systems/SanctumSystem';
import { SceneRoot } from '../render/three/SceneRoot';
import { SanctumPanel } from './panels/SanctumPanel';
import { DebugPanel } from './panels/DebugPanel';
import { NodeRegenSystem } from '../systems/NodeRegenSystem';
import { createBuildPreviewSystem } from '../systems/BuildPreviewSystem';
import { setBuildMode } from '../systems/BuildPreviewSystem';
import { createBlueprintRenderSystem } from '../systems/BlueprintSystem';
import { BuildSystem } from '../systems/BuildSystem';
import { ScoutSystem, createScoutRenderSystem } from '../systems/ScoutSystem';
import { EdictSystem } from '../systems/EdictSystem';
import { EdictPanel } from './panels/EdictPanel';
import { MarketSystem } from '../systems/MarketSystem';
import { ProjectileSystem, createProjectileRenderSystem } from '../systems/ProjectileSystem';

export function App(): React.JSX.Element {
  const renderRef = React.useRef<HTMLDivElement | null>(null);
  const worldRef = React.useRef<GameWorld | null>(null);

  // Ensure world exists before children render
  if (!worldRef.current) {
    worldRef.current = createWorld();
    setActiveWorld(worldRef.current);
  }

  React.useEffect(() => {
    if (!renderRef.current) return;

    const world = worldRef.current!;
    const loop = new GameLoop(world);
    const scene = new SceneRoot(renderRef.current);

    loop.addFixedSystem(SanctumSystem);
    loop.addFixedSystem(NodeRegenSystem);
    loop.addFixedSystem(BuildSystem);
    loop.addFixedSystem(ScoutSystem);
    loop.addFixedSystem(EdictSystem);
    loop.addFixedSystem(ProjectileSystem);
    loop.addFixedSystem(MarketSystem);
    loop.addRenderSystem(createSanctumRenderSystem(scene));
    loop.addRenderSystem((_w, _dt) => scene.render());
    loop.addRenderSystem(createFogOfWarRenderSystem(scene));
    loop.addRenderSystem(FogOfWarSystem);
    loop.addRenderSystem(createBuildPreviewSystem(scene));
    loop.addRenderSystem(createBlueprintRenderSystem(scene));
    loop.addRenderSystem(createScoutRenderSystem(scene));
    loop.addRenderSystem(createProjectileRenderSystem(scene));
    // UI tick: notify panels to re-render with latest data
    loop.addRenderSystem(() => {
      window.dispatchEvent(new CustomEvent('pfw-ui-tick'));
    });

    const onResize = (): void => {
      const el = renderRef.current!;
      // 좌측 컬럼 크기 정확히 맞추기
      const rect = el.getBoundingClientRect();
      // 일부 환경에서 devtools/HUD가 1~2px 끼어드는 이슈 대응 여백 제거
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      scene.resize(w, h);
      scene.camera.updateProjectionMatrix();
      scene.renderer.setPixelRatio(1);
      scene.renderer.setScissorTest(false);
    };
    window.addEventListener('resize', onResize);
    const onSetMode = (e: Event): void => {
      const ce = e as CustomEvent<'Building' | 'Road' | 'None'>;
      setBuildMode(ce.detail);
    };
    window.addEventListener('pfw-set-build-mode', onSetMode as EventListener);
    onResize();

    loop.start();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pfw-set-build-mode', onSetMode as EventListener);
      scene.dispose();
      loop.stop();
    };
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ position: 'relative', background: '#000', height: '100%', overflow: 'hidden' }} id="render-root" ref={renderRef} />
      <div style={{ width: 360, padding: 12, background: '#111', color: '#eee', overflow: 'auto', height: '100%' }}>
        <h2 style={{ marginTop: 0 }}>Polyfantasy</h2>
        <SanctumPanel />
        <EdictPanel />
        <DebugPanel />
      </div>
    </div>
  );
}
