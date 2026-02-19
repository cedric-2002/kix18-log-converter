// public/modal.js
// Global: window.KixModal.{alert,confirm,prompt,error}

(function(){
  let root, titleEl, subEl, bodyEl, actionsEl, iconEl;
  let resolver = null;

  function qs(id){ return document.getElementById(id); }

  async function ensureLoaded(){
    if (root) return;

    // modal.html laden und ans body hängen
    const res = await fetch('/modal.html', { cache: 'no-store' });
    const html = await res.text();
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    root = qs('kixModalRoot');
    titleEl = qs('kixModalTitle');
    subEl = qs('kixModalSub');
    bodyEl = qs('kixModalBody');
    actionsEl = qs('kixModalActions');
    iconEl = qs('kixModalIcon');

    // close handlers
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.kixClose === '1') close(null);
    });

    document.addEventListener('keydown', (e) => {
      if (root?.getAttribute('aria-hidden') === 'false' && e.key === 'Escape') close(null);
    });
  }

  function open(){
    root.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
  }

  function close(value){
    root.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    const r = resolver;
    resolver = null;
    if (r) r(value);
  }

  function setIcon(type){
    // simple icons (no dependency). If you want FA icons inside: put <i ...> here.
    const map = {
      info: 'i',
      warn: '!',
      danger: '!',
      ok: '✓',
      error: '✕'
    };
    iconEl.textContent = map[type] || 'i';

    // color tint
    const bg = {
      info: 'rgba(47,111,237,.16)',
      warn: 'rgba(255,255,255,.10)',
      danger: 'rgba(224,82,62,.16)',
      ok: 'rgba(121,192,0,.16)',
      error: 'rgba(224,82,62,.16)'
    }[type] || 'rgba(47,111,237,.16)';
    iconEl.style.background = bg;
  }

  function button(label, cls, value, focus=false){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `kix-btn ${cls || ''}`.trim();
    b.textContent = label;
    b.addEventListener('click', () => close(value));
    if (focus) setTimeout(()=>b.focus(), 0);
    return b;
  }

  async function show({ title, sub='', html='', actions=[], icon='info', onOpen }){
    await ensureLoaded();

    titleEl.textContent = title || '';
    subEl.textContent = sub || '';
    subEl.style.display = sub ? 'block' : 'none';

    bodyEl.innerHTML = html || '';
    actionsEl.innerHTML = '';
    setIcon(icon);

    open();

    return new Promise((resolve) => {
      resolver = resolve;
      for (const a of actions) actionsEl.appendChild(a);
      if (typeof onOpen === 'function') onOpen();
    });
  }

  async function alert(msg, { title='Hinweis', sub='', icon='info', okText='OK' } = {}){
    return show({
      title, sub, icon,
      html: `<p>${escapeHtml(msg)}</p>`,
      actions: [button(okText, 'primary', true, true)]
    });
  }

  async function error(msg, { title='Fehler', sub='', okText='OK' } = {}){
    return show({
      title, sub, icon: 'error',
      html: `<p>${escapeHtml(msg)}</p>`,
      actions: [button(okText, 'danger', true, true)]
    });
  }

  async function confirm(msg, { title='Bestätigen', sub='', icon='warn', okText='OK', cancelText='Abbrechen', danger=false } = {}){
    return show({
      title, sub, icon: danger ? 'danger' : icon,
      html: `<p>${escapeHtml(msg)}</p>`,
      actions: [
        button(cancelText, '', false, false),
        button(okText, danger ? 'danger' : 'primary', true, true)
      ]
    });
  }

  async function prompt(msg, { title='Eingabe', sub='', icon='info', okText='Speichern', cancelText='Abbrechen', value='' } = {}){
    let input;
    const result = await show({
      title, sub, icon,
      html: `
        <p>${escapeHtml(msg)}</p>
        <input id="kixPromptInput" type="text" value="${escapeHtmlAttr(value)}" />
      `,
      actions: [
        button(cancelText, '', null, false),
        button(okText, 'primary', '__OK__', true)
      ],
      onOpen(){
        input = document.getElementById('kixPromptInput');
        if (input) {
          input.focus();
          input.select();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') close('__OK__');
          });
        }
      }
    });

    if (result !== '__OK__') return null;
    return input ? input.value : null;
  }

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }
  function escapeHtmlAttr(s){
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  window.KixModal = { alert, confirm, prompt, error };
})();
