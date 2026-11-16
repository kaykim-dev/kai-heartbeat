// 맥 밖 죽은 사람 스위치 (GitHub Actions). 맥이 10분마다 heartbeat 브랜치에 hb.json을 올리고, 이 스크립트가 15분마다 낡았는지 본다.
// 상태는 state 브랜치의 state.json (단일 커밋 강제 푸시). 알림은 슬랙 #케이-카이 한 곳. 비밀값(SLACK_BOT_TOKEN)은 Actions secret.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const CH = 'C0CFGBQUYKC', TOKEN = process.env.SLACK_BOT_TOKEN, TEST = process.env.TEST === 'true';
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const kst = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const now = Date.now(), day = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
let hb = null, st = { down: false, degraded: false, lastAlert: 0, downSince: 0, day, n: 0 };
try { sh('git fetch -q origin heartbeat:refs/remotes/origin/heartbeat'); hb = JSON.parse(sh('git show origin/heartbeat:hb.json')); } catch (e) { console.log('hb 읽기 실패', String(e.message).slice(0, 100)); }
try { sh('git fetch -q origin state:refs/remotes/origin/state'); st = { ...st, ...JSON.parse(sh('git show origin/state:state.json')) }; } catch {}
if (st.day !== day) { st.day = day; st.n = 0; }
const last = hb ? Date.parse(hb.at) : 0, age = last ? Math.round((now - last) / 60e3) : 99999;
const dAge = hb && typeof hb.daemonAgeMin === 'number' ? hb.daemonAgeMin : 0;
const down = age > 30, degraded = !down && dAge > 30;
const post = async (text) => {
  if (!TOKEN) { console.log('SLACK_BOT_TOKEN 없음, 발송 생략:', text); return false; }
  const r = await (await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ channel: CH, text, unfurl_links: false }) })).json();
  console.log('slack', r.ok ? 'ok ' + r.ts : 'fail ' + r.error); return r.ok;
};
const TODO = '형/CX가 할 일: 신규 리드·고객 문자·카톡을 형 폰으로 직접 확인, 맥 전원·덮개·인터넷 확인(전원이 들어오면 자동 따라잡기). 절차: docs/disaster.md';
const send = async (t) => { if (st.n >= 6) { console.log('하루 상한, 생략'); return; } if (await post(t)) { st.n++; st.lastAlert = now; } };
console.log(JSON.stringify({ age, dAge, down, degraded, prev: st.down, test: TEST }));
if (TEST) await send(`[자동 알림] 시험 — 맥 밖 감시 동작 확인. 마지막 맥 신호 ${last ? kst(last) : '없음'} KST(${age}분 전). 실제 이상 아님.`);
else if (down && !st.down) { st.down = true; st.downSince = last || now; await send(`[자동 알림] 맥 응답 없음 ${age}분 (마지막 신호 ${kst(last)} KST). 고객 문자·리드 자동 응답·루틴이 멈춰 있을 수 있습니다. ${TODO}`); }
else if (down && st.down && now - st.lastAlert >= 3 * 3600e3) await send(`[자동 알림] 맥 여전히 응답 없음 ${age}분 (마지막 신호 ${kst(last)} KST). ${TODO}`);
else if (!down && st.down) { st.down = false; await send(`[자동 알림] 맥 복구됨. 멈춰 있던 시간 약 ${Math.max(1, Math.round((last - st.downSince) / 60e3))}분. 밀린 문자·리드·루틴 따라잡기 자동 실행 중.`); }
if (degraded && !st.degraded) { st.degraded = true; await send(`[자동 알림] 맥은 켜져 있지만 문지기 데몬 로그가 ${dAge}분째 멈춤. 고객 문자·리드 감시가 멈췄을 수 있습니다. 자동 재시작 시도 중, 계속되면 맥 확인 필요.`); }
if (!degraded && st.degraded) st.degraded = false;
// 11/16 루틴 스케줄러 정지(next_run_at이 30분 넘게 지남, 11/12 2시간 40분 정지 사고)
const sLag = hb && typeof hb.schedLagMin === 'number' ? hb.schedLagMin : -1;
const schedDown = !down && sLag > 30;
if (schedDown && !st.schedDown) { st.schedDown = true; await send(`[자동 알림] 맥은 켜져 있지만 Aside 루틴 예약 실행이 ${sLag}분째 밀림(스케줄러 정지 의심). 루틴(아침 팔로업·블로그·점검 등)이 안 돌고 있을 수 있습니다. Aside 앱 재시작이 필요할 수 있어요. 절차: docs/disaster.md`); }
if (!schedDown && st.schedDown) st.schedDown = false;
fs.writeFileSync('state.json', JSON.stringify(st));
try { // state 브랜치: 단일 커밋 강제 푸시
  const blob = sh('git hash-object -w state.json').trim(), tree = sh(`printf '100644 blob ${blob}\\tstate.json\\n' | git mktree`).trim();
  const c = sh(`GIT_AUTHOR_NAME=kai GIT_AUTHOR_EMAIL=kai@x GIT_COMMITTER_NAME=kai GIT_COMMITTER_EMAIL=kai@x git commit-tree ${tree} -m state`).trim();
  sh(`git push -q -f origin ${c}:refs/heads/state`); console.log('state saved');
} catch (e) { console.log('state 저장 실패', String(e.message).slice(0, 200)); }
