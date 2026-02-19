import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  previewRowsFromBuffer,
  streamConvertToCSV,
  streamConvertToJSON
} from './parser/kixParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});


const PUBLIC_DIR = path.join(__dirname, 'public');
const SAVE_DIR   = path.join(__dirname, 'saved');

if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));
app.use('/save', express.static(SAVE_DIR));
app.use(express.json({ limit: '5mb' }));


app.post('/api/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      logType = 'auto',
      delimiter = 'auto',
      previewRows = 200,
      colCount = 0,
      tsCol = -1,
      isoMode = 'default',
      tzOffset = '+00:00'
    } = req.body || {};

    const out = await previewRowsFromBuffer(req.file.buffer, {
      logType,
      delim: delimiter,
      limit: Number(previewRows) || 200,
      colCount: Number(colCount) || 0,
      tsCol: Number(tsCol),
      isoMode: String(isoMode),
      tzOffset: String(tzOffset)
    });

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Preview failed',
      details: String(e.message || e)
    });
  }
});


app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      logType = 'auto',
      delimiter = 'auto',
      colCount = 0,
      headers = '[]',
      format = 'csv',
      csvDelim = ';',
      outName = 'export',
      tsCol = -1,
      isoMode = 'default',
      tzOffset = '+00:00'
    } = req.body || {};

    let hdrs = [];
    try { hdrs = JSON.parse(headers); } catch {}

    const safeBase = (outName || 'export').replace(/[^a-zA-Z0-9-_.]/g, '_');
    const ext = format === 'json' ? 'json' : 'csv';
    const filename = `${safeBase}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      await streamConvertToJSON(req.file.buffer, res, {
        logType,
        headers: hdrs,
        delim: delimiter,
        colCount: Number(colCount) || 0,
        tsCol: Number(tsCol),
        isoMode: String(isoMode),
        tzOffset: String(tzOffset)
      });
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      await streamConvertToCSV(req.file.buffer, res, {
        logType,
        headers: hdrs,
        delim: delimiter,
        csvDelim,
        colCount: Number(colCount) || 0,
        tsCol: Number(tsCol),
        isoMode: String(isoMode),
        tzOffset: String(tzOffset)
      });
    }

    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Convert failed',
        details: String(e.message || e)
      });
    } else {
      res.end();
    }
  }
});


app.post('/api/save', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      logType = 'auto',
      delimiter = 'auto',
      colCount = 0,
      headers = '[]',
      format = 'csv',
      csvDelim = ';',
      outName = 'export',
      tsCol = -1,
      isoMode = 'default',
      tzOffset = '+00:00'
    } = req.body || {};

    let hdrs = [];
    try { hdrs = JSON.parse(headers); } catch {}

    const safeBase = (outName || 'export').replace(/[^a-zA-Z0-9-_.]/g, '_');
    const ext = format === 'json' ? 'json' : 'csv';
    const filename = `${safeBase}.${ext}`;
    const filepath = path.join(SAVE_DIR, filename);

    const fileStream = fs.createWriteStream(filepath);

    if (format === 'json') {
      await streamConvertToJSON(req.file.buffer, fileStream, {
        logType,
        headers: hdrs,
        delim: delimiter,
        colCount: Number(colCount) || 0,
        tsCol: Number(tsCol),
        isoMode: String(isoMode),
        tzOffset: String(tzOffset)
      });
    } else {
      await streamConvertToCSV(req.file.buffer, fileStream, {
        logType,
        headers: hdrs,
        delim: delimiter,
        csvDelim,
        colCount: Number(colCount) || 0,
        tsCol: Number(tsCol),
        isoMode: String(isoMode),
        tzOffset: String(tzOffset)
      });
    }

    fileStream.end();

    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    res.json({
      message: 'Gespeichert',
      url: `/save/${filename}`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: 'Save failed',
      details: String(e.message || e)
    });
  }
});

// --- Saved files: list / delete / rename ---

function isSafeName(name) {
  // keine Pfade, nur einfache Dateinamen
  if (!name) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.includes('..')) return false;
  return true;
}

app.get('/api/saved', async (_req, res) => {
  try {
    const entries = await fs.promises.readdir(SAVE_DIR, { withFileTypes: true });
    const files = [];

    for (const e of entries) {
      if (!e.isFile()) continue;
      const filename = e.name;
      const filepath = path.join(SAVE_DIR, filename);
      const st = await fs.promises.stat(filepath);

      files.push({
        name: filename,
        size: st.size,
        mtimeMs: st.mtimeMs,
        url: `/save/${filename}`
      });
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    res.json({ files });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'List failed', details: String(e.message || e) });
  }
});

app.delete('/api/saved/:name', async (req, res) => {
  try {
    const name = req.params.name;
    if (!isSafeName(name)) return res.status(400).json({ error: 'Bad filename' });

    const filepath = path.join(SAVE_DIR, name);
    await fs.promises.unlink(filepath);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Delete failed', details: String(e.message || e) });
  }
});

app.post('/api/saved/rename', async (req, res) => {
  try {
    const { from, to } = req.body || {};
    if (!isSafeName(from) || !isSafeName(to)) return res.status(400).json({ error: 'Bad filename' });

    const fromPath = path.join(SAVE_DIR, from);
    const toPath = path.join(SAVE_DIR, to);

    // optional: nicht überschreiben
    if (fs.existsSync(toPath)) return res.status(409).json({ error: 'Target exists' });

    await fs.promises.rename(fromPath, toPath);

    res.json({ ok: true, url: `/save/${to}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Rename failed', details: String(e.message || e) });
  }
});



const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
