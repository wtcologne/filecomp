// api/submit.js  (Node.js Serverless Function auf Vercel)
const path = require("path");

module.exports = async (req, res) => {
  // CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // simple validation
    if (!body || !body.type || !body.participantId) {
      return res.status(400).json({ error: "Bad payload" });
    }

    const {
      SCIEBO_BASE_URL,      // z.B. https://xxxx.sciebo.de
      SCIEBO_USERNAME,      // dein sciebo Benutzername
      SCIEBO_APP_PASSWORD,  // App-Passwort (nicht dein Login-Passwort)
      SCIEBO_TARGET_PATH    // z.B. elo-uploads
    } = process.env;

    if (!SCIEBO_BASE_URL || !SCIEBO_USERNAME || !SCIEBO_APP_PASSWORD || !SCIEBO_TARGET_PATH) {
      return res.status(500).json({ error: "Server not configured" });
    }

    const filename = `${Date.now()}_${body.participantId}_${body.type}.json`;
    const davURL = `${SCIEBO_BASE_URL.replace(/\/+$/,'')}/remote.php/dav/files/${encodeURIComponent(SCIEBO_USERNAME)}/${SCIEBO_TARGET_PATH}/${filename}`;

    const auth = Buffer.from(`${SCIEBO_USERNAME}:${SCIEBO_APP_PASSWORD}`).toString("base64");

    const putRes = await fetch(davURL, {
      method: "PUT",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const text = await putRes.text().catch(()=> "");
      return res.status(502).json({ error: "WebDAV upload failed", status: putRes.status, body: text });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
};
