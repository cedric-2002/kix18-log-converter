import readline from 'node:readline';
import { Readable } from 'node:stream';

const DEFAULT_COLS = 12;


function normalizeDT(s) {
  return String(s ?? '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*:\s*/g, ':')
    .trim();
}


function toISO8601Local_DDMMYYYY(dt) {
  const cleaned = String(dt ?? '')
    .replace(/\s*-\s*/g, '-')   
    .replace(/\s*:\s*/g, ':')   
    .trim();

  const m = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;

  const [, d, mo, y, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}



function toISO8601Local_KIXBracket(dt) {
  const str = String(dt ?? '').trim();

  const m = str.match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/);
  if (!m) return null;

  const [, monStr, dayStr, hh, mm, ss, yyyy] = m;

  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };

  const mo = monthMap[monStr];
  if (!mo) return null;

  const dd = String(Number(dayStr)).padStart(2, '0');
  return `${yyyy}-${mo}-${dd}T${hh}:${mm}:${ss}`;
}

function withTZ(isoNoTZ, { isoMode = 'default', tzOffset = '+00:00' } = {}) {
  if (!isoNoTZ) return '';
  if (isoMode === 'default') return `${isoNoTZ}Z`;
  if (isoMode === 'offset') return `${isoNoTZ}${tzOffset}`;
  return isoNoTZ; 
}


function convertTimeColumnInPlace(arr, { tsCol = -1, isoMode = 'default', tzOffset = '+00:00' } = {}) {
  if (!Array.isArray(arr)) return;
  if (!Number.isInteger(tsCol) || tsCol < 0 || tsCol >= arr.length) return;

  const raw = String(arr[tsCol] ?? '').trim();
  if (!raw) return;

  
  const iso1 = toISO8601Local_DDMMYYYY(normalizeDT(raw));
  if (iso1) {
    arr[tsCol] = withTZ(iso1, { isoMode, tzOffset });
    return;
  }

  
  const iso2 = toISO8601Local_KIXBracket(raw);
  if (iso2) {
    arr[tsCol] = `${iso2}Z`;
  }
}


export function detectDelimiterFromSample(sampleText) {
  const lines = sampleText.split(/\r?\n/).filter(Boolean).slice(0, 50);
  if (!lines.length) return { delim: '\t', label: 'Tab (Fallback)' };

  const candidates = ['\t', ',', ';', '|'];
  const scores = new Map();

  for (const d of candidates) {
    const counts = lines.map(l => l.split(d).length).filter(n => n > 1);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const varc = counts.length
      ? counts.map(x => (x - avg) ** 2).reduce((a, b) => a + b, 0) / counts.length
      : 999;

    const coverage = counts.length / lines.length;
    scores.set(d, coverage * 0.6 + (avg > 1 ? 0.2 : 0) + (varc < 1 ? 0.2 : 0));
  }

  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];

  if (!best || best[1] < 0.5) {
    const spaceStable = lines.every(l => l.trim().split(/\s{2,}/).length > 1);
    if (spaceStable) return { delim: 'spaces', label: 'Mehrfach-Leerzeichen' };
    return { delim: '\t', label: 'Tab (Fallback)' };
  }

  const labelMap = { '\t': 'Tab', ',': 'Komma', ';': 'Semikolon', '|': 'Pipe' };
  return { delim: best[0], label: labelMap[best[0]] || best[0] };
}

function splitByDelim(line, delim) {
  if (delim === 'spaces') return line.trim().split(/\s{2,}/);
  return line.split(delim);
}



function isBracketLogLine(line) {

  if (!line) return false;
  if (!line.startsWith('[')) return false;
  const hits = (line.match(/\]\[/g) || []).length;
  return hits >= 2;
}

function decideLogType(sampleText, requested = 'auto') {
  const req = String(requested || 'auto');

  if (req === 'tabular' || req === 'kix_bracket') return req;


  const lines = sampleText.split(/\r?\n/);
  for (const l of lines) {
    const line = String(l ?? '').trim();
    if (!line) continue;
    return isBracketLogLine(line) ? 'kix_bracket' : 'tabular';
  }
  return 'tabular';
}

function parseKixBracketLine(line) {

  const m = String(line).match(/^\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\s*(.*)$/);
  if (!m) return null;
  const [, ts, level, component, msg] = m;
  return [ts ?? '', level ?? '', component ?? '', msg ?? ''];
}

function defaultHeadersForLogType(logType, keep) {
  if (logType === 'kix_bracket') return ['timestamp', 'level', 'component', 'message'];
  return Array.from({ length: keep }, (_, i) => `col${i + 1}`);
}


export async function previewRowsFromBuffer(
  buffer,
  {
    logType = 'auto',
    delim = 'auto',
    limit = 200,
    colCount = 0,
    tsCol = -1,
    isoMode = 'default',
    tzOffset = '+00:00'
  } = {}
) {
  const text = buffer.toString('utf8');
  const chosenLogType = decideLogType(text, logType);

  // BRACKET LOG
  if (chosenLogType === 'kix_bracket') {
    const rl = readline.createInterface({ input: Readable.from(text) });
    const rows = [];

    for await (const line of rl) {
      if (!line) continue;
      const parsed = parseKixBracketLine(line);
      if (!parsed) continue;

      // fix 4 cols
      const cols = parsed.slice(0, 4);
      while (cols.length < 4) cols.push('');

      const effTsCol = Number.isFinite(Number(tsCol)) && Number(tsCol) >= 0 ? Number(tsCol) : 0;
      convertTimeColumnInPlace(cols, { tsCol: effTsCol, isoMode, tzOffset });

      rows.push(cols);

      if (rows.length >= Number(limit || 200)) break;
    }

    return {
      rows,
      detected: { logType: 'kix_bracket', delim: null, label: 'KIX Bracket-Log' },
      colCount: 4
    };
  }

  // TABULAR 
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
    if (rows.length >= Number(limit || 200)) break;
  }

  const keep = colCount && Number(colCount) > 0 ? Number(colCount) : (maxCols || DEFAULT_COLS);

  const out = rows.map(r => {
    const slice = r.slice(0, keep);
    while (slice.length < keep) slice.push('');
    convertTimeColumnInPlace(slice, { tsCol: Number(tsCol), isoMode, tzOffset });
    return slice;
  });

  return {
    rows: out,
    detected: { ...autod, logType: 'tabular' },
    colCount: keep
  };
}



