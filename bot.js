const { OpenAI } = require("openai");
const tmi = require("tmi.js");
const fs = require("fs");
const path = require("path");

// ====== ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ ======
const REQUIRED_ENV = [
  "OPENROUTER_API_KEY",
  "TWITCH_BOT_USERNAME",
  "TWITCH_OAUTH_TOKEN",
  "TWITCH_CHANNEL",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key] || !process.env[key].trim()) {
    throw new Error(`Не найдена переменная окружения: ${key}`);
  }
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY.trim();
const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME.trim().toLowerCase();
const TWITCH_OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN.trim();
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL.trim().toLowerCase();

// ====== OPENROUTER ======
const openai = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// ====== КАСТОМНЫЕ КОМАНДЫ ======
let customCommands = {};
const commandsFile = path.join(__dirname, "commands.json");

// ====== TWITCH CLIENT ======
const client = new tmi.Client({
  options: {
    debug: true,
  },
  connection: {
    secure: true,
    reconnect: true,
  },
  identity: {
    username: TWITCH_BOT_USERNAME,
    password: TWITCH_OAUTH_TOKEN,
  },
  channels: [TWITCH_CHANNEL],
});

// ====== ВСПОМОГАТЕЛЬНОЕ ======
function sendLongMessage(channel, text, username = "") {
  const safeText = String(text || "").trim();
  if (!safeText) return;

  const prefix = username ? `@${username}, ` : "";
  const limit = 490 - prefix.length;

  const part1 = safeText.slice(0, limit);
  const part2 = safeText.slice(limit, limit * 2);

  client.say(channel, `${prefix}${part1}`);

  if (part2.trim()) {
    setTimeout(() => {
      client.say(channel, `${prefix}${part2}`);
    }, 700);
  }
}

function loadCommands() {
  try {
    if (!fs.existsSync(commandsFile)) {
      customCommands = {};
      fs.writeFileSync(commandsFile, JSON.stringify({}, null, 2), "utf8");
      return;
    }

    const data = fs.readFileSync(commandsFile, "utf8");
    customCommands = JSON.parse(data || "{}");
  } catch (err) {
    console.error("Ошибка загрузки commands.json:", err.message);
    customCommands = {};
  }
}

function saveCommands() {
  try {
    fs.writeFileSync(commandsFile, JSON.stringify(customCommands, null, 2), "utf8");
  } catch (err) {
    console.error("Ошибка сохранения commands.json:", err.message);
  }
}

async function askAI(question) {
  const response = await openai.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Ты чат-бот для Twitch. Отвечай кратко, дружелюбно, максимум в двух абзацах. Без нумерации и длинных списков.",
      },
      {
        role: "user",
        content: question,
      },
    ],
    temperature: 0.6,
    max_tokens: 220,
  });

  return response?.choices?.[0]?.message?.content?.trim() || "";
}

// ====== ЛОГИ ======
client.on("connected", (address, port) => {
  console.log(`Подключено к Twitch IRC: ${address}:${port}`);
});

client.on("disconnected", (reason) => {
  console.error("Отключено от Twitch:", reason);
});

client.on("reconnect", () => {
  console.log("Переподключение...");
});

client.on("join", (channel, username, self) => {
  if (self) {
    console.log(`Бот вошёл в канал ${channel} как ${username}`);
  }
});

// ====== ОСНОВНАЯ ЛОГИКА ======
client.on("message", async (channel, tags, message, self) => {
  if (self) return;
  if (!message || !message.trim()) return;

  const args = message.trim().split(" ");
  const command = (args.shift() || "").toLowerCase();

  if (command === "!бот") {
    const question = args.join(" ").trim();

    if (!question) {
      client.say(channel, `@${tags.username}, задай вопрос после команды!`);
      return;
    }

    client.say(channel, `@${tags.username}, думаю... 🤔`);

    try {
      const reply = await askAI(question);

      if (!reply) {
        client.say(channel, `@${tags.username}, не смог придумать ответ 😢`);
        return;
      }

      sendLongMessage(channel, reply, tags.username);
    } catch (err) {
      console.error("Ошибка OpenRouter:", {
        status: err?.status,
        code: err?.code,
        type: err?.type,
        message: err?.message,
      });

      if (err?.status === 429) {
        client.say(channel, `@${tags.username}, у бота временно закончился лимит 😢`);
      } else {
        client.say(channel, `@${tags.username}, ошибка при получении ответа 😢`);
      }
    }

    return;
  }

  if (["привет", "ку", "приветик"].includes(command)) {
    client.say(channel, `@${tags.username}, привет! DinoDance`);
    return;
  }

  if (command === "!tg") {
    if (tags.mod || tags["user-type"] === "mod" || tags.badges?.broadcaster) {
      const count = Math.min(parseInt(args[0], 10) || 1, 10);

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          client.say(channel, "ТГ КАНАЛ: https://t.me/matritsa_kr1stall");
        }, i * 300);
      }
    } else {
      client.say(channel, `@${tags.username}, тебе нельзя это`);
    }

    return;
  }

  if (command === "!links") {
    if (tags.mod || tags["user-type"] === "mod" || tags.badges?.broadcaster) {
      const count = Math.min(parseInt(args[0], 10) || 1, 5);

      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          client.say(
            channel,
            "Тик-ток: https://www.tiktok.com/@kr1stal_3?_t=ZM-8vBlF9GquFr&_r=1 Ютуб: https://youtube.com/@kr1stall_3?si=_BHMuWNbQ1irpok6"
          );
        }, i * 300);
      }
    } else {
      client.say(channel, `@${tags.username}, тебе нельзя это`);
    }

    return;
  }

  if (command === "!ад") {
    if (tags.mod || tags["user-type"] === "mod" || tags.badges?.broadcaster) {
      const cmdName = args.shift()?.toLowerCase();
      const cmdResponse = args.join(" ").trim();

      if (!cmdName || !cmdName.startsWith("!") || !cmdResponse) {
        client.say(channel, `@${tags.username}, формат: !ад !имя Ответ`);
        return;
      }

      customCommands[cmdName] = cmdResponse;
      saveCommands();
      client.say(channel, `@${tags.username}, команда ${cmdName} добавлена!`);
    } else {
      client.say(channel, `@${tags.username}, тебе нельзя это`);
    }

    return;
  }

  if (command === "!дел") {
    if (tags.mod || tags["user-type"] === "mod" || tags.badges?.broadcaster) {
      const cmdName = args[0]?.toLowerCase();

      if (!cmdName) {
        client.say(channel, `@${tags.username}, укажи команду для удаления`);
        return;
      }

      if (customCommands[cmdName]) {
        delete customCommands[cmdName];
        saveCommands();
        client.say(channel, `@${tags.username}, команда ${cmdName} удалена.`);
      } else {
        client.say(channel, `@${tags.username}, такой команды нет.`);
      }
    } else {
      client.say(channel, `@${tags.username}, тебе нельзя это`);
    }

    return;
  }

  if (customCommands[command]) {
    client.say(channel, customCommands[command]);
    return;
  }

  if (command === "!команды") {
    const keys = Object.keys(customCommands);

    if (keys.length === 0) {
      client.say(channel, `@${tags.username}, пока нет добавленных команд.`);
    } else {
      sendLongMessage(channel, `вот доступные команды: ${keys.join(", ")}`, tags.username);
    }
  }
});

// ====== СТАРТ ======
loadCommands();

client.connect().catch((err) => {
  console.error("Ошибка подключения Twitch:", err);
});