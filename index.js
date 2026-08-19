import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';

// Importing the modules
import pairRouter from './pair.js';
import qrRouter from './qr.js';
import authRouter from './auth.js';
import QRCode from 'qrcode';

const app = express();

// Resolve the current directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes — everything lives in index.html now (login + pair/QR + bot status).
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use('/pair', pairRouter);
app.use('/qr', qrRouter);
app.use('/api', authRouter);

app.use(express.static(__dirname, {
    index: false // don't auto-serve index.html for unmatched dirs; the explicit '/' route above handles it
}));

app.listen(PORT, () => {
    console.log(`THANUVA-MD\n\nServer running on http://localhost:${PORT}`);
});

export default app;
