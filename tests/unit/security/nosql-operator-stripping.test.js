/**
 * The central request sanitiser (utils/sanitization.js, mounted for every
 * request in app.js) is what keeps user input from becoming MongoDB query
 * operators. CodeQL can't see a global middleware, so it reports each query
 * built from request data; this test pins the protection those alerts rely on.
 */
const express = require('express');
const request = require('supertest');
const { sanitizationMiddleware } = require('../../../utils/sanitization');

const app = express();
app.use(express.json());
app.use(sanitizationMiddleware());
app.all('/echo/:id', (req, res) => res.json({ body: req.body, query: req.query, params: req.params }));

const operatorKeys = (value) => JSON.stringify(value).match(/"\$[a-z]+"\s*:/gi) || [];

describe('MongoDB operators never reach route handlers', () => {
  it('strips operators from JSON bodies, including nested ones, and keeps plain values', async () => {
    const res = await request(app).post('/echo/x').send({
      email: { $gt: '' }, password: { $ne: null }, nested: { role: { $in: ['admin'] } }, list: [{ $where: '1' }], plain: 'fine'
    });
    expect(operatorKeys(res.body.body)).toEqual([]);
    expect(res.body.body.plain).toBe('fine');
  });

  it('query strings stay flat strings (Express 5 simple parser): no operator objects', async () => {
    const res = await request(app).get('/echo/x?status[$ne]=x&email[$gt]=&q=ok');
    for (const v of Object.values(res.body.query)) expect(typeof v).toBe('string');
    expect(res.body.query.q).toBe('ok');
  });

  it('route params are always strings', async () => {
    const res = await request(app).get(`/echo/${encodeURIComponent('{"$ne":null}')}`);
    expect(typeof res.body.params.id).toBe('string');
  });
});
