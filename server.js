import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

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
  limits: { fileSize: 1024 * 1024 * 1024 } 
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const SAVE_DIR = path.join(__dirname, 'saved');

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

    const sink = streamToBufferWriter();

    if (format === 'json') {
      await streamConvertToJSON(req.file.buffer, sink, {
        logType,
        headers: hdrs,
        delim: delimiter,
        colCount: Number(colCount) || 0,
        tsCol: Number(tsCol),
        isoMode: String(isoMode),
        tzOffset: String(tzOffset)
      });
    } else {
      await streamConvertToCSV(req.file.buffer, sink, {
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

    sink.end();
    const outBuf = sink.getBuffer();
    await fs.promises.writeFile(filepath, outBuf);

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

const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
