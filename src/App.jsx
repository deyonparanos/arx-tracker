import { useState, useEffect } from "react";

// ================================================================
// ★ Apps Script 배포 후 아래 URL을 교체하세요
// ================================================================
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbz14SmU5Crg0LGhdAMEN6UefQfAsk-IEba6MSHW82v3o3MWCUbcoyLs_CvhXFoQmbHzvQ/exec";
// ================================================================

/* ─── 컬러 시스템 ─── */
const C = {
  bg:          "#F7F7F5",
  surface:     "#FFFFFF",
  border:      "#E5E5E2",
  text:        "#111111",
  textSub:     "#666666",
  textMuted:   "#999999",
  accent:      "#E01F1F",
  accentBg:    "#FFF0F0",
  accentBorder:"#FFCECE",
};

const GC = {
  "신체":      "#3B82F6",
  "스피드":    "#EF4444",
  "민첩성":    "#F97316",
  "심폐지구력":"#8B5CF6",
  "기술":      "#10B981",
  "인지·반응": "#F59E0B",
  "출결":      "#6B7280",
};

const POSITIONS  = ["GK","CB","FB","DM","CM","WM","SS","CF"];
const AGE_GROUPS = ["U-10 이하","U-12"];

const METRICS = [
  { key:"height",        label:"키",                 unit:"cm",   group:"신체",       step:0.1,  hint:"예: 142.5" },
  { key:"weight",        label:"몸무게",              unit:"kg",   group:"신체",       step:0.1,  hint:"예: 38.2" },
  { key:"standing_jump", label:"제자리 멀리뛰기",     unit:"cm",   group:"신체",       step:1,    hint:"예: 145" },
  { key:"sprint_10m",    label:"10m 스프린트",        unit:"초",   group:"스피드",     step:0.01, hint:"예: 2.05" },
  { key:"sprint_20m",    label:"20m 스프린트",        unit:"초",   group:"스피드",     step:0.01, hint:"예: 3.48" },
  { key:"shuttle_10m",   label:"10m 왕복달리기",      unit:"초",   group:"민첩성",     step:0.01, hint:"횟수 고정 후 총 시간" },
  { key:"beep_test",     label:"셔틀런 (비프테스트)", unit:"레벨", group:"심폐지구력", step:0.1,  hint:"예: 7.5" },
  { key:"lifting",       label:"리프팅",              unit:"회",   group:"기술",       step:1,    hint:"1분 최대 횟수" },
  { key:"pass_acc",      label:"패스 성공률",          unit:"%",    group:"기술",       step:1,    hint:"10회 기준" },
  { key:"slalom",        label:"슬라럼 드리블",        unit:"초",   group:"기술",       step:0.01, hint:"코스 완주 시간" },
  { key:"shoot_acc",     label:"슈팅 정확도",          unit:"%",    group:"기술",       step:1,    hint:"10회 기준" },
  { key:"led_reaction",  label:"LED 반응속도",         unit:"ms",   group:"인지·반응",  step:1,    hint:"평균 반응시간" },
  { key:"led_acc",       label:"LED 정확도",           unit:"%",    group:"인지·반응",  step:1,    hint:"히트율" },
  { key:"attendance",    label:"월 출석률",            unit:"%",    group:"출결",       step:1,    hint:"0~100" },
];

const METRIC_GROUPS = ["신체","스피드","민첩성","심폐지구력","기술","인지·반응","출결"];

/* ─── 유틸 ─── */
const todayMonth = () => new Date().toISOString().slice(0,7);
const ageFrom    = dob => dob ? Math.floor((Date.now()-new Date(dob))/(365.25*864e5)) : "-";

