const els = {
  file:        document.getElementById('file'),
  logType:     document.getElementById('logType'), // <<< NEU (optional)
  delimiter:   document.getElementById('delimiter'),
  previewRows: document.getElementById('previewRows'),
  colCount:    document.getElementById('colCount'),
  outName:     document.getElementById('outName'),
  csvDelim:    document.getElementById('csvDelim'),
  btnSuggest:  document.getElementById('btnSuggest'),
  btnPreview:  document.getElementById('btnPreview'),
  btnCSV:      document.getElementById('btnCSV'),
  btnJSON:     document.getElementById('btnJSON'),
  btnSave:     document.getElementById('btnSave'),
  meta:        document.getElementById('meta'),
  tableWrap:   document.getElementById('tableWrap'),
  tsCol:       document.getElementById('tsCol'),
  isoMode:     document.getElementById('isoMode'),
  tzOffset:    document.getElementById('tzOffset'),
  scrollLeft:  document.getElementById('scrollLeft'),
  scrollRight: document.getElementById('scrollRight')
};

let headers = [];
let lastPreview = { rows: [], colCount: 0, detected: { delim: 'auto', label: '' } };

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Gemeinsame FormData-Grundlage aufbauen
function buildFormDataBase() {
  const fd = new FormData();
  if (!els.file.files[0]) throw new Error('Bitte eine Datei wählen.');
  fd.append('file', els.file.files[0]);
  fd.append('delimiter', els.delimiter.value || 'auto');

  // <<< NEU: Log-Typ (auto/tabular/kix_bracket)
  if (els.logType) fd.append('logType', els.logType.value || 'auto');

  return fd;
}

// Timestamp-Spaltenoptionen neu aufbauen
function rebuildTsColOptions(colCount){
  if (!els.tsCol) return;
  const prev = els.tsCol.value;
  els.tsCol.innerHTML = '<option value="-1">Keine (nicht umwandeln)</option>';
  for (let i=0;i<colCount;i++){
    const label = headers[i] ? `${i} • ${headers[i]}` : `${i} • col${i+1}`;
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = label;
    els.tsCol.appendChild(opt);
  }
  if ([...els.tsCol.options].some(o => o.value === prev)) els.tsCol.value = prev;
}

// Scroll-Buttons initialisieren
function initScrollButtons() {
  const wrap = els.tableWrap;
  const left = els.scrollLeft;
  const right = els.scrollRight;
  if (!wrap || !left || !right) return;

  const STEP = 200;
  function updateButtons(){
    left.disabled  = wrap.scrollLeft <= 0;
    right.disabled = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1;
  }
  left.addEventListener('click',  () => wrap.scrollBy({ left: -STEP, behavior: 'smooth' }));
  right.addEventListener('click', () => wrap.scrollBy({ left:  STEP, behavior: 'smooth' }));

  let holdTimer = null;
  function startHold(dir){
    if (holdTimer) return;
    holdTimer = setInterval(() => wrap.scrollBy({ left: dir * 60, behavior: 'auto' }), 16);
  }
  function stopHold(){ clearInterval(holdTimer); holdTimer = null; }

  left.addEventListener('mousedown',  () => startHold(-1));
  right.addEventListener('mousedown', () => startHold(+1));
  document.addEventListener('mouseup', stopHold);
  left.addEventListener('mouseleave', stopHold);
  right.addEventListener('mouseleave', stopHold);

  wrap.addEventListener('scroll', updateButtons);
  window.addEventListener('resize', updateButtons);
  updateButtons();
}

