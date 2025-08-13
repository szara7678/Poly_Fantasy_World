Ⅰ. 최종 기획서 (GDD v0.1)
1) 게임 개요
가제: 성자의 영토 (Saint’s Dominion)

장르: 실시간 콜로니 시뮬 + 라이트 RPG + 생존/건설

플랫폼: Three.js(WebGL), GitHub Pages 배포

핵심 판정

성자: 불멸 수명·전투력 낮음. 성역화로 영토 창건/확장. 성자가 사망하면 즉시 패배.

성역 규칙: 건물은 성역 내부에만 건설 가능. 몬스터 진입 불가, 경계 관통 피해 −50%.

시민: 자율 AI. **전언(Edict)**과 타겟 지시로 플레이어가 방향만 제어.

자원 노드: 최대량(capMax)/일일 재생(regen). 채집 건물 없음—인력이 직접 채집→가공.

영토 밖: 도로만 건설 가능(이동/물류 보너스).

경제/무역: 정착지 금고·시장·교역소·캐러밴. 수요/공급 기반 가격.

2) 핵심 루프
탐사(FoW 해제) → 성역화로 거점 확보 → 시민 자율 채집/건설/제작/연구
→ 도로/상인으로 물류 최적화 → 레이드/보스 방어(영웅+성자 기적)
→ 위성 마을 창건 → 고급 연구·룬·마나공학 → 승리 조건 달성.

3) 월드/안개/바이옴
안개(FoW) 상태: Unseen / Explored / Visible

성역 내부: 항상 Visible

정찰/사냥꾼/벌목꾼/상인 경로 중심 폭 8~12m가 Explored로 누적(5~10분 후 일부 퇴색)

정찰 임무: 30초마다 부채꼴 25m Visible 스윕

바이옴: 초원/침엽수림/산악/사막/늪/화산/마나황무지(자원·위협·날씨 테이블 상이)

4) 성자·성역(영토)
성역화(Consecrate): 마나 180, 시전 6s, 쿨다운 180s

반경 = 18m × (성소 레벨+1) (초기 36m)

유지비: 성역 1개당 −0.2 마나/s(정착지 신앙 총합/100만큼 상쇄)

상한: 동시 2개(연구로 +1, +1)

안전: 성역 내 몬스터 진입 불가. 경계 관통 피해 −50%

건설: 성역 내부 모든 건물, 성역 밖 도로만

위성 마을: 성자+개척대(5~12) 이동→성역화→성소/창고/주거 자동 청사진→자율 정착.
본거지와 도로 연결 시 보급/교역/방어 효율 상승.

5) 자원 노드·채집(동시 배치)
노드 기본

숲: capMax 1000, regen +2/일, 벌목 1~3통/행동

철광산: capMax 1000, regen +1/일, 1광석/행동

약초지: capMax 300, regen +3/일

마나원: capMax 200, regen +0.5/일(정제 필요)

안전 저수준: capMax의 **20%**는 보존(SafeReserve)

일일 쿼터: min(capNow - SafeReserve, 가용인력×작업률)

채집 건물 없음: 인력이 직접 채집→창고→가공(제재소/제련/공방 등)

동시 배치 규칙 (모든 노드/작업장 공통):

slots.soft(권장), slots.hard(최대)

effCurve(n):

n ≤ soft → 선형, eff = n

soft < n ≤ hard → 감가 40%, eff = soft + 0.6×(n-soft)

처리량(초당) = Σ(workerRate_i) × (eff/n) × localMultiplier

6) 도로(성역 밖 유일 건설)
타입	비용/타일	속도계수	특기
흙길	노역	×1.25	어디든(비 후 ×1.15)
자갈길	돌×1	×1.40	경사 < 30°
판잣길(습지)	목재×1	×1.35	습지 특화
석판로	돌×2	×1.55	평탄 필요, 내구 최고

내구 소모→보수 태스크 자동 생성

