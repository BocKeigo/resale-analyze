import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import demo from './demo.json';
import './style.css';

const categories = ['ゲーム','トレカ','フィギュア','書籍・漫画','限定品'];
const icons = ['🎮','✦','♟','▤','◇'];
type Sale = {price:number; confirmedAt:string; soldAt:string; listingUrl:string; shipping:number; cost:number|null};
type Product = {id:number; name:string; category:string; edition:string; retail:number; evidence:string; officialUrl:string; source:string; sales:Sale[]};
const yen = (n:number) => '¥'+n.toLocaleString('ja-JP');
const signed = (n:number) => (n>=0?'+':'−')+yen(Math.abs(n));
const profit = (p:Product,s:Sale) => s.price-Math.floor(s.price/10)-s.shipping-(s.cost??p.retail);
const date = (s:string) => new Date(s).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'});
const effectiveDate = (sale:Sale) => Date.parse(sale.soldAt || sale.confirmedAt);
const ordered = (p:Product) => [...p.sales].sort((a,b)=>effectiveDate(b)-effectiveDate(a));
const storage = 'resale-finder-manual-v1';
const offline = new URLSearchParams(location.search).has('demo') || location.protocol === 'file:';

function App(){
  const [manual,setManual] = useState<Product[]>([]);
  const [local,setLocal] = useState(offline);
  const [ready,setReady] = useState(offline);
  const [error,setError] = useState('');
  const [query,setQuery] = useState('');
  const [cat,setCat] = useState('');
  const [source,setSource] = useState('demo');
  const [sort,setSort] = useState('差額が大きい順');
  const [only,setOnly] = useState(true);
  const [selected,setSelected] = useState<number|null>(null);
  const [form,setForm] = useState(false);
  const [productId,setProductId] = useState('');
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState('');
  useEffect(()=>{
    if(offline){try{setManual(JSON.parse(localStorage.getItem(storage)||'[]'));}catch{setError('端末の保存データを読み込めませんでした。');} return;}
    fetch('/api/products').then(r=>{if(!r.ok)throw Error();return r.json();}).then(rows=>{if(!Array.isArray(rows))throw Error();setManual(rows);setReady(true);}).catch(()=>{setLocal(true);setReady(true);try{setManual(JSON.parse(localStorage.getItem(storage)||'[]'));}catch{setError('端末の保存データを読み込めませんでした。');}});
  },[]);
  const products:Product[]=source==='demo'?demo:manual;
  const matches=products.filter(p=>(!cat||p.category===cat)&&[p.name,p.edition,p.category].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const qualifying=matches.filter(p=>ordered(p)[0].price>p.retail);
  const visible=(only?qualifying:matches).slice().sort((a,b)=>sort==='新しい順'?effectiveDate(ordered(b)[0])-effectiveDate(ordered(a)[0]):sort==='推定利益が大きい順'?profit(b,ordered(b)[0])-profit(a,ordered(a)[0]):(ordered(b)[0].price-b.retail)-(ordered(a)[0].price-a.retail));
  const detail=products.find(p=>p.id===selected);
  const history=detail?ordered(detail):[];
  const maxPremium=qualifying.length?Math.max(...qualifying.map(p=>ordered(p)[0].price-p.retail)):0;

  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    setSaving(true); setError('');
    const f=new FormData(event.currentTarget);
    const str=(key:string)=>String(f.get(key)||'').trim();
    const timestamp=(key:string)=>str(key)?str(key)+':00+09:00':'';
    const sale:Sale={price:Number(str('price')),confirmedAt:timestamp('confirmedAt'),soldAt:timestamp('soldAt'),listingUrl:str('listingUrl'),shipping:Number(str('shipping')),cost:str('cost')?Number(str('cost')):null};
    const existing=manual.find(p=>String(p.id)===productId);
    const item:Product=existing||{id:Date.now(),name:str('name'),category:str('category'),edition:str('edition'),retail:Number(str('retail')),evidence:str('evidence'),officialUrl:str('officialUrl'),source:'manual',sales:[]};
    try{
      if(!item.name||!item.evidence)throw Error('商品名と定価根拠を入力してください。');
      for(const url of [item.officialUrl,sale.listingUrl])if(url&&!/^https?:\/\//i.test(url))throw Error('URL は https:// または http:// で入力してください。');
      if(sale.listingUrl&&manual.some(p=>p.sales.some(s=>s.listingUrl===sale.listingUrl)))throw Error('同じ取引URLが登録済みです。');
      if(sale.soldAt&&Date.parse(sale.soldAt)>Date.parse(sale.confirmedAt))throw Error('売却日時は売却確認日時以前にしてください。');
      if(local){
        const next=[...manual.filter(p=>p.id!==item.id),{...item,sales:[...item.sales,sale]}];
        localStorage.setItem(storage,JSON.stringify(next)); setManual(next);
      }else{
        const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:existing?.id,product:item,sale,sold:true})});
        const result=await r.json();
        if(!r.ok)throw Error(result.error);
        setManual(rows=>[...rows.filter(p=>p.id!==result.id),result]);
      }
      setForm(false);setSource('manual');setSelected(null);setCat('');setQuery('');setOnly(false);setNotice('売却記録を保存しました。');
    }catch(e){setError(e instanceof Error?e.message:'保存できませんでした。');}
    finally{setSaving(false);}
  }

  return <><header><div className="brand"><span className="logo">↗</span> Resale Finder</div><span className="headerNote">売却実績リサーチ</span><button className="primary" disabled={!ready} onClick={()=>{setForm(true);setSelected(null);setProductId('');setError('');setNotice('');}}>＋ 売却記録を追加</button></header>
  <main><section className="hero"><div className="eyebrow">RESALE INTELLIGENCE</div><h1>売却実績ダッシュボード</h1><p>売却済みの価格を公式定価と比較し、差額と推定利益を確認できます。</p></section>
  <div className="banner"><span className="badge">{source==='demo'?'デモデータ':'手動記録'}</span> {source==='demo'?'商品名・定価・売却履歴は架空のサンプルです。':local?'手動記録はこのブラウザーに保存されます。':'手動記録はアプリのデータベースに保存されます。'}</div>
  {notice&&<p role="status">{notice}</p>}{error&&!form&&<p role="alert">{error}</p>}
  <section className="stats"><article><small>定価超えの商品</small><strong>{qualifying.length}<em> 件</em></strong><span>最新の売却価格で判定</span></article><article><small>最大の定価差額</small><strong className="positive">{signed(maxPremium)}</strong><span>対象商品の最新記録</span></article><article><small>売却記録数</small><strong>{matches.reduce((n,p)=>n+p.sales.length,0)}<em> 件</em></strong><span>現在の検索・カテゴリ内</span></article></section>
  <section className="panel"><div className="panelTitle"><div><h2>商品を探す</h2><p>カテゴリや商品名から売却実績を検索</p></div><div className="segments">{['demo','manual'].map(value=><button key={value} aria-pressed={source===value} onClick={()=>{setSource(value);setSelected(null);setNotice('');}}>{value==='demo'?'デモ':'手動記録'}</button>)}</div></div>
  <div className="filters"><input aria-label="商品を検索" type="search" placeholder="商品名・版・カテゴリで検索" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="並び順" value={sort} onChange={e=>setSort(e.target.value)}>{['差額が大きい順','新しい順','推定利益が大きい順'].map(s=><option key={s}>{s}</option>)}</select></div>
  <div className="chips">{['',...categories].map(c=><button key={c} aria-pressed={cat===c} onClick={()=>setCat(c)}>{c||'すべて'}</button>)}<label className="check"><input type="checkbox" checked={only} onChange={e=>setOnly(e.target.checked)}/>定価超えのみ</label></div>
  <div className="tableWrap"><table><thead><tr><th>商品 / カテゴリ</th><th>公式定価</th><th>最新売却価格</th><th>定価との差額</th><th>推定利益</th><th>売却確認日時（JST）</th></tr></thead><tbody>{visible.map(p=>{const s=ordered(p)[0];return <tr key={p.id}><td><div className="item"><span className={'tile tile'+categories.indexOf(p.category)}>{icons[categories.indexOf(p.category)]}</span><div><button className="productLink" onClick={()=>{setSelected(p.id);setForm(false);}}>{p.name} ↗</button><small>{p.category} · {p.edition||'版の指定なし'}</small></div></div></td><td>{yen(p.retail)}</td><td><b>{yen(s.price)}</b></td><td className={s.price>p.retail?'positive':''}>{signed(s.price-p.retail)}</td><td>{signed(profit(p,s))}</td><td>{date(s.confirmedAt)}</td></tr>;})}</tbody></table>{!visible.length&&<p className="empty">条件に一致する売却記録がありません。</p>}</div>
  <footer>{visible.length} 件表示 <span>推定利益は販売手数料の概算（10%・円未満切り捨て）、送料、仕入額を反映します。仕入額が空欄の場合は定価を使用します。</span></footer></section>
  </main>
  {detail&&<Dialog title={detail.name} close={()=>setSelected(null)}><p>{detail.category} · {detail.edition} · {source==='demo'?'デモデータ':'手動記録'}</p><div className="detailStats"><div>公式定価<strong>{yen(detail.retail)}</strong></div><div>最新売却価格<strong>{yen(history[0].price)}</strong></div><div>推定利益<strong>{signed(profit(detail,history[0]))}</strong></div></div><h3>定価の根拠</h3><p>{detail.evidence}</p>{detail.officialUrl&&<a href={detail.officialUrl} target="_blank" rel="noreferrer">公式商品ページ ↗</a>}<h3>売却価格の推移</h3><Trend sales={history}/><h3>売却履歴</h3><p>売却日時が記録されている場合はその日時を、その他は確認日時を集計に使用します。</p><p>{[7,30,90].map(days=>days+'日 '+history.filter(s=>{const age=(source==='demo'?Date.parse('2026-11-08T23:59:59+09:00'):Date.now())-effectiveDate(s);return age>=0&&age<days*86400000;}).length+'件').join('　·　')}</p><div className="tableWrap"><table><thead><tr><th>状態</th><th>売却価格</th><th>売却日時</th><th>売却確認日時</th><th>根拠</th></tr></thead><tbody>{history.map((s,i)=><tr key={i}><td>売却済み</td><td>{yen(s.price)}</td><td>{s.soldAt?date(s.soldAt):'不明'}</td><td>{date(s.confirmedAt)}</td><td>{s.listingUrl?<a href={s.listingUrl} target="_blank" rel="noreferrer">取引 ↗</a>:'—'}</td></tr>)}</tbody></table></div></Dialog>}
  {form&&<Dialog title="売却記録を追加" close={()=>{if(!saving)setForm(false);}}><p>売却済みを確認した取引を登録します。日時は日本時間で入力してください。</p><form onSubmit={save}><label>登録先<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">新しい商品を登録</option>{manual.map(p=><option key={p.id} value={p.id}>{p.name}{p.edition?' · '+p.edition:''}</option>)}</select></label><div className="fields">
  {!productId&&<><Field label="商品名" name="name" required/><label>カテゴリ<select name="category">{categories.map(c=><option key={c}>{c}</option>)}</select></label><Field label="版・型番" name="edition"/><Field label="公式定価（税込・円）" name="retail" type="number" min={1} required/><Field label="定価の根拠" name="evidence" required/><Field label="公式商品URL（任意）" name="officialUrl" type="url"/></>}
  <Field label="売却価格（円）" name="price" type="number" min={1} required/><Field label="送料（円）" name="shipping" type="number" min={0} defaultValue="0" required/><Field label="仕入額（空欄なら定価）" name="cost" type="number" min={0}/><Field label="売却確認日時（JST）" name="confirmedAt" type="datetime-local" required/><Field label="売却日時（判明時のみ）" name="soldAt" type="datetime-local"/><Field label="取引URL（任意）" name="listingUrl" type="url"/></div><label className="check"><input type="checkbox" required/>売却済みの表示を確認しました</label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={saving}>{saving?'保存中…':'記録を保存'}</button></form></Dialog>}
  </>;
}

