interface Env {
  SLACK_WEBHOOK_URL: string;
  GCP_SERVICE_ACCOUNT: string; // JSON文字列として
}

const BQ_PROJECT_ID = "melodic-sunbeam-455502-s5";
const BQ_QUERY = `
  SELECT word FROM \`${BQ_PROJECT_ID}.testdataset.dictionary\`
  WHERE created_at BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND CURRENT_TIMESTAMP()
`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      await runScheduler(env);
      return new Response("Slackに送信しました");
    } catch (err) {
      return new Response(`Error: ${err}`, { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      await runScheduler(env);
    } catch (err) {
      console.error("Scheduled error:", err);
    }
  }
};

async function runScheduler(env: Env): Promise<void> {
  const sa = JSON.parse(env.GCP_SERVICE_ACCOUNT);
  const token = await getGoogleAccessToken(sa);
  const words = await runBigQuery(BQ_PROJECT_ID, BQ_QUERY, token);

  const text = words.length > 0
    ? `📘 昨日追加されたワード：\n• ` + words.join("\n• ")
    : "昨日は新しいワードはありませんでした。";

  await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// JWT作成 → アクセストークン取得
async function getGoogleAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));

  const toSign = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    extractPrivateKey(sa.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(toSign));
  const jwt = `${toSign}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const json = await res.json();
  return json.access_token;
}

function extractPrivateKey(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// BigQuery APIを使ってクエリ実行
async function runBigQuery(projectId: string, query: string, token: string): Promise<string[]> {
  const jobRes = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      useLegacySql: false
    })
  });

  const result = await jobRes.json();
  console.log("BigQuery result:", JSON.stringify(result, null, 2));
  return result.rows?.map((row: any) => row.f[0].v) || [];
}

// PEM文字列 → ArrayBuffer（Crypto API用）
function str2ab(str: string): ArrayBuffer {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes.buffer;
}