자동 도로 플래너(선택): 수요/길이/안전/지형 점수로 노선 제안

7) 시민(엔티티)·직업·자율 AI
기본 스탯(020, 평균 810): STR/DEX/INT/VIT/WIS/CHA

파생: HP=50+VIT×10, Stamina=50+(STR+DEX)×5, Mana=30+(INT+WIS)×8, Carry=20+STR×2, Move=3.5m/s×(1+DEX/50−중량)

적성(★0~3): 벌목/채광/사냥/농사/목축/공예/대장/건축/연금/치유/연구/전투/상인

특성: 근면/겁쟁이/신실/야행성/손재주/불굴(±5~15%)

역할: 벌목꾼/광부/사냥꾼/농부/건축가/대장장이/연금술사/치유사/연구자/경비병/상인

자율 의사결정(유틸리티)

markdown
복사
작업 점수 U = Base × Aptitude × Context × Distance × Risk × Edict
               × Need × Facility × Fatigue + TargetOrder
Distance = 1/(1+d/R), Risk = 1−clamp(위험×취약,0,0.6)

Edict(전언) 가중 1.1~2.0, 총합 ×3 캡

직업 자동 결정: 현재 역할보다 +20% 높은 역할 점수가 2분 지속 시 전직

작업 예약: Job Chunk 슬롯 선점(타임아웃/반납)

전시 체제: 위협>0.6 → 전투/방어 가중↑, 비전투↓

성장·세대(선택): 부부/가족·출생·교육→적성 확률·초기 스킬에 소폭 영향

8) 전언(Edict)·타겟 지시
전언: 도메인/태그/강도/TTL/감쇠

예) 채집/철광산, 전투/늑대, 건설/도로, 연구/금속공, 무역/철괴

타겟 지시: 특정 몬스터/노드/좌표. 만료/실패 규칙, 우선권 최고.

9) 영웅·성자·전투
영웅 듀오(수호+사냥형 조합 권장), 스킬 2~3개

피해 타입: 참/관통/둔기, 화염/빙결/전기/독/신성/암흑/비전

상성: 둔기→골렘/갑주 강, 신성→언데드 강, 화염→식물 강(빙결 약)

TTK 목표: 초반 일반몹 6~10초(영웅1+경비2)

성자 기적: 성역/치유의 파동/정화/시간 완화/수호정령/영혼 귀환/성역화

10) 몬스터
분류: 야수(늑대/곰), 요마(고블린/트롤), 원소(정령), 언데드(해골/망령), 마나 변이(수정 골렘 등)

등급: 일반/정예/보스

규칙: 성역 내부 진입 불가, 경계 관통 공격 페널티

AI: 위협도 기반 타겟팅, 보스 페이즈

11) 건물(성역 내부 전용) & 생산(동시 작업)
핵심 건물: 성소, 주거, 창고, 제재소, 제련소, 공방, 대장간, 연금실, 연구실, 병영/사격장/마탑, 시장/교역소, 성벽/탑

동시 작업대: workstations.soft/hard

제련소 v1: 2/3, 대장간 v1: 2/2, 공방 v1: 2/3, 연구실 v1: 1/2

인접 보너스: 창고·도로·성소 근접 시 생산/이동/사기 보정

업그레이드: Lv1~3(슬롯·속도·품질·수수료 개선)

건설 자동 우선순위

makefile
복사
BScore = CapacityDeficit + ProductionDeficit + WarFooting + Synergy
       + DistancePenalty + ResourceFeasibility + EdictBuild
(임계 초과 시 자율 청사진 생성)

12) 아이템/티어/룬
티어: 돌 → 청동 → 철 → 강철 → 마나합금

도구: 도끼/곡괭이/톱/망치/괭이/부삽/낫/등불/수레

무기/방어: 검/창/도끼/곤봉/활/쇠뇌/지팡이, 천/가죽/사슬/판금/로브/방패

