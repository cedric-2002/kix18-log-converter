
import readline from 'node:readline';
import { Readable } from 'node:stream';

const DEFAULT_COLS = 12;


// Hilfsfunktionen für Zeitspalten
function normalizeDT(s){
  return String(s ?? '')
    .replace(/\s*-\s*/g,'-')
    .replace(/\s*:\s*/g,':')
    .trim();
}

function toISO8601Local(dt){
  const m = String(dt).match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function withTZ(isoNoTZ, { isoMode='default', tzOffset='+00:00' } = {}){
  if (!isoNoTZ) return '';
  if (isoMode === 'default') return `${isoNoTZ}Z`;
  if (isoMode === 'offset')  return `${isoNoTZ}${tzOffset}`;
  return isoNoTZ; // 'none'
}

function convertTimeColumnInPlace(arr, { tsCol=-1, isoMode='default', tzOffset='+00:00' } = {}){
  if (!Array.isArray(arr)) return;
  if (!Number.isInteger(tsCol) || tsCol < 0 || tsCol >= arr.length) return;
  const isoNoTZ = toISO8601Local(normalizeDT(arr[tsCol]));
  if (isoNoTZ) arr[tsCol] = withTZ(isoNoTZ, { isoMode, tzOffset });
}

// Hilfsfunktionen für CSV Parsing
export function detectDelimiterFromSample(sampleText) {
  const lines = sampleText.split(/\r?\n/).filter(Boolean).slice(0, 50);
  if (!lines.length) return { delim: '\t', label: 'Tab (Fallback)' };
  const candidates = ['\t', ',', ';', '|'];
  const scores = new Map();
  for (const d of candidates) {
    const counts = lines.map(l => l.split(d).length).filter(n => n > 1);
    const avg = counts.reduce((a,b)=>a+b,0) / (counts.length || 1);
    const varc = counts.length ? counts.map(x => (x-avg)**2).reduce((a,b)=>a+b,0)/counts.length : 999;
    const coverage = counts.length / lines.length;
    scores.set(d, coverage*0.6 + (avg>1?0.2:0) + (varc<1?0.2:0));
  }
  const best = [...scores.entries()].sort((a,b)=>b[1]-a[1])[0];
  if (!best || best[1] < 0.5) {
    const spaceStable = lines.every(l => l.trim().split(/\s{2,}/).length>1);
    if (spaceStable) return { delim: 'spaces', label: 'Mehrfach-Leerzeichen' };
    return { delim: '\t', label: 'Tab (Fallback)' };
  }
  const labelMap = { '\t':'Tab', ',':'Komma', ';':'Semikolon', '|':'Pipe' };
  return { delim: best[0], label: labelMap[best[0]] || best[0] };
}

function splitByDelim(line, delim) {
  if (delim === 'spaces') return line.trim().split(/\s{2,}/);
  return line.split(delim);
}

// Hilfsfunktion: Zeilen aus Buffer parsen 
export async function previewRowsFromBuffer(
  buffer,
  { delim='auto', limit=200, colCount=0, tsCol=-1, isoMode='default', tzOffset='+00:00' } = {}
){
  const text = buffer.toString('utf8');
  const autod = detectDelimiterFromSample(text);
  const useDelim = delim === 'auto' ? autod.delim : delim;

  const rl = readline.createInterface({ input: Readable.from(text) });
  const rows = [];
  let maxCols = 0;

  for await (const line of rl) {
    if (!line) continue;
    const raw = splitByDelim(line, useDelim);
    maxCols = Math.max(maxCols, raw.length);
    rows.push(raw);
    if (rows.length >= limit) break;
  }

  const keep = colCount && colCount > 0 ? colCount : (maxCols || DEFAULT_COLS);


  const out = rows.map(r => {
    const slice = r.slice(0, keep);
    while (slice.length < keep) slice.push('');
    convertTimeColumnInPlace(slice, { tsCol, isoMode, tzOffset });
    return slice;
  });

  return { rows: out, detected: autod, colCount: keep };
}

// Streaming-Konvertierung zu CSV oder JSON
export async function streamConvertToCSV(
  buffer, res,
  { headers = [], delim = 'auto', csvDelim = ';', colCount = 0, tsCol = -1, isoMode = 'default', tzOffset = '+00:00' } = {}
) {
  const text = buffer.toString('utf8');
  const autod = detectDelimiterFromSample(text);
  const useDelim = delim === 'auto' ? autod.delim : delim;
  const rl = readline.createInterface({ input: Readable.from(text) });

  const keep = colCount && colCount > 0 ? colCount : (headers.length || DEFAULT_COLS);

  const hdr = (headers.length ? headers : Array.from({length: keep}, (_,i)=>`col${i+1}`)).join(csvDelim) + "\n";
  res.write(hdr);

  for await (const line of rl) {
    if (!line) continue;
    const cols = splitByDelim(line, useDelim).slice(0, keep);
    while (cols.length < keep) cols.push(''); 


    convertTimeColumnInPlace(cols, { tsCol, isoMode, tzOffset });

    const esc = cols.map(v => {
      const s = String(v ?? '');
      return /["\n\r,;]/.test(s) || s.includes(csvDelim) ? '"' + s.replace(/"/g,'""') + '"' : s;
    });
    res.write(esc.join(csvDelim) + "\n");
  }
}

// Vorschau-Tabelle
export async function streamConvertToJSON(
  buffer, res,
  { headers = [], delim = 'auto', colCount = 0, tsCol = -1, isoMode = 'default', tzOffset = '+00:00' } = {}
) {
  const text = buffer.toString('utf8');
  const autod = detectDelimiterFromSample(text);
  const useDelim = delim === 'auto' ? autod.delim : delim;
  const rl = readline.createInterface({ input: Readable.from(text) });

  const keep = colCount && colCount > 0 ? colCount : (headers.length || DEFAULT_COLS);
  const keys = headers.length ? headers : Array.from({length: keep}, (_,i)=>`col${i+1}`);

  res.write('[');
  let first = true;

  for await (const line of rl) {
    if (!line) continue;
    const cols = splitByDelim(line, useDelim).slice(0, keep);
    while (cols.length < keep) cols.push('');


    convertTimeColumnInPlace(cols, { tsCol, isoMode, tzOffset });

    const obj = {};
    for (let i=0;i<keep;i++) obj[keys[i]] = cols[i] ?? '';

    if (!first) res.write(',');
    first = false;
    res.write(JSON.stringify(obj));
  }
  res.write(']');
}