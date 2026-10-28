import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { pool } from '../config/db.js';
import { notifyPaymentReminders, reminderMessage, sendReminderEmail } from '../services/paymentReminders.js';

test('date selection, duplicate prevention, retries and renewals without real emails', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE clients (id SERIAL PRIMARY KEY, name TEXT, email TEXT, end_date DATE, is_active BOOLEAN)`);
    const schema = await readFile(new URL('../sql/payment-reminders.sql', import.meta.url), 'utf8');
    await client.query(schema.replace('CREATE TABLE IF NOT EXISTS payment_reminders', 'CREATE TEMP TABLE payment_reminders'));
    await client.query(`INSERT INTO clients (name, email, end_date, is_active) VALUES
      ('Due', 'due@example.com', '2030-01-13', true),
      ('Tomorrow', 'later@example.com', '2030-01-14', true),
      ('Expired', 'expired@example.com', '2030-01-09', true),
      ('No email', NULL, '2030-01-13', true),
      ('Invalid', 'bad', '2030-01-13', true),
      ('Inactive', 'inactive@example.com', '2030-01-13', false),
      ('Retry', 'retry@example.com', '2030-01-13', true)`);
    const db = { connect: async () => ({ query: (...args) => client.query(...args), release() {} }) };
    const now = DateTime.fromISO('2030-01-10T09:00', { zone: 'America/Argentina/Buenos_Aires' });
    const sent = [];
    let fail = true;
    const send = async row => {
      if (row.client_name === 'Retry' && fail) throw Object.assign(new Error('Simulated rejection'), { responseCode: 451 });
      sent.push(row);
      return `test-${row.id}`;
    };
    assert.deepEqual(await notifyPaymentReminders({ db, now, send }), { enabled: true, sent: 1, failed: 1 });
    fail = false;
    assert.equal((await notifyPaymentReminders({ db, now, send })).sent, 1);
    assert.equal((await notifyPaymentReminders({ db, now, send })).sent, 0);
    assert.equal(sent.length, 2);
    assert.match(reminderMessage('Due', '2030-01-13').text, /13\/01\/2030/);
    await client.query("UPDATE clients SET end_date = '2030-02-12' WHERE name = 'Due'");
    const next = DateTime.fromISO('2030-02-09T09:00', { zone: 'America/Argentina/Buenos_Aires' });
    assert.equal((await notifyPaymentReminders({ db, now: next, send })).sent, 1);
    assert.equal(sent.length, 3);
    assert.equal(sent[2].end_date, '2030-02-12');
    await client.query("UPDATE clients SET end_date = '2030-03-14' WHERE name = 'Due'");
    const later = DateTime.fromISO('2030-03-11T09:00', { zone: 'America/Argentina/Buenos_Aires' });
    let attempts = 0;
    const uncertain = async () => { attempts++; throw new Error('SMTP connection lost after DATA'); };
    assert.equal((await notifyPaymentReminders({ db, now: later, send: uncertain })).failed, 1);
    assert.equal((await notifyPaymentReminders({ db, now: later, send: uncertain })).failed, 0);
    assert.equal(attempts, 1);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});

test('Gmail message and rejected sends without connecting to Gmail', async () => {
  const originalUser = process.env.GMAIL_USER;
  process.env.GMAIL_USER = 'primal-test@gmail.com';
  try {
    const reminder = { id: 42, client_name: 'Test', recipient: 'test@example.com', end_date: '2030-01-13' };
    const transport = { sendMail: async message => {
      assert.equal(message.to, 'test@example.com');
      assert.equal(message.from.address, 'primal-test@gmail.com');
      assert.match(message.text, /13\/01\/2030/);
      assert.match(message.html, /cid:primal-logo@gym-pass/);
      assert.equal(message.attachments[0].cid, 'primal-logo@gym-pass');
      return { accepted: [message.to], messageId: message.messageId };
    } };
    assert.equal(await sendReminderEmail(reminder, transport), '<gym-payment-reminder-42@gmail.com>');
    await assert.rejects(sendReminderEmail(reminder, { sendMail: async () => ({ accepted: [] }) }), /no confirmó/);
  } finally {
    if (originalUser === undefined) delete process.env.GMAIL_USER; else process.env.GMAIL_USER = originalUser;
  }
});

test('email greets the member and includes the logo bytes', async () => {
  const message = reminderMessage('<Joel & "Ana">', '2030-01-13');
  assert.match(message.html, /Hola socio!!/);
  assert.ok(!message.html.includes('<Joel'));
  assert.match(message.html, /13\/01\/2030/);
  assert.match(message.text, /^Hola socio!!/);
  assert.ok(!message.subject.toLowerCase().includes('prueba'));
  assert.ok(!message.text.includes('ESTO ES UNA PRUEBA'));
  const logo = await readFile(message.attachments[0].path);
  assert.equal(logo[0], 0xff);
  assert.equal(logo[1], 0xd8);
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  try {
    const result = await transport.sendMail({ from: 'test@example.com', to: 'client@example.com', ...message });
    const mime = result.message.toString();
    assert.match(mime, /multipart\/related/);
    assert.match(mime, /Content-ID: <primal-logo@gym-pass>/);
    assert.match(mime, /Content-Type: image\/jpeg/);
    assert.ok(mime.replace(/\r?\n/g, '').includes(logo.toString('base64')));
  } finally { transport.close(); }
});