/* ─── API 통신 ─── */
async function apiGet(action) {
  const res = await fetch(`${SHEET_API_URL}?action=${action}`);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ─── AI 리포트 ─── */
async function generateReport(player, records) {
  if (!records.length) return "측정 기록이 없습니다.";
  const sorted = [...records].sort((a,b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length-1];
  const oldest = sorted[0];

  const metricsText = METRICS.map(m => {
    const v = latest.data[m.key];
    if (v === undefined || v === "") return null;
    const ov = oldest.data[m.key];
    const diff = (ov !== undefined && ov !== "" && sorted.length > 1)
      ? ` (${sorted.length}개월 전 대비 ${Number(v)>Number(ov)?"+":""}${(Number(v)-Number(ov)).toFixed(2)}${m.unit})`
      : "";
    return `- ${m.label}: ${v}${m.unit}${diff}`;
  }).filter(Boolean).join("\n");

  const prompt = `당신은 스페인 축구 방법론(RFEF, FC Barcelona, LaLiga)을 기반으로 한 한국 유소년 축구 육성 전문가입니다.
ARX FOOTBALL 아카데미의 선수 데이터를 분석하고 한국어로 육성 예측 리포트를 작성해주세요.

[선수 정보]
- 이름: ${player.name}
- 나이: ${ageFrom(player.dob)}세 (${player.ageGroup})
- 포지션: ${player.position}
- 측정 횟수: ${sorted.length}회 (${oldest.month} ~ ${latest.month})

[최근 측정 데이터]
${metricsText}

다음 형식으로 리포트를 작성하세요:

## 종합 평가
(현재 수준과 두드러진 특징 2~3문장)

## 강점 분야
(데이터 기반 상위 역량 2~3가지)

## 개선 우선순위
(집중 개발 필요 항목 2~3가지)

## 포지션 적합도
(${player.position} 기준 데이터 연계 분석)

## 2년 후 성장 예측
(현재 추이와 나이 기반 현실적 예측)

## 코치 훈련 제언
(스페인 방법론 기반 구체적 방향 2~3가지)

데이터가 없는 항목은 언급하지 말고, 전문적이고 명확한 언어로 작성하세요.`;

  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "리포트 생성 실패";
}

/* ══════════════════════════════════════════
   메인 앱
══════════════════════════════════════════ */
export default function App() {
  const [players,  setPlayers]  = useState([]);
  const [records,  setRecords]  = useState({}); // { playerId: [{month, data}] }
  const [view,     setView]     = useState("list");
  const [selId,    setSelId]    = useState(null);
  const [report,   setReport]   = useState({ text:"", loading:false });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  const selPlayer  = players.find(p => p.id === selId) ?? null;
  const selRecords = selId ? (records[selId] ?? []) : [];

  /* 초기 데이터 로드 */
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pRes, rRes] = await Promise.all([
        apiGet("getPlayers"),
        apiGet("getRecords"),
      ]);

      setPlayers(pRes.players ?? []);

      // records를 { playerId: [{month, data}] } 형태로 변환
      const rMap = {};
      (rRes.records ?? []).forEach(r => {
        if (!rMap[r.playerId]) rMap[r.playerId] = [];
        const data = {};
        METRICS.forEach(m => { if (r[m.key] !== undefined && r[m.key] !== "") data[m.key] = r[m.key]; });
        rMap[r.playerId].push({ month: r.month, data });
      });
      setRecords(rMap);
    } catch(e) {
      alert("데이터 로드 실패: " + e.message + "\nApps Script URL을 확인해주세요.");
    }
    setLoading(false);
  }

  async function addPlayer(d) {
    setSaving(true);
    const player = { ...d, id: String(Date.now()) };
    await apiPost({ action:"savePlayer", player });
    setPlayers(prev => [...prev, player]);
    setSaving(false);
    setView("list");
  }

  async function saveRecord(pid, month, data) {
    setSaving(true);
    await apiPost({ action:"saveRecord", record:{ playerId:pid, month, data } });
    setRecords(prev => {
      const arr = prev[pid] ?? [];
      const idx = arr.findIndex(r => r.month === month);
      const updated = idx >= 0
        ? arr.map((r,i) => i===idx ? {month,data} : r)
        : [...arr, {month,data}];
      return { ...prev, [pid]: updated };
    });
    setSaving(false);
    setView("detail");
  }

  async function deletePlayer(id) {
    if (!confirm("선수를 삭제하시겠습니까?")) return;
    setSaving(true);
    await apiPost({ action:"deletePlayer", playerId:id });
    setPlayers(prev => prev.filter(p => p.id !== id));
    setRecords(prev => { const n={...prev}; delete n[id]; return n; });
    setSaving(false);
    setSelId(null);
    setView("list");
  }

  async function handleReport() {
    setView("report");
    setReport({ text:"", loading:true });
    try {
      const text = await generateReport(selPlayer, selRecords);
      setReport({ text, loading:false });
    } catch(e) {
      setReport({ text:"오류: "+e.message, loading:false });
    }
  }

  function goBack() {
    if (view==="report"||view==="input") setView("detail");
    else setView("list");
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
      <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ fontSize:13, color:C.textMuted }}>데이터 불러오는 중...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        input,select,textarea { font-family:inherit; color:${C.text}; }
        input[type=number]::-webkit-inner-spin-button { opacity:0.4; }
        ::placeholder { color:${C.textMuted}; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        button:disabled { opacity:0.35; cursor:not-allowed; }
        .player-row:hover { background:${C.accentBg} !important; border-color:${C.accent} !important; }
      `}</style>

      {/* 헤더 */}
      <header style={{ borderBottom:`1px solid ${C.border}`, padding:"0 20px", height:52, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:C.surface, zIndex:99, boxShadow:"0 1px 0 rgba(0,0,0,0.06)" }}>
        <div onClick={()=>setView("list")} style={{ cursor:"pointer" }}>
          <div style={{ fontSize:15, fontWeight:900, color:C.text, lineHeight:1.2, letterSpacing:-0.5 }}>아르스풋볼</div>
          <div style={{ fontSize:9, fontWeight:500, letterSpacing:2, color:C.textMuted, textTransform:"uppercase" }}>Player Tracker</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {saving && <div style={{ width:16, height:16, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />}
          {view!=="list" && <button onClick={goBack} style={S.ghost}>← 뒤로</button>}
        </div>
      </header>

      <main style={{ maxWidth:600, margin:"0 auto", padding:"24px 16px 80px", animation:"fadeIn 0.2s ease" }}>
        {view==="list"   && <ListView   players={players} records={records} onAdd={()=>setView("add")} onSelect={id=>{setSelId(id);setView("detail");}} onRefresh={loadAll} />}
        {view==="add"    && <AddForm    onSubmit={addPlayer} onCancel={()=>setView("list")} />}
        {view==="detail" && selPlayer && <DetailView  player={selPlayer} records={selRecords} onInput={()=>setView("input")} onReport={handleReport} onDelete={()=>deletePlayer(selId)} />}
        {view==="input"  && selPlayer && <InputForm   player={selPlayer} existingRecords={selRecords} onSave={(m,d)=>saveRecord(selId,m,d)} onCancel={()=>setView("detail")} />}
        {view==="report" && selPlayer && <ReportView  player={selPlayer} report={report} onRegen={handleReport} />}
      </main>
    </div>
  );
}

/* ══ 선수 목록 ══ */
function ListView({ players, records, onAdd, onSelect, onRefresh }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h1 style={{ fontSize:18, fontWeight:800 }}>
          선수 목록&nbsp;<span style={{ color:C.textMuted, fontWeight:400, fontSize:14 }}>{players.length}명</span>
        </h1>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={onRefresh} style={S.ghost}>↻ 새로고침</button>
          <button onClick={onAdd} style={S.primary}>+ 선수 등록</button>
        </div>
      </div>
      {players.length===0
        ? <Empty icon="⚽" text="등록된 선수가 없습니다" sub="위 버튼으로 선수를 등록해주세요" />
        : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {players.map(p => {
              const cnt = (records[p.id]??[]).length;
              return (
                <div key={p.id} className="player-row" onClick={()=>onSelect(p.id)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all 0.15s" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:C.accentBg, border:`1px solid ${C.accentBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color:C.accent }}>{p.position}</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15 }}>{p.name}</div>
                      <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{ageFrom(p.dob)}세 · {p.ageGroup}</div>
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:C.textMuted, marginBottom:2 }}>측정</div>
                    <div style={{ fontSize:22, fontWeight:900, color:cnt>0?C.accent:C.border, lineHeight:1 }}>{cnt}회</div>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