룬: 화염/빙결/전기/신성/비전(공격/내성/자원효율)

13) 경제·상인·무역
화폐: Coin(정착지 금고)

시장(Market): 매수/매도 계약(수량·상/하한가·기한), 수수료 5%(업글 3%)

교역소(Tradepost): 캐러밴 슬롯 제공(soft/hard), 노선 효율

가격식

ini
복사
SettlementPrice = BasePrice × (1 + Scarcity)
Scarcity = clamp((Desired - Current)/Desired, -0.4, +1.0)
노선 점수

ini
복사
RouteScore = (Profit - RiskCost - TimeCost) × EdictTrade
캐러밴: 상인1 + 운반1~4 + 노새/수레(+경비), 도로 계수 적용

14) 진행·연구·이벤트
연구 트리: 생존→농업→금속→군사→마법→문명→고대기술(성역 상한/반경↑, 마나 유지 효율↑)

시즌: 봄/여름/가을/겨울(생산/소비 보정)

이벤트: 마나폭풍/역병/순례/도적단/레이드/유적

15) 밸런싱 기본값
성역: 반경 36m(Lv1), 유지 −0.2 마나/s/성역, 상한 2개

도로 속도: 1.25/1.40/1.35/1.55 (흙/자갈/판자/석판)

노드: 숲 1000(+2/일), 철 1000(+1/일), SafeReserve 20%

속도: 벌목 1통/8s, 채광 1광석/10s, 운반 1통/3s(거리 보정)

전투 TTK: 6~10s, 전시 임계 0.6(해제 0.4)

전언 상한: 곱 총합 ×3.0, 전직 히스테리시스: +20%/120s

도구 계수: T1 +15%, T2 +30%, T3 +50%

16) 데이터 스키마(요약 샘플)
json
복사
// 성역
{"sanctumId":"S_home","center":[0,0,0],"radius":36,"upkeepManaPerSec":0.2,"noMonsterEntry":true,"rangedMitigation":0.5}
// 성역화 주문
{"spellId":"Consecrate","manaCost":180,"castTime":6,"cooldown":180,"radiusPerLevel":18,"upkeepPerSanctum":0.2,"maxSanctums":2}
// 자원 노드
{"nodeId":"iron_i07","type":"IronMine","capMax":1000,"capNow":612,"regenPerDay":1,"slots":{"soft":4,"hard":6}}
// 도로
{"roadId":"r_17","type":"Stone","from":[0,0,0],"to":[620,0,440],"len":760}
// 계약
{"contractId":"sell_leather_80","kind":"Sell","item":"Leather","qty":80,"limitPrice":3,"expiresDay":31,"status":"Open"}
// 작업 청크
{"jobChunkId":"Gather_iron_i07_04","type":"Gather","resource":"IronOre","pos":[618,0,438],"nodeId":"iron_i07","slots":3,"danger":0.12}
// 전언
{"id":"edict_Gather_Iron","domain":"Gather","tag":"IronMine","mult":1.6,"ttl":600,"decay":0.996}
17) 시스템 의사코드(발췌)
ts
복사
// 일일 재생 & 쿼터
for (node of nodes) {
  node.capNow = clamp(node.capNow + node.regenPerDay*daysElapsed, 0, node.capMax);
  if (node.capNow > node.capMax*0.2) spawnGatherJobs(node);
}
// 건설 가능
function canBuild(pos,type){ return type==="Road" || isInsideAnySanctum(pos); }
// 작업 선택
const cand = senseJobs(ent);
for (const t of cand) t.u = score(ent,t,bb);
const best = argmax(cand,x=>x.u);
if (reserve(best)) assign(ent,best);
18) UI/UX(핵심)
전언 패널: 분야 탭·태그·강도/지속 슬라이더, 감쇠·잔여

타겟 지시: 대상 클릭→“타겟”(위험·요구 역할 미리보기)

성역 패널: 반경/유지비/신앙 상쇄, 확장 미리보기

