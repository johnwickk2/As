const $ = id => document.getElementById(id);
const log = (message, cls="") => {
  const row = document.createElement("div");
  row.textContent = message;
  if (cls) row.className = cls;
  $("log").appendChild(row);
  $("log").scrollTop = $("log").scrollHeight;
};
const setState = (s, pct) => {
  $("state").textContent = s.toUpperCase();
  $("bar").style.width = `${pct}%`;
};
for (const id of ["openai","pexels","model","voice"]) {
  const saved = localStorage.getItem("studio_"+id);
  if (saved) $(id).value = saved;
  $(id).addEventListener("change", () => localStorage.setItem("studio_"+id, $(id).value));
}
window.studio.onLog(data => {
  if (data.type === "step") {
    const m = data.message.match(/^(\d)\/4/);
    setState("EN COURS", m ? Number(m[1])*23 : 30);
    log(data.message);
  } else if (data.type === "done") {
    setState("HOÀN TẤT", 100); log(data.message, "good");
    $("result").textContent = "Video đã được lưu vào thư mục Videos/AI TikTok Studio.";
  } else if (data.type === "caption") {
    $("result").textContent += "\nCaption: "+data.message;
  } else if (data.type === "source") {
    log(data.message);
  } else log(data.message, data.type === "error" ? "bad" : "");
});
$("generate").addEventListener("click", async () => {
  const cfg = {
    openaiKey: $("openai").value.trim(),
    pexelsKey: $("pexels").value.trim(),
    model: $("model").value.trim(),
    voice: $("voice").value,
    topic: $("topic").value.trim()
  };
  if (!cfg.openaiKey || !cfg.pexelsKey) {
    alert("Nhập OpenAI API Key và Pexels API Key trước nhé."); return;
  }
  $("generate").disabled = true;
  $("result").textContent = "";
  $("log").innerHTML = "";
  setState("ĐANG CHẠY", 5);
  log("Đã bắt đầu quy trình tự động...");
  try {
    await window.studio.createVideo(cfg);
  } catch (e) {
    setState("CÓ LỖI", 0); log("LỖI: "+e.message, "bad");
    $("result").textContent = "Kiểm tra API key, model, kết nối Internet hoặc nhật ký lỗi.";
  } finally {
    $("generate").disabled = false;
  }
});
$("open").addEventListener("click", () => window.studio.openOutput());
