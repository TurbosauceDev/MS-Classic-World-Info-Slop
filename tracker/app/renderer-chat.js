// Chat windows, tracker-window side (core/chatlines.js has the colour rules; the reader worker scans the chat box on every read it
// is asked to and sends back only the lines that are new since the last read, each as a small black-on-white picture). Those
// go through OCR one at a time here (a message appears once, so there is nothing to cache), get parsed, and ride the overlay
// snapshot to the Chat window cards (overlay.js RENDER.chat). Nothing is written to disk or the log: chat holds player names.
// ovChatOn lives in renderer-journal.js (load order). Screen pixels only.
const ovChat = [];   // {t, cls, time, who, dir?, text}, newest last, 60 kept
let chatQ = [], chatBusy = false;
function chatWant(want){ if (ovChatOn){ want.chatScan = true; want.chatArea = settings.chatArea || null } }
function chatSnap(){ return ovChatOn ? ovChat.slice(-40) : [] }
function chatIngest(c){
  if (!ovChatOn || !c?.items?.length) return;
  for (const it of c.items) chatQ.push(it);
  if (chatQ.length > 24) chatQ.splice(0, chatQ.length - 24);   // a flood: the oldest are dropped, the newest kept
  chatPump();
}
async function chatPump(){
  if (chatBusy) return;
  chatBusy = true;
  try {
    while (chatQ.length && ovChatOn){
      const it = chatQ.shift(), t0 = Date.now(); let text = "";
      try { text = await host.ocr(await toPng(it.crop)) } catch {}
      perf("chat", Date.now() - t0);
      const m = text && GrindChat.parse(text, it.cls);
      if (m && m.text){ ovChat.push({t: Date.now(), cls: it.cls, ...m, text: m.text.slice(0, 240)}); if (ovChat.length > 60) ovChat.shift(); try { ovSend?.(true) } catch {} }
    }
  } finally { chatBusy = false; if (!ovChatOn) chatQ = [] }
}