/* ══ 선수 등록 ══ */
function AddForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ name:"", dob:"", position:"CM", ageGroup:"U-12", notes:"" });
  const set = (k,v) => setF(p=>({...p,[k]:v}));
  const ok = f.name.trim().length > 0;
  return (
    <div>
      <h2 style={S.h2}>선수 등록</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Fld label="이름 *"><input style={S.inp} value={f.name} onChange={e=>set("name",e.target.value)} placeholder="홍길동" /></Fld>
        <Fld label="생년월일"><input type="date" style={S.inp} value={f.dob} onChange={e=>set("dob",e.target.value)} /></Fld>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Fld label="연령대"><select style={S.inp} value={f.ageGroup} onChange={e=>set("ageGroup",e.target.value)}>{AGE_GROUPS.map(g=><option key={g}>{g}</option>)}</select></Fld>
          <Fld label="포지션"><select style={S.inp} value={f.position} onChange={e=>set("position",e.target.value)}>{POSITIONS.map(p=><option key={p}>{p}</option>)}</select></Fld>
        </div>
        <Fld label="메모"><textarea style={{...S.inp,height:68,resize:"vertical"}} value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="특이사항" /></Fld>
        <div style={{ display:"flex", gap:8, marginTop:6 }}>
          <button onClick={onCancel} style={{...S.ghost,flex:1}}>취소</button>
          <button onClick={()=>ok&&onSubmit(f)} style={{...S.primary,flex:2}} disabled={!ok}>등록</button>
        </div>
      </div>
    </div>
  );
}