export async function streamConvertToCSV(
  buffer,
  res,
  {
    logType = 'auto',
    headers = [],
    delim = 'auto',
    csvDelim = ';',
    colCount = 0,
    tsCol = -1,
    isoMode = 'default',
    tzOffset = '+00:00'
  } = {}
) {
  const text = buffer.toString('utf8');
  const chosenLogType = decideLogType(text, logType);

  // BRACKET LOG
  if (chosenLogType === 'kix_bracket') {
    const keep = 4;
    const hdrArr = headers.length ? headers : defaultHeadersForLogType('kix_bracket', keep);
    res.write(hdrArr.join(csvDelim) + '\n');

    const rl = readline.createInterface({ input: Readable.from(text) });
    for await (const line of rl) {
      if (!line) continue;
      const cols0 = parseKixBracketLine(line);
      if (!cols0) continue;

      const cols = cols0.slice(0, keep);
      while (cols.length < keep) cols.push('');

      const effTsCol = Number.isFinite(Number(tsCol)) && Number(tsCol) >= 0 ? Number(tsCol) : 0;
      convertTimeColumnInPlace(cols, { tsCol: effTsCol, isoMode, tzOffset });

      const esc = cols.map(v => {
        const s = String(v ?? '');
        return /["\n\r,;]/.test(s) || s.includes(csvDelim) ? '"' + s.replace(/"/g, '""') + '"' : s;
      });

      res.write(esc.join(csvDelim) + '\n');
    }
    return;
  }

  // TABULAR 
  const autod = detectDelimiterFromSample(text);
  const useDelim = delim === 'auto' ? autod.delim : delim;
  const rl = readline.createInterface({ input: Readable.from(text) });

  const keep = colCount && Number(colCount) > 0 ? Number(colCount) : (headers.length || DEFAULT_COLS);
  const hdrArr = headers.length ? headers : defaultHeadersForLogType('tabular', keep);

  res.write(hdrArr.join(csvDelim) + '\n');

  for await (const line of rl) {
    if (!line) continue;
    const cols = splitByDelim(line, useDelim).slice(0, keep);
    while (cols.length < keep) cols.push('');

    convertTimeColumnInPlace(cols, { tsCol: Number(tsCol), isoMode, tzOffset });

    const esc = cols.map(v => {
      const s = String(v ?? '');
      return /["\n\r,;]/.test(s) || s.includes(csvDelim) ? '"' + s.replace(/"/g, '""') + '"' : s;
    });

    res.write(esc.join(csvDelim) + '\n');
  }
}



export async function streamConvertToJSON(
  buffer,
  res,
  {
    logType = 'auto',
    headers = [],
    delim = 'auto',
    colCount = 0,
    tsCol = -1,
    isoMode = 'default',
    tzOffset = '+00:00'
  } = {}
) {
  const text = buffer.toString('utf8');
  const chosenLogType = decideLogType(text, logType);

  // BRACKET LOG
  if (chosenLogType === 'kix_bracket') {
    const keep = 4;
    const keys = headers.length ? headers : defaultHeadersForLogType('kix_bracket', keep);

    res.write('[');
    let first = true;

    const rl = readline.createInterface({ input: Readable.from(text) });
    for await (const line of rl) {
      if (!line) continue;
      const cols0 = parseKixBracketLine(line);
      if (!cols0) continue;

      const cols = cols0.slice(0, keep);
      while (cols.length < keep) cols.push('');

      convertTimeColumnInPlace(cols, { tsCol: Number(tsCol), isoMode, tzOffset });

      const obj = {};
      for (let i = 0; i < keep; i++) obj[keys[i]] = cols[i] ?? '';

      if (!first) res.write(',');
      first = false;
      res.write(JSON.stringify(obj));
    }

    res.write(']');
    return;
  }

  // TABULAR 
  const autod = detectDelimiterFromSample(text);
  const useDelim = delim === 'auto' ? autod.delim : delim;
  const rl = readline.createInterface({ input: Readable.from(text) });

  const keep = colCount && Number(colCount) > 0 ? Number(colCount) : (headers.length || DEFAULT_COLS);
  const keys = headers.length ? headers : defaultHeadersForLogType('tabular', keep);

  res.write('[');
  let first = true;

  for await (const line of rl) {
    if (!line) continue;
    const cols = splitByDelim(line, useDelim).slice(0, keep);
    while (cols.length < keep) cols.push('');

    convertTimeColumnInPlace(cols, { tsCol: Number(tsCol), isoMode, tzOffset });

    const obj = {};
    for (let i = 0; i < keep; i++) obj[keys[i]] = cols[i] ?? '';

    if (!first) res.write(',');
    first = false;
    res.write(JSON.stringify(obj));
  }

  res.write(']');
}