도로 도우미: 추천 노선 표시→수락 시 청사진 생성

우선순위 디버거: 엔티티 Top-5 작업, 가중 항목 바차트

동시 처리 가시화: 대상에 정원 바(n/soft/hard), 효율 툴팁 effCurve(n)

19) 기술 스택/배포
렌더/물리: Three.js + Rapier(WASM) 또는 cannon-es

아키텍처: ECS(bitecs/ecsy) + BT/Utility AI + Recast/Detour(navmesh)

번들: Vite (base:'/repo-name/')

자원: glTF 로우폴리, 텍스처 512~1024, 오브젝트 풀/LOD

배포: dist/ → gh-pages 자동 배포(CI)

20) 승리/패배·품질·텔레메트리
승리(예시): ① 3개 바이옴에 성역 Lv3 유지, ② 월드보스 1체 토벌, ③ 고대기술 완성(任)

패배: 성자 사망 또는 정착민 전멸

성능: 60fps@1080p, DrawCalls<350, Tris<150k, 텍스처<128MB

텔레메트리: 생산–소비, 전언 사용률, 캐러밴 수지, 전투 TTK, AI 틱 시간

Ⅱ. 구현 로드맵 (시각화 우선, GH Pages 주기 배포)
각 단계는 보이는 것 → 시스템/데이터 → 3D 메쉬 → 완료 기준(DoD).
권장 템포: 2~4일/단계, 끝날 때마다 5~10초 GIF와 함께 배포.

P0 — 부팅씬 & 그레이박스
보이는 것: 평지, 스카이, 카메라, FPS HUD

시스템: Vite+TS+ECS, GH Pages CI, /data/constants.json 로드

DoD: 페이지 접속 60fps, CI 배포 성공

P1 — 안개(FoW) & 정찰 궤적
보이는 것: 정찰자가 지나간 부채꼴만 드러남

시스템: FoW 텍스처(Explored/Visible), 경로 기록/퇴색

DoD: 이동에 따라 지형이 드러남

P2 — 성자 & 성역화 링
보이는 것: 성역 링 맥동, 성역 내 프리뷰 초록/외부 빨강

시스템: miracle.consecrate(180/6s/180s), 성역 레지스트리/유지비

DoD: 성역 내 건설만 허용

P3 — 기본 건물 3종(성소/창고/주거)
보이는 것: 블루프린트→착공→완공 단계 연출

시스템: 건설 큐·자원 소모·철거, 배치 검증

DoD: 3종 배치/철거/재건 OK

P4 — 노드 시각화 + A1 작업 청크/예약
보이는 것: 숲/철광 게이지, 작업 아이콘, 중복 작업 방지

시스템: nodes.json(Forest/Iron), 일일 재생, 슬롯/예약/타임아웃

DoD: 새벽 재생, 작업 충돌 해소

P5 — 채집 루프 + A2 유틸리티 재평가
보이는 것: 벌목/채광→창고 카운터 상승, 시민 Top-3 작업 바

시스템: items/recipes, 유틸리티 공식(0.5~1.0s 재평가)

DoD: 상황 변화 시 즉시 작업 전환

P6 — 도로 4종 + A6 경로비용 반영
보이는 것: 도로별 시각 차이, 경로 굵기/위험 표기

시스템: 도로 그래프/속도/보수, 경로비용→유틸리티 Distance/Risk 반영

DoD: 길 깔면 왕복 시간 체감 감소

P7 — 전언(Edict) 히트맵 A3
보이는 것: “채집/철광 ×1.6” → 히트맵 붉어짐, 동선 변화

시스템: edicts.json, 총합×3 캡, 전언 패널

DoD: 전언 On/Off로 우선순위 즉시 변동

P8 — 위성 성역 + A4 타겟 지시
보이는 것: 원거리 새 성역 점등, 타겟 표식·비전투 우회

