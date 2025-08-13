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
import { NodeRegenSystem, createNodeRenderSystem } from '../systems/NodeRegenSystem';
import { createBuildPreviewSystem } from '../systems/BuildPreviewSystem';
import { setBuildMode } from '../systems/BuildPreviewSystem';
import { createBlueprintRenderSystem } from '../systems/BlueprintSystem';
import { BuildSystem } from '../systems/BuildSystem';
import { ScoutSystem, createScoutRenderSystem } from '../systems/ScoutSystem';
import { EdictSystem } from '../systems/EdictSystem';
import { EdictPanel } from './panels/EdictPanel';
import { MarketSystem } from '../systems/MarketSystem';
import { MarketPanel } from './panels/MarketPanel';
import { createRoadRenderSystem } from '../systems/RoadNetwork';
import { ProjectileSystem, createProjectileRenderSystem } from '../systems/ProjectileSystem';
import { TargetPanel } from './panels/TargetPanel';
import { createTargetRenderSystem } from '../systems/TargetSystem';
import { BuildPanel } from './panels/BuildPanel';
import { RoadHelper } from './panels/RoadHelper';
import { createRoadPreviewRenderSystem } from '../systems/RoadPreviewRender';
import { CitizenSystem, createCitizenRenderSystem } from '../systems/CitizenSystem';
import { HUD } from './HUD';
import { ProductionSystem } from '../systems/ProductionSystem';
import { createBuildingsRenderSystem } from '../systems/BuildingsRender';
import { EntityInspector } from './panels/EntityInspector';
import { ResearchSystem } from '../systems/ResearchSystem';
import { createEdictHeatmapRenderSystem } from '../systems/EdictHeatmapSystem';
import { createDemolishSystem } from '../systems/DemolishSystem';
import { AutoRoadPlannerSystem } from '../systems/AutoRoadPlannerSystem';
import { MonsterSystem, createMonsterRenderSystem } from '../systems/MonsterSystem';
import { ResearchPanel } from './panels/ResearchPanel';
import { LogsPanel } from './panels/LogsPanel';
import { JobChunkSystem } from '../systems/JobChunkSystem';
import { createBiomeRenderSystem } from '../systems/BiomeSystem';

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
    loop.addFixedSystem(CitizenSystem);
    loop.addFixedSystem(ProductionSystem);
    loop.addFixedSystem(ResearchSystem);
    loop.addFixedSystem(JobChunkSystem);
    loop.addFixedSystem(EdictSystem);
    loop.addFixedSystem(ProjectileSystem);
    loop.addFixedSystem(MarketSystem);
    loop.addFixedSystem(MonsterSystem);
    loop.addFixedSystem(AutoRoadPlannerSystem);
    loop.addRenderSystem(createSanctumRenderSystem(scene));
    loop.addRenderSystem(createBiomeRenderSystem(scene));
    loop.addRenderSystem((_w, _dt) => scene.render());
    loop.addRenderSystem(createFogOfWarRenderSystem(scene));
    loop.addRenderSystem(FogOfWarSystem);
    loop.addRenderSystem(createEdictHeatmapRenderSystem(scene));
    loop.addRenderSystem(createBuildPreviewSystem(scene));
    loop.addRenderSystem(createBlueprintRenderSystem(scene));
    loop.addRenderSystem(createScoutRenderSystem(scene));
    loop.addRenderSystem(createNodeRenderSystem(scene));
    loop.addRenderSystem(createRoadRenderSystem(scene));
    loop.addRenderSystem(createRoadPreviewRenderSystem(scene));
    loop.addRenderSystem(createProjectileRenderSystem(scene));
    loop.addRenderSystem(createCitizenRenderSystem(scene));
    loop.addRenderSystem(createBuildingsRenderSystem(scene));
    loop.addRenderSystem(createTargetRenderSystem(scene));
    loop.addRenderSystem(createDemolishSystem(scene));
    loop.addRenderSystem(createMonsterRenderSystem(scene));
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
      // 낮은 GPU 사양에서도 안정적 FPS 확보
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
      <div style={{ width: 360, padding: 12, background: '#111', color: '#eee', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <div style={{ position: 'sticky', top: 0, background: '#111', zIndex: 2 }}>
          <h2 style={{ marginTop: 0 }}>Polyfantasy</h2>
          <HUD />
        </div>
        <Tabs />
        <EntityInspector />
      </div>
    </div>
  );
}

function Tabs(): React.JSX.Element {
  const [tab, setTab] = React.useState<'Sanctum' | 'Build' | 'Research' | 'Market' | 'Edict' | 'Targets' | 'Road' | 'Debug' | 'Logs'>('Sanctum');
  const btn = (k: typeof tab, label: string) => (
    <button onClick={() => setTab(k)} disabled={tab === k}>{label}</button>
  );
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'sticky', top: 0, background: '#111', zIndex: 2, paddingBottom: 6 }}>
        {btn('Sanctum', '성역')}
        {btn('Build', '건설')}
        {btn('Research', '연구')}
        {btn('Market', '시장')}
        {btn('Edict', '전언')}
        {btn('Targets', '타겟')}
        {btn('Road', '도로')}
        {btn('Debug', '디버그')}
        {btn('Logs', '로그')}
      </div>
      <div style={{ overflow: 'auto', minHeight: 0, maxHeight: '100%' }}>
        {tab === 'Sanctum' && <SanctumPanel />}
        {tab === 'Build' && <BuildPanel />}
        {tab === 'Research' && <ResearchPanel />}
        {tab === 'Market' && <MarketPanel />}
        {tab === 'Edict' && <EdictPanel />}
        {tab === 'Targets' && <TargetPanel />}
        {tab === 'Road' && <RoadHelper />}
        {tab === 'Debug' && <DebugPanel />}
        {tab === 'Logs' && <LogsPanel />}
      </div>
    </div>
  );
}
