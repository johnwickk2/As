const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

let mainWindow;
const outputDir = path.join(app.getPath("videos"), "AI TikTok Studio");
const workDir = path.join(app.getPath("temp"), "ai-tiktok-studio-work");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

function send(type, message) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("job-log", { type, message });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040, height: 780, minWidth: 850, minHeight: 650,
    backgroundColor: "#10131b",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

function safeName(s) {
  return String(s || "tiktok-video").normalize("NFKD").replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "_").slice(0, 48) || "tiktok-video";
}
async function openaiRequest(apiKey, endpoint, body) {
  const res = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `OpenAI API error ${res.status}`);
  return data;
}
async function generateScript(apiKey, model, topic) {
  const prompt = `Tạo kịch bản TikTok tiếng Việt cho video dọc CHÍNH XÁC 15 giây.
Chủ đề: ${topic || "Tự chọn một chủ đề evergreen có khả năng khơi gợi tò mò, hữu ích và dễ hiểu"}.
Không bịa số liệu, không giả tin nóng, không dùng tuyên bố y tế/tài chính thiếu căn cứ.
Lời đọc khoảng 35-45 từ, nhịp nhanh, tự nhiên.
Trả về JSON hợp lệ, không markdown, theo schema:
{"title":"...","narration":"...","pexels_query":"English search keywords","captions":[{"start":0,"end":3,"text":"..."},{"start":3,"end":7,"text":"..."},{"start":7,"end":12,"text":"..."},{"start":12,"end":15,"text":"..."}],"description":"...","hashtags":["#...","#...","#..."]}`;
  const data = await openaiRequest(apiKey, "responses", {
    model: model || "gpt-5.5",
    input: prompt
  });
  let output = data.output_text;
  if (!output && data.output) {
    output = data.output.flatMap(x => x.content || []).map(x => x.text || "").join("");
  }
  output = String(output || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(output);
  if (!parsed.title || !parsed.narration || !Array.isArray(parsed.captions)) throw new Error("AI trả về kịch bản không đúng định dạng.");
  return parsed;
}
async function downloadStock(apiKey, query, dest) {
  const search = async q => {
    const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=10`, {
      headers: { Authorization: apiKey }
    });
    if (!res.ok) throw new Error(`Pexels API lỗi ${res.status}. Kiểm tra API key.`);
    return (await res.json()).videos || [];
  };
  let videos = await search(query || "cinematic abstract");
  if (!videos.length) videos = await search("cinematic abstract background");
  const files = videos.flatMap(v => (v.video_files || []).filter(f => f.file_type === "video/mp4" && f.width >= 720).map(f => ({ area: f.width*f.height, link: f.link, source: v.url })));
  files.sort((a,b) => b.area-a.area);
  if (!files.length) throw new Error("Không tìm được video stock phù hợp.");
  const response = await fetch(files[0].link);
  if (!response.ok) throw new Error("Không tải được video stock.");
  fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
  return files[0].source;
}
async function generateVoice(apiKey, text, dest, voice) {
  const data = await openaiRequest(apiKey, "audio/speech", {
    model: "gpt-4o-mini-tts",
    voice: voice || "alloy",
    input: text,
    instructions: "Speak Vietnamese naturally, energetic, clear, with short-form social video pacing.",
    response_format: "mp3"
  });
  // audio/speech returns binary, so request separately below; this helper is not used.
}
async function createSpeech(apiKey, text, dest, voice) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: voice || "alloy",
      input: text,
      instructions: "Speak Vietnamese naturally, engaging and clear. Use lively short-form video pacing.",
      response_format: "mp3"
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI TTS lỗi ${res.status}`);
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}
function ffmpegPath() {
  // ffmpeg.exe is bundled by the GitHub Actions build workflow.
  const bundled = path.join(process.resourcesPath, "ffmpeg.exe");
  if (fs.existsSync(bundled)) return bundled;
  return "ffmpeg";
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2500) || `FFmpeg exit ${code}`)));
  });
}
function escDraw(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%").replace(/,/g, "\\,").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
async function render(video, audio, captions, output) {
  const filters = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "setsar=1", "eq=contrast=1.06:saturation=1.12"];
  for (const cap of captions.slice(0, 6)) {
    const text = escDraw(cap.text || "");
    const start = Math.max(0, Number(cap.start) || 0);
    const end = Math.min(15, Number(cap.end) || 15);
    if (!text) continue;
    filters.push(`drawtext=text='${text}':font='Arial':fontcolor=white:fontsize=60:borderw=4:bordercolor=black:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h*0.72-text_h/2:enable='between(t,${start},${end})'`);
  }
  await runFfmpeg([
    "-y", "-stream_loop", "-1", "-i", video, "-i", audio,
    "-vf", filters.join(","),
    "-t", "15", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest",
    "-movflags", "+faststart", output
  ]);
}
ipcMain.handle("get-output-dir", () => outputDir);
ipcMain.handle("open-output", async () => shell.openPath(outputDir));
ipcMain.handle("create-video", async (_event, cfg) => {
  const { openaiKey, pexelsKey, model, topic, voice } = cfg || {};
  if (!openaiKey || !pexelsKey) throw new Error("Bạn cần nhập OpenAI API key và Pexels API key.");
  const id = `${Date.now()}`;
  const stock = path.join(workDir, `${id}-stock.mp4`);
  const audio = path.join(workDir, `${id}-voice.mp3`);
  try {
    send("step", "1/4 • AI đang viết kịch bản...");
    const script = await generateScript(openaiKey, model, topic);
    send("info", `Ý tưởng: ${script.title}`);
    send("step", "2/4 • Đang tìm và tải footage minh họa...");
    const source = await downloadStock(pexelsKey, script.pexels_query, stock);
    send("step", "3/4 • Đang tạo giọng đọc AI...");
    await createSpeech(openaiKey, script.narration, audio, voice);
    send("step", "4/4 • Đang dựng video 15 giây và phụ đề...");
    const output = path.join(outputDir, `${new Date().toISOString().replace(/[:.]/g,"-")}_${safeName(script.title)}.mp4`);
    await render(stock, audio, script.captions, output);
    const metadata = {
      title: script.title, narration: script.narration,
      description: script.description || "",
      hashtags: script.hashtags || [],
      footage_source: source,
      note: "Review factual accuracy and rights before publishing."
    };
    fs.writeFileSync(output.replace(/\.mp4$/i, ".json"), JSON.stringify(metadata, null, 2), "utf8");
    send("done", `Hoàn tất: ${output}`);
    send("caption", `${metadata.description} ${(metadata.hashtags || []).join(" ")}`);
    send("source", `Nguồn footage: ${source}`);
    return { output, metadata };
  } finally {
    for (const f of [stock, audio]) { try { fs.unlinkSync(f); } catch {} }
  }
});