// Tabelle rendern
function renderTable(rows) {
  const colCount = Number(els.colCount.value || lastPreview.colCount || 0) || (rows[0]?.length || 0);

  if (!headers.length || headers.length !== colCount) {
    headers = Array.from({ length: colCount }, (_, i) => headers[i] || `col${i+1}`);
  }

  let html = '<table><thead><tr>';
  for (let i=0;i<colCount;i++) {
    html += `<th contenteditable data-idx="${i}" title="Zum Umbenennen klicken">${escapeHtml(headers[i])}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const r of rows) {
    html += '<tr>' + r.slice(0, colCount).map(c => `<td>${escapeHtml(String(c ?? ''))}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';

  els.tableWrap.innerHTML = html;

  els.tableWrap.querySelectorAll('th[contenteditable]')?.forEach(th => {
    th.addEventListener('input', () => {
      const i = Number(th.dataset.idx);
      headers[i] = th.textContent.trim() || `col${i+1}`;
    });
  });

  rebuildTsColOptions(colCount);
  initScrollButtons();
}

// Vorschau anfordern
async function doPreview(){
  try {
    const fd = buildFormDataBase();
    fd.append('previewRows', els.previewRows.value || '200');
    fd.append('colCount', els.colCount.value || '0');

    if (els.tsCol)    fd.append('tsCol', els.tsCol.value || '-1');
    if (els.isoMode)  fd.append('isoMode', els.isoMode.value || 'default');
    if (els.tzOffset) fd.append('tzOffset', els.tzOffset.value || '+00:00');

    const res = await fetch('/api/preview', { method:'POST', body: fd });
    if (!res.ok) throw new Error('Preview fehlgeschlagen');
    lastPreview = await res.json();

    // <<< NEU: wenn Bracket-Log erkannt → sinnvolle Defaults setzen
    const detectedType = lastPreview?.detected?.logType;
    if (detectedType === 'kix_bracket') {
      // Bracket hat fix 4 Spalten: timestamp, level, component, message
      headers = ['timestamp', 'level', 'component', 'message'];
      els.colCount.value = '4';

      // Timestamp ist Spalte 0 → ISO-Optionen funktionieren sofort
      if (els.tsCol) els.tsCol.value = '0';

      // Delimiter-Auswahl ist irrelevant (optional deaktivieren)
      if (els.delimiter) els.delimiter.disabled = true;
    } else {
      if (els.delimiter) els.delimiter.disabled = false;

      // Wenn colCount nicht gesetzt ist, nimm was der Server liefert
      if (!els.colCount.value || els.colCount.value === '0') {
        els.colCount.value = lastPreview.colCount;
      }
    }

    renderTable(lastPreview.rows);

    if (els.meta) {
      const d = lastPreview.detected || { label:'-', delim:'auto' };
      const typeLabel = d.logType ? `, Typ: <b>${escapeHtml(d.logType)}</b>` : '';
      els.meta.innerHTML =
        `Erkannt: <b>${escapeHtml(d.label || '-')}</b> (${escapeHtml(d.delim || '-')})${typeLabel} — ` +
        `Zeilen: ${lastPreview.rows?.length ?? 0}, Spalten: ${els.colCount.value}`;
    }
  } catch (e) {
    if (els.meta) els.meta.textContent = 'Fehler: ' + e.message;
    console.error(e);
  }
}

// Konvertierung anstoßen
async function doConvert(format){
  try {
    if (!els.file.files[0]) return alert('Bitte zuerst eine Datei wählen.');
    const fd = buildFormDataBase();

    fd.append('colCount', els.colCount.value || '0');
    fd.append('format', format);
    fd.append('csvDelim', els.csvDelim.value || ';');
    fd.append('outName', els.outName.value || 'export');
    fd.append('headers', JSON.stringify(headers));

    if (els.tsCol)    fd.append('tsCol', els.tsCol.value || '-1');
    if (els.isoMode)  fd.append('isoMode', els.isoMode.value || 'default');
    if (els.tzOffset) fd.append('tzOffset', els.tzOffset.value || '+00:00');

    const res = await fetch('/api/convert', { method:'POST', body: fd });
    if (!res.ok) {
      const t = await res.text();
      return alert('Konvertierung fehlgeschlagen: ' + t);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${els.outName.value || 'export'}.${format}`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  } catch (e) {
    alert('Fehler: ' + e.message);
  }
}

// Datei speichern
async function doSave(){
  try {
    if (!els.file.files[0]) return alert('Bitte zuerst eine Datei wählen.');
    const fd = buildFormDataBase();

    fd.append('colCount', els.colCount.value || '0');
    fd.append('csvDelim', els.csvDelim.value || ';');
    fd.append('outName', els.outName.value || 'export');
    fd.append('headers', JSON.stringify(headers));
    fd.append('tsCol',    els.tsCol?.value || '-1');
    fd.append('isoMode',  els.isoMode?.value || 'default');
    fd.append('tzOffset', els.tzOffset?.value || '+00:00');

    // Save ist aktuell nur CSV in deiner UI
    fd.append('format', 'csv');

    const res = await fetch('/api/save', { method:'POST', body: fd });
    if (!res.ok) {
      const t = await res.text();
      return alert('Speichern fehlgeschlagen: ' + t);
    }
    const data = await res.json();
    els.meta.innerHTML = `Gespeichert – abrufbar unter <a target="_blank" href="${data.url}">${location.origin}${data.url}</a>`;
  } catch (e) {
    alert('Fehler: ' + e.message);
  }
}

if (els.btnSuggest) {
  els.btnSuggest.addEventListener('click', () => {
    headers = [
      'Time','Log-Level','pid','backendPID','service','duration','backendTimeTillExecution',
      'backendDurationTotal','requestMethod','httpStatus','requestSize',
      'ressource','parameters'
    ];
    els.colCount.value = String(headers.length);
    renderTable(lastPreview.rows || []);
  });
}

if (els.btnPreview) els.btnPreview.addEventListener('click', doPreview);
if (els.btnCSV)     els.btnCSV.addEventListener('click', () => doConvert('csv'));
if (els.btnJSON)    els.btnJSON.addEventListener('click', () => doConvert('json'));
if (els.btnSave)    els.btnSave.addEventListener('click', () => doSave());

els.file.addEventListener('change', () => {
  if (!els.outName.value || els.outName.value === 'http-request') {
    const f = els.file.files[0]?.name || '';
    els.outName.value = f.replace(/\.(log|txt|csv|tsv)$/i, '') || 'export';
  }
  doPreview();
});

['delimiter','previewRows','colCount'].forEach(id => {
  const el = els[id];
  if (!el) return;
  el.addEventListener('change', () => {
    if (els.file.files[0]) doPreview();
  });
});

// <<< NEU: LogType Änderung triggert Preview
if (els.logType) {
  els.logType.addEventListener('change', () => {
    if (els.file.files[0]) doPreview();
  });
}

['tsCol','isoMode','tzOffset'].forEach(id => {
  const el = els[id];
  if (!el) return;
  el.addEventListener('change', () => {
    if (els.file.files[0]) doPreview();
  });
});
