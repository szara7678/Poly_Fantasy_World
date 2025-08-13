/* eslint-disable */
// @ts-nocheck
import React from 'react';
import * as THREE from 'three';
import { getBuildings, setBuildingActive } from '../../systems/Buildings';
import { getCitizens } from '../../systems/CitizenSystem';

// 전역 클릭 이벤트를 통해 최근 클릭된 엔티티를 추적하여 모달로 표시
export function EntityInspector(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<{ type: 'Citizen' | 'Building'; id: string; snapshot?: any } | null>(null);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ type: 'Citizen' | 'Building'; id: string; snapshot?: any }>;
      if (ce?.detail?.id) {
        setData(ce.detail);
        setOpen(true);
      }
    };
    window.addEventListener('pfw-open-inspector', onOpen as EventListener);
    return () => window.removeEventListener('pfw-open-inspector', onOpen as EventListener);
  }, []);

  if (!open || !data) return null;

  const close = () => setOpen(false);
  let content: React.ReactNode = null;
  if (data.type === 'Citizen') {
    const c = getCitizens().find(x => x.id === data.id);
    if (c) {
      // Top-5 작업 스코어 표시(디버그)
      const top5 = (window as any).__pfw_cit_top5?.[c.id] as Array<{ id: string; score: number }> | undefined;
      content = (
        <div>
          <h3>시민 정보</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <div><b>ID</b>: {c.id}</div>
              <div><b>역할</b>: {c.role}</div>
              <div><b>상태</b>: {c.state}</div>
              <div><b>위치</b>: {c.pos.x.toFixed(2)}, {c.pos.z.toFixed(2)}</div>
              <div><b>속도</b>: {c.vel.length().toFixed(2)} m/s</div>
              <div><b>피로</b>: {(c.fatigue*100|0)}%</div>
              <div><b>소지</b>: {c.carry.item ?? '-'} x {c.carry.qty}/{c.carry.capacity}</div>
              <div><b>타겟</b>: {c.nodeTargetId ?? '-'}</div>
            </div>
            <div>
              <div><b>특성</b>: {(c.traits||[]).join(', ') || '-'}</div>
              <div><b>능력치</b>:</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>STR {c.stats.STR} / DEX {c.stats.DEX} / INT {c.stats.INT} / VIT {c.stats.VIT} / WIS {c.stats.WIS} / CHA {c.stats.CHA}</div>
              <div><b>파생</b>: HP {c.derived.HP} / Stamina {c.derived.Stamina} / Move {c.derived.Move.toFixed(2)}</div>
              <div><b>적성</b>: 숲 {c.aptitude.Forest.toFixed(2)} / 광산 {c.aptitude.IronMine.toFixed(2)}</div>
              <div><b>전투</b>: ATK {c.atk ?? '-'} / Range {c.range ?? '-'} / XP {c.combatXp ?? 0}</div>
            </div>
          </div>
          {top5 && top5.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div><b>Top-5 작업</b></div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                {top5.map((t, i) => (<div key={i}>{t.id}: {t.score.toFixed(3)}</div>))}
              </div>
            </div>
          )}
        </div>
      );
    } else {
      content = (<div>시민 데이터를 찾을 수 없습니다. (역할 변경/제거되었을 수 있습니다)</div>);
    }
  } else if (data.type === 'Building') {
    const b = getBuildings().find(x => x.id === data.id);
    if (b) {
      // 근접 근로자 수, 인접 보너스 등 간단 표시
      const nearWorkers = ((globalThis as any).__pfw_near_producers_counts?.[b.id] ?? 0) as number;
      const level = (b as any).level ?? 1;
      function dispatch(kind: 'upgrade' | 'downgrade') {
        try { window.dispatchEvent(new CustomEvent('pfw-building-action', { detail: { id: b.id, action: kind } })); } catch {}
      }
      content = (
        <div>
          <h3>건물 정보</h3>
          <div>ID: {b.id}</div>
          <div>종류: {b.kind}</div>
          <div>위치: {b.position[0].toFixed(2)}, {b.position[2].toFixed(2)}</div>
          <div>레벨: {level}</div>
          <div>가동 상태: {(b as any).active === false ? '중지' : '가동'}</div>
          <div>근접 근로자 수(가시): {nearWorkers}</div>
          {b.kind === 'Storage' && (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>용량 보너스: +{100 * level}</div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <button onClick={() => dispatch('upgrade')}>업그레이드</button>
            <button onClick={() => dispatch('downgrade')}>다운그레이드</button>
            <button onClick={() => { setBuildingActive(b.id, !(b as any).active); }}>가동/중지</button>
          </div>
        </div>
      );
    } else {
      content = (<div>건물 데이터를 찾을 수 없습니다. (철거/변경되었을 수 있습니다)</div>);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', zIndex: 9999 }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', width: 360, maxHeight: '80vh', overflow: 'auto', background: '#121212', border: '1px solid #333', color: '#eee', padding: 12, borderRadius: 6 }}>
        <button onClick={close} style={{ position: 'absolute', right: 8, top: 8 }}>닫기</button>
        {content || <div>엔티티 정보를 찾을 수 없습니다.</div>}
      </div>
    </div>
  );
}