function Field({label,...props}:React.InputHTMLAttributes<HTMLInputElement>&{label:string}){
  return <label>{label}<input maxLength={props.type==='url'?2048:300} max={props.type==='number'?100000000:undefined} {...props}/></label>;
}

function Dialog({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){
  const ref=React.useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={e=>{e.preventDefault();close();}}><div className="dialogHead"><h2 id="dialog-title">{title}</h2><button aria-label="閉じる" onClick={close}>×</button></div>{children}</dialog>;
}

function Trend({sales}:{sales:Sale[]}){
  const chronological=[...sales].reverse();
  const low=Math.min(...sales.map(s=>s.price));
  const high=Math.max(...sales.map(s=>s.price));
  const first=effectiveDate(chronological[0]), last=effectiveDate(chronological.at(-1)!);
  const points=chronological.map(s=>[last===first?300:75+490*(effectiveDate(s)-first)/(last-first),high===low?80:134-110*(s.price-low)/(high-low)]);
  return <svg className="chart" viewBox="0 0 600 165" role="img" aria-label="売却価格の時系列グラフ"><path d="M75 24H565 M75 134H565" stroke="#dbe5e1"/><text x="6" y="29">{yen(high)}</text>{low!==high&&<text x="6" y="139">{yen(low)}</text>}<polyline fill="none" stroke="#16866b" strokeWidth="3" points={points.map(p=>p.join(',')).join(' ')}/>{points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5" fill="#16866b"><title>{date(chronological[i].soldAt||chronological[i].confirmedAt)} {yen(chronological[i].price)}</title></circle>)}</svg>;
}
createRoot(document.getElementById('root')!).render(<App/>);
