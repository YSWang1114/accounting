const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const dataDir = path.join(root, "data");
const roomsFile = path.join(dataDir, "rooms.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const fallbackRoom = {
  people: ["小安", "小美", "阿哲"],
  expenses: [
    {
      id: randomUUID(),
      title: "晚餐",
      payments: [
        { person: "小安", amount: 1000 },
        { person: "小美", amount: 680 },
      ],
      shares: [
        { person: "小安", amount: 560 },
        { person: "小美", amount: 560 },
        { person: "阿哲", amount: 560 },
      ],
      createdAt: new Date().toISOString(),
    },
  ],
  repayments: [
    {
      id: randomUUID(),
      from: "阿哲",
      to: "小安",
      amount: 300,
      date: new Date().toISOString(),
    },
  ],
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`Split bill server running at http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const rooms = await readRooms();
    const id = randomUUID().slice(0, 8);
    rooms[id] = createRoom();
    await writeRooms(rooms);
    sendJson(res, 201, { id });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "rooms" || !parts[2]) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const roomId = sanitizeRoomId(parts[2]);
  const rooms = await readRooms();
  if (!rooms[roomId]) {
    rooms[roomId] = createRoom();
    await writeRooms(rooms);
  }
  const room = rooms[roomId];

  if (req.method === "GET" && parts.length === 3) {
    sendJson(res, 200, room);
    return;
  }

  if (req.method === "POST" && parts[3] === "reset") {
    rooms[roomId] = { people: [], expenses: [], repayments: [] };
    await writeRooms(rooms);
    sendJson(res, 200, rooms[roomId]);
    return;
  }

  if (req.method === "POST" && parts[3] === "people") {
    const body = await readBody(req);
    const name = cleanText(body.name);
    if (!name) return sendJson(res, 400, { error: "Name is required" });
    if (!room.people.includes(name)) room.people.push(name);
    await writeRooms(rooms);
    sendJson(res, 201, room);
    return;
  }

  if (req.method === "DELETE" && parts[3] === "people" && parts[4]) {
    const name = decodeURIComponent(parts[4]);
    room.people = room.people.filter((person) => person !== name);
    room.expenses = room.expenses
      .map((expense) => ({
        ...expense,
        payments: expense.payments.filter((payment) => payment.person !== name),
        shares: expense.shares.filter((share) => share.person !== name),
      }))
      .filter((expense) => expense.payments.length > 0 && expense.shares.length > 0);
    room.repayments = room.repayments.filter((repayment) => repayment.from !== name && repayment.to !== name);
    await writeRooms(rooms);
    sendJson(res, 200, room);
    return;
  }

  if (req.method === "POST" && parts[3] === "expenses") {
    const body = await readBody(req);
    const expense = normalizeExpense(body, room.people);
    if (!expense) return sendJson(res, 400, { error: "Invalid expense" });
    room.expenses.push(expense);
    await writeRooms(rooms);
    sendJson(res, 201, room);
    return;
  }

  if (req.method === "DELETE" && parts[3] === "expenses" && parts[4]) {
    room.expenses = room.expenses.filter((expense) => expense.id !== parts[4]);
    await writeRooms(rooms);
    sendJson(res, 200, room);
    return;
  }

  if (req.method === "POST" && parts[3] === "repayments") {
    const body = await readBody(req);
    const repayment = normalizeRepayment(body, room.people);
    if (!repayment) return sendJson(res, 400, { error: "Invalid repayment" });
    room.repayments.push(repayment);
    await writeRooms(rooms);
    sendJson(res, 201, room);
    return;
  }

  if (req.method === "DELETE" && parts[3] === "repayments" && parts[4]) {
    room.repayments = room.repayments.filter((repayment) => repayment.id !== parts[4]);
    await writeRooms(rooms);
    sendJson(res, 200, room);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function createRoom() {
  return JSON.parse(JSON.stringify(fallbackRoom));
}

async function readRooms() {
  try {
    return JSON.parse(await fs.readFile(roomsFile, "utf8"));
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    return {};
  }
}

async function writeRooms(rooms) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(roomsFile, JSON.stringify(rooms, null, 2), "utf8");
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function normalizeExpense(body, people) {
  const payments = normalizeAmounts(body.payments, people);
  const shares = normalizeAmounts(body.shares, people);
  const totalPaid = total(payments);
  const totalShares = total(shares);
  if (!payments.length || !shares.length || Math.round(totalPaid) !== Math.round(totalShares)) return null;
  return {
    id: randomUUID(),
    title: cleanText(body.title) || "未命名花費",
    payments,
    shares,
    createdAt: new Date().toISOString(),
  };
}

function normalizeRepayment(body, people) {
  const from = cleanText(body.from);
  const to = cleanText(body.to);
  const amount = Number(body.amount);
  if (!people.includes(from) || !people.includes(to) || from === to || amount <= 0) return null;
  return { id: randomUUID(), from, to, amount: Math.round(amount), date: new Date().toISOString() };
}

function normalizeAmounts(items, people) {
  if (!Array.isArray(items)) return [];
  const totals = new Map();
  items.forEach((item) => {
    const person = cleanText(item.person);
    const amount = Number(item.amount);
    if (!people.includes(person) || amount <= 0) return;
    totals.set(person, (totals.get(person) || 0) + amount);
  });
  return [...totals.entries()].map(([person, amount]) => ({ person, amount: Math.round(amount) }));
}

function total(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 80);
}

function sanitizeRoomId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || randomUUID().slice(0, 8);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