/* ══ 선수 상세 ══ */
function DetailView({ player, records, onInput, onReport, onDelete }) {
  const sorted = [...records].sort((a,b)=>a.month.localeCompare(b.month));
  const latest = sorted[sorted.length-1];
  return (
    <div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:18, marginBottom:18, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:22, fontWeight:900 }}>{player.name}</div>
            <div style={{ color:C.textSub, fontSize:13, marginTop:3 }}>{ageFrom(player.dob)}세 · {player.ageGroup} · {player.position}</div>
            {player.notes && <div style={{ color:C.textMuted, fontSize:12, marginTop:5 }}>{player.notes}</div>}
          </div>
          <div style={{ background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:8, padding:"8px 14px", textAlign:"center", flexShrink:0 }}>
            <div style={{ fontSize:10, color:C.accent, marginBottom:2, fontWeight:600 }}>측정 횟수</div>
            <div style={{ fontSize:26, fontWeight:900, color:C.accent, lineHeight:1 }}>{records.length}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={onInput} style={{...S.primary,flex:1}}>+ 데이터 입력</button>
          {records.length>=1 && <button onClick={onReport} style={{...S.accentBtn,flex:1}}>🤖 AI 리포트</button>}
          <button onClick={onDelete} style={S.danger}>삭제</button>
        </div>
      </div>

      {latest && (
        <div style={{ marginBottom:18 }}>
          <Sec>최근 측정 ({latest.month})</Sec>
          {METRIC_GROUPS.map(group => {
            const items = METRICS.filter(m=>m.group===group && latest.data[m.key]!==undefined && latest.data[m.key]!=="");
            if (!items.length) return null;
            return (
              <div key={group} style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:GC[group], letterSpacing:1, marginBottom:6, textTransform:"uppercase" }}>{group}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
                  {items.map(m=>(
                    <div key={m.key} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:C.textSub }}>{m.label}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:GC[group] }}>{latest.data[m.key]}{m.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {records.length>0 ? (
        <div>
          <Sec>측정 기록</Sec>
          {sorted.slice().reverse().map(r=>{
            const cnt = Object.values(r.data).filter(v=>v!==""&&v!==undefined).length;
            return (
              <div key={r.month} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"11px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <span style={{ fontWeight:600 }}>{r.month}</span>
                <span style={{ fontSize:12, color:C.textMuted }}>{cnt}개 항목 기록됨</span>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty icon="📋" text="측정 기록 없음" sub="데이터를 입력하면 AI 리포트를 생성할 수 있습니다" />
      )}
    </div>
  );
}

/* ══ 데이터 입력 ══ */
function InputForm({ player, existingRecords, onSave, onCancel }) {
  const [month, setMonth] = useState(todayMonth());
  const existing = existingRecords.find(r=>r.month===month);
  const [data, setData] = useState(existing?.data??{});

  function handleMonthChange(m) {
    setMonth(m);
    const rec = existingRecords.find(r=>r.month===m);
    setData(rec?.data??{});
  }
  const set = (k,v) => setData(d=>({...d,[k]:v}));
  const filled = Object.values(data).filter(v=>v!==""&&v!==undefined).length;

  return (
    <div>
      <h2 style={S.h2}>데이터 입력</h2>
      <div style={{ color:C.textSub, fontSize:13, marginBottom:18 }}>{player.name}</div>
      <Fld label="측정 월"><input type="month" style={S.inp} value={month} onChange={e=>handleMonthChange(e.target.value)} /></Fld>
      {existing && <div style={{ background:C.accentBg, border:`1px solid ${C.accentBorder}`, borderRadius:8, padding:"9px 12px", fontSize:12, color:C.accent, margin:"12px 0" }}>⚠️ 이 달의 기록이 있습니다. 저장하면 덮어씁니다.</div>}
      <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:22 }}>
        {METRIC_GROUPS.map(group=>(
          <div key={group}>
            <div style={{ fontSize:10, fontWeight:700, color:GC[group], letterSpacing:1, textTransform:"uppercase", marginBottom:10, paddingBottom:6, borderBottom:`2px solid ${GC[group]}22` }}>{group}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {METRICS.filter(m=>m.group===group).map(m=>(
                <div key={m.key}>
                  <label style={{ fontSize:12, color:C.textSub, display:"block", marginBottom:4 }}>{m.label} <span style={{ color:C.textMuted }}>({m.unit})</span></label>
                  <input type="number" step={m.step} min={0} placeholder={m.hint} value={data[m.key]??""} onChange={e=>set(m.key,e.target.value)} style={S.inp} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginTop:24 }}>
        <button onClick={onCancel} style={{...S.ghost,flex:1}}>취소</button>
        <button onClick={()=>filled>0&&onSave(month,data)} style={{...S.primary,flex:2}} disabled={filled===0}>저장 ({filled}개 항목)</button>
      </div>
    </div>
  );
}

/* ══ AI 리포트 ══ */
function ReportView({ player, report, onRegen }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <h2 style={{...S.h2,marginBottom:4}}>AI 육성 리포트</h2>
          <div style={{ color:C.textSub, fontSize:13 }}>{player.name}</div>
        </div>
        {!report.loading&&report.text && <button onClick={onRegen} style={S.ghost}>재생성</button>}
      </div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, minHeight:280, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        {report.loading ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:220, gap:16 }}>
            <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
            <div style={{ color:C.textMuted, fontSize:13 }}>AI가 분석 중입니다...</div>
          </div>
        ) : (
          <div style={{ fontSize:14, lineHeight:1.85, color:C.text }}>
            {report.text.split("\n").map((line,i)=>{
              if (line.startsWith("## ")) return (
                <div key={i} style={{ fontSize:11, fontWeight:800, color:C.accent, letterSpacing:1, textTransform:"uppercase", marginTop:i===0?0:22, marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
                  {line.replace("## ","")}
                </div>
              );
              return <div key={i} style={{ whiteSpace:"pre-wrap", color:C.textSub }}>{line||"\u00A0"}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 공통 ── */
function Fld({ label, children }) {
  return <div><label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:5, fontWeight:500 }}>{label}</label>{children}</div>;
}
function Sec({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>{children}</div>;
}
function Empty({ icon, text, sub }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 20px" }}>
      <div style={{ fontSize:32, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:14, fontWeight:600, color:C.textSub }}>{text}</div>
      <div style={{ fontSize:12, color:C.textMuted, marginTop:6 }}>{sub}</div>
    </div>
  );
}

const S = {
  inp:      { width:"100%", background:"#F7F7F5", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:14, outline:"none" },
  h2:       { fontSize:18, fontWeight:800, marginBottom:20, color:C.text },
  primary:  { padding:"9px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:C.accent, color:"#fff", fontFamily:"inherit" },
  accentBtn:{ padding:"9px 16px", borderRadius:8, border:`1px solid ${C.accentBorder}`, cursor:"pointer", fontSize:13, fontWeight:700, background:C.accentBg, color:C.accent, fontFamily:"inherit" },
  ghost:    { padding:"9px 16px", borderRadius:8, border:`1px solid ${C.border}`, cursor:"pointer", fontSize:13, fontWeight:600, background:C.surface, color:C.textSub, fontFamily:"inherit" },
  danger:   { padding:"9px 14px", borderRadius:8, border:`1px solid ${C.accentBorder}`, cursor:"pointer", fontSize:13, fontWeight:700, background:C.accentBg, color:C.accent, fontFamily:"inherit" },
};