시스템: 동시 성역 2개, 타겟 스택(+TargetOrder)

DoD: 새 성역 내만 건설·타겟 종료 시 복귀

P9 — 몬스터 스폰 + A5 역할 자동 결정
보이는 것: 밤 늑대 무리, 시민 역할 배지/전직 토스트

시스템: 성역 경계 페널티, RoleScore(+20%/120s 전직)

DoD: 위협↑ 시 경비 증가·평시 생산 증가

P10 — 영웅 듀오·전투 + 성자 치유/정화
보이는 것: 방패+궁수 콤보, 히트/치유 이펙트

시스템: 피해/저항/상태, 영웅 스킬 2~3, 성자 기적 2종

DoD: 소규모 레이드 방어 성공(TTK 6~10s)

P11 — 시장/교역소 + 가격·재고 게시판 (T1)
보이는 것: 플립 보드, ▲/▼, 부족 경고 링

시스템: economy.json(Base/Desired/Fees), SettlementPrice

DoD: 재고 변동→가격 즉시 반영

P12 — 계약 & 캐러밴 편성/출발 (T2~T3)
보이는 것: 계약 카드 타이머, 체결 시 코인 흐름, 수레/노새 적재/출발

시스템: contracts.json, 수수료 정산, 캐러밴 슬롯/구성

DoD: 계약→왕복→재고/코인 변동

P13 — 노선 점수 & 노선 시각화 (T4)
보이는 것: 점선 노선(두께=이익, 색=위험), 툴팁(수지/소요)

시스템: (Profit-Risk-Time)×EdictTrade, 위험 지도

DoD: 전언/도로 변경→노선 선택 즉시 변동

P14 — 외부 정착지 & 교역 이벤트 (T5)
보이는 것: 외부 타운·떠돌이 상단, 초록/빨강 효과

시스템: 외부 상인 테이블, 덤핑/품귀/세금/약탈 이벤트

DoD: 이벤트에 따른 가격·노선·이익 요동

P15 — 흐름 레이어 & 통합 쇼케이스 (T6 + 종합)
보이는 것: 자원/코인 스트림라인, 프리셋 3장면(채집/전시/무역)

시스템: 텔레메트리 집계, 프리셋 저장/로드

DoD: 1~2분 데모로 전체 루프를 한눈에 이해

Ⅲ. 데이터·ECS·검증(실행 규칙)
A. 데이터 팩 & 스키마
/data/schema: item/building/node/skill/edict/tech/economy/manifest

/data/packs/core: items.json, buildings.json, nodes.json, skills.json, edicts.json, tech.json, economy.json, constants.json

검증: Ajv/Zod → ID 고유성/참조 무결성/범위 체크, 실패 시 CI 중단

B. ECS 핵심 컴포넌트
C_Human{attrs,derived,traits,aptitudes,skills,role,fatigue,mood,equipment,job}

C_Sanctum{center,radius,upkeep,rangedMitigation}

C_Node{type,capMax,capNow,regenPerDay,slots{soft,hard}}

C_Workplace{workstations{soft,hard},recipes,effects}

C_Edict{domain,tag,mult,ttl,decay} / C_Target{pos|entityId,expires}

C_Economy{prices,desired,fees} / C_Contract{kind,item,qty,limit,expires}

C. 시스템 모듈
SanctumSystem, FogOfWarSystem, NodeRegenSystem, ReservationSystem, JobPlannerSystem, RoleSystem, EdictSystem, RoadPlannerSystem, CombatSystem, TradeSystem, SaveLoadSystem

D. 품질 가드 & 테스트
성능: Tri < 150k, DrawCalls < 350, 텍스처 < 128MB

단위: 노드 재생/쿼터, 전언 감쇠, 가격 계산, 성역 경계 페널티

통합: 예약 경합, 전시 히스테리시스, 세이브/로드 무결성

플레이: 20·60·120분 시나리오(생존/방어/위성 성역)

